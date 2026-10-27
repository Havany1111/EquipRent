-- Run after full_schema_setup.sql.
-- Do not insert directly into Supabase's managed auth.users or auth.identities
-- tables. Create users through Supabase Dashboard > Authentication > Users.

-- Repair demo accounts created by the previous version of this setup script.
-- That script inserted users without initializing these Auth token columns,
-- which can make password sign-in fail with "Database error querying schema".
UPDATE auth.users
SET confirmation_token = COALESCE(confirmation_token, ''),
    email_change = COALESCE(email_change, ''),
    email_change_token_new = COALESCE(email_change_token_new, ''),
    recovery_token = COALESCE(recovery_token, '')
WHERE email IN (
    'admin@equiprent.com',
    'marcus.tech@equiprent.com',
    'jordan.miller@buildcorp.com'
)
AND (
    confirmation_token IS NULL
    OR email_change IS NULL
    OR email_change_token_new IS NULL
    OR recovery_token IS NULL
);

CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
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
        'customer',
        'active'
    )
    ON CONFLICT (email) DO UPDATE
    SET auth_user_id = EXCLUDED.auth_user_id,
        updated_at = NOW();

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS pol_profiles_auth_insert ON public.user_profiles;
DROP POLICY IF EXISTS pol_profiles_auth_update ON public.user_profiles;
DROP POLICY IF EXISTS pol_anon_profiles_select ON public.user_profiles;
DROP POLICY IF EXISTS pol_profiles_auth_select ON public.user_profiles;
DROP POLICY IF EXISTS pol_profiles_self_update ON public.user_profiles;

REVOKE ALL ON TABLE public.user_profiles FROM anon, authenticated;
GRANT SELECT ON TABLE public.user_profiles TO authenticated;
GRANT UPDATE (full_name, phone, company_name, updated_at)
    ON TABLE public.user_profiles TO authenticated;

CREATE POLICY pol_profiles_auth_select ON public.user_profiles
    FOR SELECT TO authenticated
    USING (
        auth_user_id = auth.uid()
        OR id = auth.uid()
        OR public.fn_current_user_role() IN ('admin', 'staff')
    );

CREATE POLICY pol_profiles_self_update ON public.user_profiles
    FOR UPDATE TO authenticated
    USING (auth_user_id = auth.uid() OR id = auth.uid())
    WITH CHECK (auth_user_id = auth.uid() OR id = auth.uid());
