# ALG Company Enterprise Backend Boilerplate Template

The official, production-grade PHP 8+ / MySQL REST API starter architecture for ALG Company. This boilerplate houses the **reusable infrastructure (Modules 01–39 & 40–79)** so every new ALG application (ALG School OS, Kustomers, Now Launch, AI Assistants, SaaS) can be cloned, configured, and deployed in under 5 minutes without writing infrastructure code repeatedly.

---

## 🏗️ 79-Module Enterprise Architecture Overview

```
alg-company-backend-boilerplate/
├── .env.example                # 03. Environment Variable Template
├── .htaccess                   # 16. Security & Apache URL Routing
├── config.php                  # 02. Central Configuration & JWT Registry
├── README.md                   # 62. Documentation
├── database/                   # 05. Database Engine
│   ├── schema.sql              # Multi-Tenant SQL DDL Schema
│   └── seed.sql                # Default Super Admin, Roles & Permissions
└── api/                        # 11. REST API Layer
    ├── health.php              # 32. Observability & Health Check (/api/health.php)
    ├── auth/                   # 07/08. Authentication & JWT Tokens
    │   └── login.php
    ├── users/                  # 09. User Management
    ├── organizations/          # 10. Multi-Tenancy Organization & Tenant Isolation
    ├── leads/                  # Form Submissions & Lead Capture
    ├── payments/               # 28/29/34. Paystack, Flutterwave & Stripe Checkout
    │   └── checkout.php
    ├── ai/                     # 40/41. LLM Abstraction Engine (OpenAI, Gemini, Anthropic)
    │   └── generate.php
    └── statistics/             # 26. Analytics & Dashboard Metrics
```

---

## ⚡ Quickstart Guide

### 1. Database Initialization
Import `database/schema.sql` and `database/seed.sql` into MySQL:

```bash
mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS alg_company_db;"
mysql -u root -p alg_company_db < database/schema.sql
mysql -u root -p alg_company_db < database/seed.sql
```

### 2. Environment Configuration
Copy `.env.example` to `.env` and set your credentials:

```ini
APP_NAME="ALG Company Starter Project"
APP_ENV=development
DB_HOST=127.0.0.1
DB_NAME=alg_company_db
DB_USER=root
DB_PASS=
JWT_SECRET=super_secret_alg_jwt_token_key_2026
PAYSTACK_SECRET_KEY=sk_test_...
OPENAI_API_KEY=sk-...
GEMINI_API_KEY=...
```

---

## 📋 Pre-Built API Endpoints Matrix

| Module | Endpoint Path | Method | Description | Auth |
|--------|---------------|--------|-------------|------|
| **Observability** | `/api/health.php` | `GET` | Health check & service readiness | ❌ No |
| **Auth** | `/api/auth/login.php` | `POST` | Authenticate user & issue JWT token | ❌ No |
| **Leads** | `/api/leads/create.php` | `POST` | Capture landing page lead form | ❌ No |
| **Leads** | `/api/leads/list.php` | `GET` | Fetch lead submissions table | 🔒 Admin |
| **Payments** | `/api/payments/checkout.php` | `POST` | Paystack / Stripe checkout initialization | ❌ No |
| **AI LLM** | `/api/ai/generate.php` | `POST` | LLM text completion abstraction | 🔒 User |
| **Analytics** | `/api/statistics/summary.php` | `GET` | Dashboard KPI metrics & chart data | 🔒 Admin |

---

## 🔒 Standard API Response Contract

All API responses follow the uniform response structure:

```json
{
  "status": "success",
  "message": "Operation completed successfully.",
  "data": { ... },
  "timestamp": "2026-09-14T00:30:00Z"
}
```
