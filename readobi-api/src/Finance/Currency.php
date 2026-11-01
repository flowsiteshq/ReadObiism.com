<?php
/**
 * ALG School OS — Currency helpers
 *
 * Centralises base-currency resolution and foreign→base exchange-rate lookup so
 * the finance endpoints agree on how multi-currency amounts are converted.
 */

namespace Alg\Finance;

class Currency {
    public const DEFAULT_BASE = ['code' => 'NGN', 'name' => 'Nigerian Naira', 'symbol' => '₦'];

    /**
     * Return the school's base currency, creating the NGN default when absent.
     * @return array{id:int,code:string,name:string,symbol:string}
     */
    public static function ensureBase(\PDO $db, int $orgId): array {
        $stmt = $db->prepare("SELECT id, code, name, symbol FROM currencies WHERE org_id = :org AND is_base = 1 ORDER BY id LIMIT 1");
        $stmt->execute([':org' => $orgId]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        if ($row) {
            return [
                'id'     => (int)$row['id'],
                'code'   => (string)$row['code'],
                'name'   => (string)$row['name'],
                'symbol' => (string)$row['symbol'],
            ];
        }

        // Promote an existing currency, otherwise create the default.
        $existing = $db->prepare("SELECT id, code, name, symbol FROM currencies WHERE org_id = :org ORDER BY id LIMIT 1");
        $existing->execute([':org' => $orgId]);
        $row = $existing->fetch(\PDO::FETCH_ASSOC);
        if ($row) {
            $db->prepare("UPDATE currencies SET is_base = 1 WHERE id = :id")->execute([':id' => (int)$row['id']]);
            return [
                'id'     => (int)$row['id'],
                'code'   => (string)$row['code'],
                'name'   => (string)$row['name'],
                'symbol' => (string)$row['symbol'],
            ];
        }

        $ins = $db->prepare("
            INSERT INTO currencies (org_id, code, name, symbol, is_base, active, created_at)
            VALUES (:org, :code, :name, :symbol, 1, 1, NOW())
        ");
        $ins->execute([
            ':org'    => $orgId,
            ':code'   => self::DEFAULT_BASE['code'],
            ':name'   => self::DEFAULT_BASE['name'],
            ':symbol' => self::DEFAULT_BASE['symbol'],
        ]);
        return [
            'id'     => (int)$db->lastInsertId(),
            'code'   => self::DEFAULT_BASE['code'],
            'name'   => self::DEFAULT_BASE['name'],
            'symbol' => self::DEFAULT_BASE['symbol'],
        ];
    }

    /** Look up an active currency by code within a school. */
    public static function findByCode(\PDO $db, int $orgId, string $code): ?array {
        $stmt = $db->prepare("SELECT id, code, name, symbol, is_base, active FROM currencies WHERE org_id = :org AND code = :code LIMIT 1");
        $stmt->execute([':org' => $orgId, ':code' => $code]);
        $row = $stmt->fetch(\PDO::FETCH_ASSOC);
        return $row ?: null;
    }

    /** Most recent exchange rate (foreign → base) for a currency id. */
    public static function latestRate(\PDO $db, int $currencyId): ?float {
        $stmt = $db->prepare("
            SELECT rate FROM exchange_rates
            WHERE currency_id = :cid
            ORDER BY effective_date DESC, id DESC
            LIMIT 1
        ");
        $stmt->execute([':cid' => $currencyId]);
        $rate = $stmt->fetchColumn();
        return $rate === false ? null : (float)$rate;
    }
}
