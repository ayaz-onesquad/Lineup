-- Migration 053: Fix documents updated_by foreign key
-- This migration was intended to fix the updated_by foreign key constraint.
-- The constraint was already properly set up in previous migrations.

-- No-op migration to maintain migration sequence
SELECT 1;
