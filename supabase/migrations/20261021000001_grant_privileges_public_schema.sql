-- ==============================================================================
-- MIGRATION: 20261021000001_grant_privileges_public_schema.sql
-- DESCRIPTION: Supabase Oct 30 Breaking Change - Explicit Grants & Default Privileges
-- ==============================================================================
-- Supabase is stopping automatic Data API grants for newly created tables in "public"
-- starting October 30, 2026. This migration sets default privileges and grants
-- on all current and future tables/sequences/functions to ensure zero disruptions.

-- 1. Ensure schema usage
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- 2. Explicit grants on all CURRENT tables & views in public schema
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;

-- 3. Explicit grants on all CURRENT sequences (for serial / identity columns)
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO anon;
GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 4. Explicit grants on all CURRENT functions & routines
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO anon, authenticated, service_role;
GRANT EXECUTE ON ALL ROUTINES IN SCHEMA public TO anon, authenticated, service_role;

-- 5. AUTOMATIC DEFAULT PRIVILEGES FOR ALL FUTURE TABLES CREATED BY postgres ROLE
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON TABLES TO service_role;

-- 6. AUTOMATIC DEFAULT PRIVILEGES FOR ALL FUTURE SEQUENCES
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON SEQUENCES TO service_role;

-- 7. AUTOMATIC DEFAULT PRIVILEGES FOR ALL FUTURE FUNCTIONS
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public GRANT ALL ON FUNCTIONS TO service_role;
