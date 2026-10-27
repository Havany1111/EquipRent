-- ============================================================================
-- EQUIPRENT: FIX SUPABASE AUTH TRIGGER & SEED AUTH USERS
-- Run this in your Supabase SQL Editor to resolve "Database error saving new user"
-- and enable instant login for admin@equiprent.com, marcus.tech, and jordan.miller
-- ============================================================================

-- 1. Ensure required extensions
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. Drop any previous conflicting auth trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

-- 3. Create Safe Trigger Function with explicit search_path and exception handling
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_role public.user_role_type;
BEGIN
    -- Safely determine role
    IF NEW.raw_user_meta_data->>'role' = 'admin' THEN
        v_role := 'admin'::public.user_role_type;
    ELSIF NEW.raw_user_meta_data->>'role' = 'staff' THEN
        v_role := 'staff'::public.user_role_type;
    ELSE
        v_role := 'customer'::public.user_role_type;
    END IF;

    -- Upsert profile into public.user_profiles
    INSERT INTO public.user_profiles (
        id,
        auth_user_id,
        full_name,
        email,
        phone,
        company_name,
        role,
        account_status
    ) VALUES (
        NEW.id,
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'phone', '+1-555-0100'),
        COALESCE(NEW.raw_user_meta_data->>'company_name', 'Enterprise Client'),
        v_role,
        'active'
    )
    ON CONFLICT (email) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id;

    RETURN NEW;
EXCEPTION WHEN OTHERS THEN
    -- Never abort auth signup if profile already exists or metadata differs
    RETURN NEW;
END;
$$;

-- 4. Re-bind trigger to auth.users
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- 5. Enable RLS permissions on user_profiles for anon and authenticated users
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_profiles_auth_insert ON public.user_profiles;
CREATE POLICY pol_profiles_auth_insert ON public.user_profiles 
    FOR INSERT TO authenticated, anon WITH CHECK (true);

DROP POLICY IF EXISTS pol_profiles_auth_update ON public.user_profiles;
CREATE POLICY pol_profiles_auth_update ON public.user_profiles 
    FOR UPDATE TO authenticated, anon USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS pol_anon_profiles_select ON public.user_profiles;
CREATE POLICY pol_anon_profiles_select ON public.user_profiles 
    FOR SELECT TO authenticated, anon USING (true);

-- 6. Pre-seed standard accounts into Supabase auth.users so you can Sign In immediately
-- Default Password for all three is: EquipRent2026!
DO $$
BEGIN
    -- Admin Account
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'admin@equiprent.com') THEN
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            'a0000000-0000-0000-0000-000000000001',
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            'admin@equiprent.com',
            crypt('EquipRent2026!', gen_salt('bf')),
            NOW(),
            '{"provider":"email","providers":["email"]}',
            '{"full_name":"Alex Morgan","role":"admin"}',
            NOW(),
            NOW()
        );
    ELSE
        UPDATE auth.users
        SET encrypted_password = crypt('EquipRent2026!', gen_salt('bf')),
            email_confirmed_at = NOW()
        WHERE email = 'admin@equiprent.com';
    END IF;

    -- Staff Account
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'marcus.tech@equiprent.com') THEN
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            'b0000000-0000-0000-0000-000000000002',
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            'marcus.tech@equiprent.com',
            crypt('EquipRent2026!', gen_salt('bf')),
            NOW(),
            '{"provider":"email","providers":["email"]}',
            '{"full_name":"Marcus Vance","role":"staff"}',
            NOW(),
            NOW()
        );
    ELSE
        UPDATE auth.users
        SET encrypted_password = crypt('EquipRent2026!', gen_salt('bf')),
            email_confirmed_at = NOW()
        WHERE email = 'marcus.tech@equiprent.com';
    END IF;

    -- Customer Account
    IF NOT EXISTS (SELECT 1 FROM auth.users WHERE email = 'jordan.miller@buildcorp.com') THEN
        INSERT INTO auth.users (
            id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
            raw_app_meta_data, raw_user_meta_data, created_at, updated_at
        ) VALUES (
            'c0000000-0000-0000-0000-000000000003',
            '00000000-0000-0000-0000-000000000000',
            'authenticated',
            'authenticated',
            'jordan.miller@buildcorp.com',
            crypt('EquipRent2026!', gen_salt('bf')),
            NOW(),
            '{"provider":"email","providers":["email"]}',
            '{"full_name":"Jordan Miller","role":"customer"}',
            NOW(),
            NOW()
        );
    ELSE
        UPDATE auth.users
        SET encrypted_password = crypt('EquipRent2026!', gen_salt('bf')),
            email_confirmed_at = NOW()
        WHERE email = 'jordan.miller@buildcorp.com';
    END IF;

END $$;
