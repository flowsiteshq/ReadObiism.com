-- ALG Company Backend Master Seed File

INSERT INTO `organizations` (`id`, `name`, `slug`, `status`) VALUES
(1, 'ALG Institute Studio', 'alg-studio', 'active');

INSERT INTO `users` (`id`, `org_id`, `name`, `email`, `password_hash`, `role`, `status`) VALUES
(1, 1, 'Admin User', 'admin@alg.company', '$2y$10$e0MYzXyjpJS7Pd0RVvHwHe1T9W4P.s6E0P8m9f7B8m6X.q9u1lK.K', 'super_admin', 'active');

INSERT INTO `permissions` (`key`, `description`) VALUES
('users.view', 'View user directory'),
('users.create', 'Create new user accounts'),
('users.update', 'Update user profiles'),
('users.delete', 'Delete or deactivate users'),
('projects.view', 'View project portfolios'),
('payments.refund', 'Issue payment refunds');

INSERT INTO `leads` (`org_id`, `name`, `email`, `phone`, `subject`, `message`, `status`) VALUES
(1, 'Sarah Jenkins', 'sarah@acme.corp', '+1 555-0192', 'Web Design Project', 'Looking to redesign our corporate website.', 'new'),
(1, 'Michael Chang', 'michael@tech.io', '+1 555-0144', 'API Integration Consultation', 'Need help integrating REST API backend.', 'contacted');

INSERT INTO `system_settings` (`setting_key`, `setting_value`) VALUES
('project_name', 'ALG Company Starter Project'),
('support_email', 'support@alg.company'),
('default_currency', 'USD'),
('default_timezone', 'UTC');
