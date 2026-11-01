-- ALG Company Backend Master Multi-Tenant DDL Schema (79-Point Enterprise Specification)

SET FOREIGN_KEY_CHECKS = 0;

-- 10. Multi-Tenancy Organizations
CREATE TABLE IF NOT EXISTS `organizations` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `slug` VARCHAR(150) NOT NULL UNIQUE,
  `logo_url` VARCHAR(255) DEFAULT NULL,
  `primary_color` VARCHAR(30) DEFAULT '#6366f1',
  `domain` VARCHAR(150) DEFAULT NULL,
  `status` ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 09. User Management
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `org_id` INT DEFAULT 1,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL UNIQUE,
  `phone` VARCHAR(30) DEFAULT NULL,
  `password_hash` VARCHAR(255) NOT NULL,
  `avatar_url` VARCHAR(255) DEFAULT NULL,
  `role` ENUM('super_admin', 'admin', 'manager', 'staff', 'user') DEFAULT 'user',
  `status` ENUM('active', 'pending', 'deactivated') DEFAULT 'active',
  `email_verified_at` DATETIME DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at` DATETIME DEFAULT NULL,
  FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 08. Roles & Permissions (RBAC)
CREATE TABLE IF NOT EXISTS `permissions` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `key` VARCHAR(100) NOT NULL UNIQUE,
  `description` VARCHAR(255) DEFAULT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role` VARCHAR(50) NOT NULL,
  `permission_id` INT NOT NULL,
  PRIMARY KEY (`role`, `permission_id`),
  FOREIGN KEY (`permission_id`) REFERENCES `permissions`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 08. Refresh Tokens (JWT Rotation & Revocation)
CREATE TABLE IF NOT EXISTS `refresh_tokens` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `org_id` INT DEFAULT 1,
  `token` VARCHAR(255) NOT NULL UNIQUE,
  `expires_at` DATETIME NOT NULL,
  `revoked` TINYINT(1) DEFAULT 0,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `user_agent` TEXT DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 08. Password Resets
CREATE TABLE IF NOT EXISTS `password_resets` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `email` VARCHAR(150) NOT NULL,
  `token` VARCHAR(255) NOT NULL UNIQUE,
  `expires_at` DATETIME NOT NULL,
  `used` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 08/22. OTP Verification Codes (2FA & Passwordless)
CREATE TABLE IF NOT EXISTS `otp_codes` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT DEFAULT NULL,
  `code` VARCHAR(64) NOT NULL,
  `purpose` VARCHAR(50) DEFAULT 'login',
  `expires_at` DATETIME NOT NULL,
  `used` TINYINT(1) DEFAULT 0,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15/16. File & Media Management
CREATE TABLE IF NOT EXISTS `media_files` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `org_id` INT DEFAULT 1,
  `user_id` INT DEFAULT NULL,
  `original_name` VARCHAR(255) NOT NULL,
  `filename` VARCHAR(255) NOT NULL UNIQUE,
  `file_path` VARCHAR(255) NOT NULL,
  `public_url` VARCHAR(255) NOT NULL,
  `file_size` BIGINT NOT NULL,
  `mime_type` VARCHAR(100) NOT NULL,
  `storage_driver` VARCHAR(50) DEFAULT 'local',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  `deleted_at` DATETIME DEFAULT NULL,
  FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17. Email Logs
CREATE TABLE IF NOT EXISTS `email_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `recipient` VARCHAR(150) NOT NULL,
  `subject` VARCHAR(255) NOT NULL,
  `template` VARCHAR(100) DEFAULT NULL,
  `status` ENUM('sent', 'failed', 'queued') DEFAULT 'sent',
  `error` TEXT DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Form Submissions & Leads
CREATE TABLE IF NOT EXISTS `leads` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `org_id` INT DEFAULT 1,
  `name` VARCHAR(100) NOT NULL,
  `email` VARCHAR(150) NOT NULL,
  `phone` VARCHAR(30) DEFAULT NULL,
  `subject` VARCHAR(200) DEFAULT 'New Inquiry',
  `message` TEXT NOT NULL,
  `status` ENUM('new', 'contacted', 'closed') DEFAULT 'new',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 28/29. Payments & Subscriptions
CREATE TABLE IF NOT EXISTS `payments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `org_id` INT DEFAULT 1,
  `user_id` INT NOT NULL,
  `reference` VARCHAR(100) NOT NULL UNIQUE,
  `provider` ENUM('paystack', 'flutterwave', 'stripe', 'paypal', 'opay') DEFAULT 'paystack',
  `amount` DECIMAL(10,2) NOT NULL,
  `currency` VARCHAR(10) DEFAULT 'USD',
  `status` ENUM('pending', 'successful', 'failed', 'refunded') DEFAULT 'pending',
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`org_id`) REFERENCES `organizations`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 27/30. Audit Logs
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `org_id` INT DEFAULT 1,
  `user_id` INT DEFAULT NULL,
  `action` VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(100) DEFAULT NULL,
  `entity_id` INT DEFAULT NULL,
  `ip_address` VARCHAR(45) DEFAULT NULL,
  `before_state` JSON DEFAULT NULL,
  `after_state` JSON DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 40/41. AI Logs
CREATE TABLE IF NOT EXISTS `ai_usage_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `provider` VARCHAR(50) NOT NULL,
  `model` VARCHAR(100) NOT NULL,
  `prompt_tokens` INT DEFAULT 0,
  `completion_tokens` INT DEFAULT 0,
  `cost_estimate` DECIMAL(10,6) DEFAULT 0.000000,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 44. Settings System
CREATE TABLE IF NOT EXISTS `system_settings` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `setting_key` VARCHAR(100) NOT NULL UNIQUE,
  `setting_value` TEXT DEFAULT NULL,
  `updated_at` DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
