<?php
namespace Alg\Core;

/**
 * ALG Studio Engine - Database Migration Runner & Schema Engine
 *
 * Manages SQL schema versioning, incremental migrations, and rollback batches.
 *
 * Supported migration files (executed in filename order):
 *   - *.php  A class (StudlyCase of the filename after the numeric prefix) with
 *            an `up(\PDO $db): void` method. e.g. 2026_10_15_000015_foo.php
 *            -> class Foo { public function up(\PDO $db): void {...} }
 *   - *.sql  Raw SQL, executed as one batch. Keep statements idempotent where
 *            possible (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
 *
 * Applied migrations are recorded in the `_migrations` table. `baseline()`
 * records every file on disk as applied WITHOUT executing it — use it once to
 * adopt an existing database that was built by hand, then `migrate()` applies
 * only new files from then on.
 */
class Migration {
    private \PDO $db;
    private string $migrationsDir;

    public function __construct(\PDO $db) {
        $this->db = $db;
        $this->migrationsDir = __DIR__ . '/../../database/migrations';
        $this->ensureMigrationTable();
    }

    /**
     * Creates `_migrations` tracking table if it doesn't exist
     */
    private function ensureMigrationTable(): void {
        $sql = "CREATE TABLE IF NOT EXISTS `_migrations` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `migration` VARCHAR(255) NOT NULL,
            `batch` INT NOT NULL,
            `executed_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;";
        $this->db->exec($sql);
    }

    /**
     * Every migration file on disk (*.php + *.sql), ordered by filename.
     *
     * @return string[] absolute paths
     */
    public function files(): array {
        if (!is_dir($this->migrationsDir)) {
            mkdir($this->migrationsDir, 0755, true);
        }
        $files = array_merge(
            glob($this->migrationsDir . '/*.php') ?: [],
            glob($this->migrationsDir . '/*.sql') ?: []
        );
        sort($files, SORT_STRING);
        return $files;
    }

    /**
     * Filenames already recorded as applied.
     *
     * @return string[]
     */
    public function applied(): array {
        $stmt = $this->db->query("SELECT migration FROM `_migrations`");
        return $stmt->fetchAll(\PDO::FETCH_COLUMN) ?: [];
    }

    /**
     * Filenames present on disk but not yet applied.
     *
     * @return string[]
     */
    public function pending(): array {
        $applied = $this->applied();
        $out = [];
        foreach ($this->files() as $file) {
            $name = basename($file);
            if (!in_array($name, $applied, true)) {
                $out[] = $name;
            }
        }
        return $out;
    }

    /**
     * Executes all pending migration files (*.php and *.sql).
     *
     * @return string[] filenames applied in this run
     */
    public function migrate(): array {
        $applied = $this->applied();
        $batch = $this->getNextBatchNumber();
        $executed = [];

        foreach ($this->files() as $file) {
            $filename = basename($file);
            if (in_array($filename, $applied, true)) {
                continue;
            }

            $this->runFile($file);

            $this->record($filename, $batch);
            $executed[] = $filename;
        }

        return $executed;
    }

    /**
     * Marks migration files on disk as applied WITHOUT executing them. Safe to
     * re-run; only records files that are not already tracked. Returns the
     * filenames newly recorded.
     *
     * Use once to adopt a database whose schema was applied by hand. Pass
     * $through (a migration filename) to baseline only files up to and
     * including it (files are compared in filename order), leaving newer,
     * genuinely-unapplied migrations pending.
     *
     * @return string[]
     */
    public function baseline(?string $through = null): array {
        $applied = $this->applied();
        $batch = $this->getNextBatchNumber();
        $marked = [];

        foreach ($this->files() as $file) {
            $filename = basename($file);
            if ($through !== null && strcmp($filename, $through) > 0) {
                break; // files are sorted — everything after the boundary stays pending
            }
            if (in_array($filename, $applied, true)) {
                continue;
            }
            $this->record($filename, $batch);
            $marked[] = $filename;
        }

        return $marked;
    }

    /**
     * Executes a single migration file.
     */
    private function runFile(string $file): void {
        if (strtolower(substr($file, -4)) === '.php') {
            require_once $file;
            $className = $this->getClassNameFromFile(basename($file));
            if (!class_exists($className)) {
                throw new \RuntimeException("Migration class {$className} not found in " . basename($file));
            }
            $instance = new $className();
            if (!method_exists($instance, 'up')) {
                throw new \RuntimeException("Migration {$className} has no up() method.");
            }
            $instance->up($this->db);
            return;
        }

        // Raw SQL migration — execute the whole file as one batch.
        $sql = file_get_contents($file);
        if ($sql === false || trim($sql) === '') {
            return;
        }
        $this->db->exec($sql);
    }

    /**
     * Records a migration filename as applied in the given batch.
     */
    private function record(string $filename, int $batch): void {
        $insStmt = $this->db->prepare("INSERT INTO `_migrations` (migration, batch) VALUES (:m, :b)");
        $insStmt->execute([':m' => $filename, ':b' => $batch]);
    }

    private function getNextBatchNumber(): int {
        $stmt = $this->db->query("SELECT MAX(batch) FROM `_migrations`");
        $max = $stmt->fetchColumn();
        return ($max ? (int)$max : 0) + 1;
    }

    private function getClassNameFromFile(string $filename): string {
        $name = preg_replace('/^\d+_\d+_\d+_\d+_/', '', $filename);
        $name = str_replace('.php', '', $name);
        $parts = explode('_', $name);
        return implode('', array_map('ucfirst', $parts));
    }
}
