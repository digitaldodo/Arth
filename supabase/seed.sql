-- Seed Data for Local Development & Testing
-- Non-financial seed data only (taxonomies & reference values)

-- Note: The trigger `fn_handle_new_user()` in Migration 0006 automatically seeds
-- default categories when users sign up. This file provides an idempotent reference
-- template for test environments.

-- Default category reference names:
-- Expense: Food & Dining, Transport, Housing, Utilities, Healthcare, Entertainment, Shopping, Education, Personal Care, Travel, Other Expense
-- Income: Salary, Freelance, Investments, Other Income
