<?php

/**
 * Migration: CreateInitialSchema
 * Creates core database tables: users, leads, organizations, and audit_logs.
 */
class CreateInitialSchema {
    public function up(\PDO $db): void {
        $sql = "
        CREATE TABLE IF NOT EXISTS `users` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(150) NOT NULL,
            `email` VARCHAR(150) NOT NULL UNIQUE,
            `password_hash` VARCHAR(255) NOT NULL,
            `role` VARCHAR(50) DEFAULT 'user',
            `organization_id` INT DEFAULT 1,
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS `leads` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(150) NOT NULL,
            `email` VARCHAR(150) NOT NULL,
            `phone` VARCHAR(50) NULL,
            `company` VARCHAR(150) NULL,
            `source` VARCHAR(100) DEFAULT 'Direct',
            `status` VARCHAR(50) DEFAULT 'New',
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

        CREATE TABLE IF NOT EXISTS `organizations` (
            `id` INT AUTO_INCREMENT PRIMARY KEY,
            `name` VARCHAR(150) NOT NULL,
            `slug` VARCHAR(100) NOT NULL UNIQUE,
            `plan` VARCHAR(50) DEFAULT 'free',
            `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
        ";

        $db->exec($sql);
    }

    public function down(\PDO $db): void {
        $db->exec("DROP TABLE IF EXISTS `leads`, `users`, `organizations`;");
    }
}
