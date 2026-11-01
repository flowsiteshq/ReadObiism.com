<?php
/**
 * ALG Company - Universal Enterprise Error & Exception Engine
 * 
 * Provides:
 * - Granular SQL error interception (Duplicate keys, Foreign keys, Syntax, Missing tables)
 * - Structured JSON error contract with standardized error codes & HTTP status mapping
 * - Request ID tracking for log and frontend correlation
 * - Safe production sanitization vs comprehensive debug mode with stack traces
 * - Fatal PHP error interception via shutdown handler (guarantees valid JSON)
 * - Malformed request body & payload syntax detection
 */

namespace Alg\Audit;

class ErrorHandler {
    protected static $requestId = null;

    /**
     * Get or generate a unique request ID
     */
    public static function getRequestId(): string {
        if (self::$requestId === null) {
            self::$requestId = 'req_' . bin2hex(random_bytes(8));
        }
        return self::$requestId;
    }

    /**
     * Register global PHP exception, error, and fatal shutdown handlers
     */
    public static function register(): void {
        // Set error reporting
        error_reporting(E_ALL);

        // Global Exception Handler
        set_exception_handler([self::class, 'handleException']);

        // PHP Error to Exception / Logger Handler
        set_error_handler([self::class, 'handlePhpError']);

        // Shutdown Handler for Fatal PHP Errors (e.g. out of memory, parse error)
        register_shutdown_function([self::class, 'handleShutdown']);
    }

    /**
     * Catch all Throwables (Exception and Error)
     */
    public static function handleException(\Throwable $e): void {
        $isDebug = self::isDebugEnabled();
        $requestId = self::getRequestId();
        $statusCode = 500;
        $errorCode = 'INTERNAL_SERVER_ERROR';
        $message = "An unexpected server error occurred.";
        $fieldErrors = [];
        $sqlDetails = null;

        // 1. Specialized SQL / Database Error Interception
        if ($e instanceof \PDOException) {
            $parsedSql = self::parsePdoException($e);
            $statusCode = $parsedSql['status_code'];
            $errorCode = $parsedSql['error_code'];
            $message = $parsedSql['message'];
            $fieldErrors = $parsedSql['fields'];
            $sqlDetails = $parsedSql['sql_details'];
        } 
        // 2. Custom or HTTP Exceptions
        elseif ($e instanceof \InvalidArgumentException) {
            $statusCode = 422;
            $errorCode = 'VALIDATION_FAILED';
            $message = $e->getMessage();
        } 
        elseif ($e->getCode() >= 400 && $e->getCode() <= 599) {
            $statusCode = (int)$e->getCode();
            $errorCode = 'HTTP_ERROR_' . $statusCode;
            $message = $e->getMessage();
        } 
        else {
            if ($isDebug) {
                $message = $e->getMessage();
            }
        }

        // Build Response
        $response = [
            'success'     => false,
            'status'      => 'error',
            'status_code' => $statusCode,
            'code'        => $errorCode,
            'message'     => $message,
            'request_id'  => $requestId,
            'method'      => $_SERVER['REQUEST_METHOD'] ?? 'GET',
            'path'        => $_SERVER['REQUEST_URI'] ?? '',
            'timestamp'   => date('c')
        ];

        if (!empty($fieldErrors)) {
            $response['errors'] = $fieldErrors;
        }

        if ($isDebug) {
            $response['debug'] = [
                'exception' => get_class($e),
                'file'      => $e->getFile(),
                'line'      => $e->getLine(),
                'trace'     => explode("\n", $e->getTraceAsString())
            ];
            if ($sqlDetails) {
                $response['debug']['sql'] = $sqlDetails;
            }
        }

        // Log error to server error log
        error_log("[ALG-ERROR] [{$requestId}] [{$statusCode}] {$errorCode}: " . $e->getMessage() . " in " . $e->getFile() . ":" . $e->getLine());

        self::outputJson($response, $statusCode);
    }

    /**
     * Intercept and parse PDOException into actionable HTTP status & codes
     */
    protected static function parsePdoException(\PDOException $e): array {
        $rawMessage = $e->getMessage();
        $sqlState = $e->getCode();
        $fields = [];
        $sqlDetails = [
            'sql_state' => $sqlState,
            'raw_error' => $rawMessage
        ];

        // Default SQL failure
        $statusCode = 500;
        $errorCode = 'DATABASE_ERROR';
        $message = "A database operation failed.";

        // A. Duplicate Key / Unique Constraint (SQLSTATE 23000, MySQL error 1062)
        if (strpos($rawMessage, '1062') !== false || strpos($rawMessage, 'Duplicate entry') !== false) {
            $statusCode = 409;
            $errorCode = 'SQL_DUPLICATE_ENTRY';
            
            // Extract duplicate value and column name
            if (preg_match("/Duplicate entry '([^']+)' for key '([^']+)'/", $rawMessage, $matches)) {
                $duplicateValue = $matches[1];
                $keyName = $matches[2];
                $cleanField = self::cleanKeyName($keyName);
                $message = "A record with this '{$cleanField}' ({$duplicateValue}) already exists.";
                $fields[$cleanField] = "Value '{$duplicateValue}' is already registered.";
            } else {
                $message = "A record with matching unique data already exists.";
            }
        }
        // B. Foreign Key Constraint Fails (SQLSTATE 23000, MySQL error 1451 / 1452)
        elseif (strpos($rawMessage, '1452') !== false || strpos($rawMessage, 'foreign key constraint fails') !== false) {
            $statusCode = 422;
            $errorCode = 'SQL_FOREIGN_KEY_CONSTRAINT';
            $message = "The referenced organization, user, or parent record does not exist.";
        }
        // C. Missing Table / Table Not Found (SQLSTATE 42S02, MySQL error 1146)
        elseif (strpos($rawMessage, '1146') !== false || strpos($rawMessage, "doesn't exist") !== false) {
            $statusCode = 500;
            $errorCode = 'SQL_TABLE_NOT_FOUND';
            if (preg_match("/Table '([^']+)' doesn't exist/", $rawMessage, $matches)) {
                $message = "Database table '{$matches[1]}' does not exist. Please run database migrations.";
            } else {
                $message = "A required database table is missing.";
            }
        }
        // D. Unknown Column (SQLSTATE 42S22, MySQL error 1054)
        elseif (strpos($rawMessage, '1054') !== false || strpos($rawMessage, 'Unknown column') !== false) {
            $statusCode = 500;
            $errorCode = 'SQL_UNKNOWN_COLUMN';
            if (preg_match("/Unknown column '([^']+)'/", $rawMessage, $matches)) {
                $message = "Column '{$matches[1]}' was not found in table schema.";
            } else {
                $message = "Database schema mismatch. Unknown column in query.";
            }
        }
        // E. SQL Syntax Error (SQLSTATE 42000, MySQL error 1064)
        elseif (strpos($rawMessage, '1064') !== false) {
            $statusCode = 500;
            $errorCode = 'SQL_SYNTAX_ERROR';
            $message = "Database query syntax error.";
        }
        // F. Connection Refused / Server Gone Away (MySQL error 2002 / 2006)
        elseif (strpos($rawMessage, '2002') !== false || strpos($rawMessage, 'Connection refused') !== false) {
            $statusCode = 503;
            $errorCode = 'DATABASE_UNAVAILABLE';
            $message = "Could not connect to database server. Please check DB_HOST and DB_PORT settings.";
        }

        return [
            'status_code' => $statusCode,
            'error_code'  => $errorCode,
            'message'     => $message,
            'fields'      => $fields,
            'sql_details' => $sqlDetails
        ];
    }

    /**
     * Parse raw MySQL index/constraint names to user-friendly field names
     */
    protected static function cleanKeyName(string $key): string {
        $parts = explode('.', $key);
        $name = end($parts);
        // Remove common index suffixes (e.g. users_email_unique -> email)
        $name = preg_replace('/^(.*_)?([a-zA-Z0-9_]+)_(unique|idx|foreign)$/', '$2', $name);
        return $name ?: $key;
    }

    /**
     * Intercept Fatal PHP errors upon script shutdown
     */
    public static function handleShutdown(): void {
        $error = error_get_last();
        if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR, E_USER_ERROR])) {
            if (ob_get_length()) {
                ob_clean();
            }

            $requestId = self::getRequestId();
            $isDebug = self::isDebugEnabled();

            $response = [
                'status'     => 'error',
                'code'       => 'PHP_FATAL_ERROR',
                'message'    => $isDebug ? $error['message'] : 'A critical server error occurred.',
                'request_id' => $requestId,
                'timestamp'  => date('c')
            ];

            if ($isDebug) {
                $response['debug'] = [
                    'type' => $error['type'],
                    'file' => $error['file'],
                    'line' => $error['line']
                ];
            }

            self::outputJson($response, 500);
        }
    }

    /**
     * PHP Warning / Notice Handler
     */
    public static function handlePhpError(int $errno, string $errstr, string $errfile, int $errline): bool {
        // Suppressed errors (@ operator)
        if (!(error_reporting() & $errno)) {
            return false;
        }

        error_log("[ALG-PHP-NOTICE] [{$errno}] {$errstr} in {$errfile}:{$errline}");
        return true;
    }

    /**
     * Format and output JSON with proper HTTP response code
     */
    public static function outputJson(array $data, int $statusCode = 200): void {
        if (!headers_sent()) {
            http_response_code($statusCode);
            header("Content-Type: application/json; charset=UTF-8");
        }
        echo json_encode($data, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT);
        exit();
    }

    /**
     * Check if debug mode is active (STRICT: Never leak debug info in production)
     */
    public static function isDebugEnabled(): bool {
        $env = strtolower(alg_env('APP_ENV', \Config::get('app_env', 'production')));
        if ($env === 'production' || $env === 'prod' || $env === 'staging') {
            return false;
        }

        $debug = alg_env('APP_DEBUG', \Config::get('app_debug', 'false'));
        return ($debug === 'true' || $debug === '1' || $debug === 1 || $debug === true);
    }
}
