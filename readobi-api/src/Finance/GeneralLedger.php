<?php
/**
 * ALG School OS — Double-Entry General Ledger
 *
 * Provides the minimal accounting primitives the finance module needs:
 *   - provisioning a default chart of accounts per school
 *   - posting balanced journal entries (and rolling them into account balances)
 *
 * Balances in `chart_of_accounts.balance` are kept at their natural sign:
 *   asset / expense          -> debit increases, credit decreases
 *   liability / equity / revenue -> credit increases, debit decreases
 */

namespace Alg\Finance;

class GeneralLedger {
    /**
     * Accounts every school starts with. Keyed by a stable role name so callers
     * never hard-code account codes.
     */
    public const DEFAULT_ACCOUNTS = [
        'cash'        => ['code' => '1000', 'name' => 'Cash & Bank',           'type' => 'asset'],
        'ar'          => ['code' => '1200', 'name' => 'Accounts Receivable',   'type' => 'asset'],
        'tax_payable' => ['code' => '2200', 'name' => 'Tax Payable',           'type' => 'liability'],
        'revenue'     => ['code' => '4000', 'name' => 'Tuition & Fee Revenue', 'type' => 'revenue'],
        'expense'     => ['code' => '5000', 'name' => 'Operating Expenses',    'type' => 'expense'],
        'payroll'     => ['code' => '5100', 'name' => 'Salaries & Wages',      'type' => 'expense'],
    ];

    /**
     * Return the id of the (org, code) account, creating it when absent.
     */
    public static function ensureAccount(\PDO $db, int $orgId, string $code, string $name, string $type): int {
        $stmt = $db->prepare("SELECT id FROM chart_of_accounts WHERE org_id = :org AND code = :code LIMIT 1");
        $stmt->execute([':org' => $orgId, ':code' => $code]);
        $id = $stmt->fetchColumn();
        if ($id) {
            return (int)$id;
        }
        $ins = $db->prepare("
            INSERT INTO chart_of_accounts (org_id, code, name, type, balance)
            VALUES (:org, :code, :name, :type, 0.00)
        ");
        $ins->execute([':org' => $orgId, ':code' => $code, ':name' => $name, ':type' => $type]);
        return (int)$db->lastInsertId();
    }

    /**
     * Ensure the default chart of accounts exists for a school.
     * @return array<string,int> role => account id (cash, ar, revenue, expense)
     */
    public static function defaultAccounts(\PDO $db, int $orgId): array {
        $out = [];
        foreach (self::DEFAULT_ACCOUNTS as $role => $spec) {
            $out[$role] = self::ensureAccount($db, $orgId, $spec['code'], $spec['name'], $spec['type']);
        }
        return $out;
    }

    /**
     * Post a balanced journal entry and roll it into chart_of_accounts.balance.
     *
     * @param array<int,array{account_id:int,debit?:float,credit?:float,description?:string}> $lines
     * @return int journal_entries.id (0 when there is nothing to post)
     * @throws \RuntimeException when the entry does not balance
     */
    public static function postEntry(
        \PDO $db,
        int $orgId,
        array $lines,
        string $memo = '',
        ?string $sourceType = null,
        ?int $sourceId = null,
        ?int $userId = null
    ): int {
        // Keep only non-zero legs.
        $lines = array_values(array_filter($lines, static function ($l) {
            return abs((float)($l['debit'] ?? 0)) > 0.0001 || abs((float)($l['credit'] ?? 0)) > 0.0001;
        }));
        if (empty($lines)) {
            return 0;
        }

        $totalDebit = 0.0;
        $totalCredit = 0.0;
        foreach ($lines as $l) {
            $totalDebit  += (float)($l['debit'] ?? 0);
            $totalCredit += (float)($l['credit'] ?? 0);
        }
        if (abs($totalDebit - $totalCredit) > 0.005) {
            throw new \RuntimeException(sprintf('Unbalanced journal entry: debit %.2f != credit %.2f', $totalDebit, $totalCredit));
        }

        $ownsTx = !$db->inTransaction();
        if ($ownsTx) {
            $db->beginTransaction();
        }

        try {
            $entryNo = self::nextEntryNo($db, $orgId);
            $insEntry = $db->prepare("
                INSERT INTO journal_entries
                    (org_id, entry_no, entry_date, memo, source_type, source_id, created_by, created_at)
                VALUES
                    (:org, :entry_no, CURDATE(), :memo, :source_type, :source_id, :created_by, NOW())
            ");
            $insEntry->execute([
                ':org'         => $orgId,
                ':entry_no'    => $entryNo,
                ':memo'        => $memo !== '' ? $memo : null,
                ':source_type' => $sourceType,
                ':source_id'   => $sourceId,
                ':created_by'  => $userId,
            ]);
            $entryId = (int)$db->lastInsertId();

            $insLine = $db->prepare("
                INSERT INTO journal_lines
                    (journal_entry_id, org_id, account_id, description, debit, credit, created_at)
                VALUES
                    (:entry, :org, :account, :description, :debit, :credit, NOW())
            ");
            $adjBalance = $db->prepare("UPDATE chart_of_accounts SET balance = balance + :delta WHERE id = :id");
            $typeStmt   = $db->prepare("SELECT type FROM chart_of_accounts WHERE id = :id LIMIT 1");

            foreach ($lines as $l) {
                $debit  = round((float)($l['debit'] ?? 0), 2);
                $credit = round((float)($l['credit'] ?? 0), 2);
                $accountId = (int)$l['account_id'];

                $insLine->execute([
                    ':entry'       => $entryId,
                    ':org'         => $orgId,
                    ':account'     => $accountId,
                    ':description' => $l['description'] ?? null,
                    ':debit'       => $debit,
                    ':credit'      => $credit,
                ]);

                $typeStmt->execute([':id' => $accountId]);
                $type = (string)$typeStmt->fetchColumn();
                $increasesOnDebit = ($type === 'asset' || $type === 'expense');
                $delta = $increasesOnDebit ? ($debit - $credit) : ($credit - $debit);
                $adjBalance->execute([':delta' => $delta, ':id' => $accountId]);
            }

            if ($ownsTx) {
                $db->commit();
            }
            return $entryId;
        } catch (\Throwable $e) {
            if ($ownsTx && $db->inTransaction()) {
                $db->rollBack();
            }
            throw $e;
        }
    }

    /**
     * Invoice raised: Debit Accounts Receivable, Credit Fee Revenue (+ Tax Payable).
     *
     * @param float $amount    net revenue (subtotal) in the base currency
     * @param float $taxAmount tax portion in the base currency
     * @return int journal_entries.id
     */
    public static function postInvoiceRaised(\PDO $db, int $orgId, int $invoiceId, float $amount, ?int $userId = null, string $reference = '', float $taxAmount = 0.0): int {
        if ($amount <= 0 && $taxAmount <= 0) {
            return 0;
        }
        $acc = self::defaultAccounts($db, $orgId);
        $memo = 'Invoice raised' . ($reference !== '' ? ' (' . $reference . ')' : '');
        $receivable = round($amount + $taxAmount, 2);
        $lines = [
            ['account_id' => $acc['ar'],      'debit'  => $receivable, 'credit' => 0,      'description' => $memo],
            ['account_id' => $acc['revenue'], 'debit'  => 0,          'credit' => $amount, 'description' => $memo],
        ];
        if (abs($taxAmount) > 0.0001) {
            $lines[] = ['account_id' => $acc['tax_payable'], 'debit' => 0, 'credit' => $taxAmount, 'description' => $memo . ' — tax'];
        }
        return self::postEntry($db, $orgId, $lines, $memo, 'invoice', $invoiceId, $userId);
    }

    /**
     * Payment received.
     *   - settling an invoice: Debit Cash, Credit Accounts Receivable
     *   - standalone (no invoice): Debit Cash, Credit Fee Revenue
     * @return int journal_entries.id
     */
    public static function postPaymentReceived(\PDO $db, int $orgId, int $paymentId, float $amount, ?int $userId = null, string $reference = '', bool $toReceivable = true): int {
        if ($amount <= 0) {
            return 0;
        }
        $acc = self::defaultAccounts($db, $orgId);
        $creditAccount = $toReceivable ? $acc['ar'] : $acc['revenue'];
        $memo = 'Payment received' . ($reference !== '' ? ' (' . $reference . ')' : '');
        return self::postEntry($db, $orgId, [
            ['account_id' => $acc['cash'],   'debit'  => $amount, 'credit' => 0,      'description' => $memo],
            ['account_id' => $creditAccount, 'debit'  => 0,      'credit' => $amount, 'description' => $memo],
        ], $memo, 'payment', $paymentId, $userId);
    }

    /**
     * Invoice voided: reverse the raise — Debit Fee Revenue (+ Tax Payable), Credit Accounts Receivable.
     *
     * @param float $amount    net revenue (subtotal) in the base currency
     * @param float $taxAmount tax portion in the base currency
     * @return int journal_entries.id
     */
    public static function postInvoiceVoided(\PDO $db, int $orgId, int $invoiceId, float $amount, ?int $userId = null, string $reference = '', float $taxAmount = 0.0): int {
        if ($amount <= 0 && $taxAmount <= 0) {
            return 0;
        }
        $acc = self::defaultAccounts($db, $orgId);
        $memo = 'Invoice voided' . ($reference !== '' ? ' (' . $reference . ')' : '');
        $receivable = round($amount + $taxAmount, 2);
        $lines = [
            ['account_id' => $acc['revenue'], 'debit'  => $amount, 'credit' => 0, 'description' => $memo],
        ];
        if (abs($taxAmount) > 0.0001) {
            $lines[] = ['account_id' => $acc['tax_payable'], 'debit' => $taxAmount, 'credit' => 0, 'description' => $memo . ' — tax'];
        }
        $lines[] = ['account_id' => $acc['ar'], 'debit' => 0, 'credit' => $receivable, 'description' => $memo];
        return self::postEntry($db, $orgId, $lines, $memo, 'invoice_void', $invoiceId, $userId);
    }

    /**
     * Expense paid: Debit Operating Expenses, Credit Cash & Bank.
     * @return int journal_entries.id
     */
    public static function postExpensePaid(\PDO $db, int $orgId, int $expenseId, float $amount, ?int $userId = null, string $reference = ''): int {
        if ($amount <= 0) {
            return 0;
        }
        $acc = self::defaultAccounts($db, $orgId);
        $memo = 'Expense paid' . ($reference !== '' ? ' (' . $reference . ')' : '');
        return self::postEntry($db, $orgId, [
            ['account_id' => $acc['expense'], 'debit'  => $amount, 'credit' => 0,      'description' => $memo],
            ['account_id' => $acc['cash'],    'debit'  => 0,      'credit' => $amount, 'description' => $memo],
        ], $memo, 'expense', $expenseId, $userId);
    }

    /**
     * Payroll paid: Debit Salaries & Wages, Credit Cash & Bank.
     * @return int journal_entries.id
     */
    public static function postPayrollPaid(\PDO $db, int $orgId, int $payrollRunId, float $amount, ?int $userId = null, string $reference = ''): int {
        if ($amount <= 0) {
            return 0;
        }
        $acc = self::defaultAccounts($db, $orgId);
        $memo = 'Payroll' . ($reference !== '' ? ' (' . $reference . ')' : '');
        return self::postEntry($db, $orgId, [
            ['account_id' => $acc['payroll'], 'debit'  => $amount, 'credit' => 0,      'description' => $memo],
            ['account_id' => $acc['cash'],    'debit'  => 0,      'credit' => $amount, 'description' => $memo],
        ], $memo, 'payroll', $payrollRunId, $userId);
    }

    /** Generate a per-school unique entry number (JE-YYYYMMDD-XXXXXX). */
    private static function nextEntryNo(\PDO $db, int $orgId): string {
        $prefix = 'JE-' . date('Ymd') . '-';
        for ($attempt = 0; $attempt < 5; $attempt++) {
            $candidate = $prefix . str_pad((string)random_int(1, 999999), 6, '0', STR_PAD_LEFT);
            $stmt = $db->prepare("SELECT 1 FROM journal_entries WHERE org_id = :org AND entry_no = :no LIMIT 1");
            $stmt->execute([':org' => $orgId, ':no' => $candidate]);
            if (!$stmt->fetchColumn()) {
                return $candidate;
            }
        }
        // Fall back to a time-based value (collision practically impossible).
        return $prefix . substr((string)microtime(true), -6);
    }
}
