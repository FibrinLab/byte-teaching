-- Profiles, reusable department invite links, and member onboarding requests

CREATE OR REPLACE FUNCTION public.set_updated_at_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TABLE IF NOT EXISTS public.profiles (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  full_name TEXT,
  email_verified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_profiles_email_lower
  ON public.profiles(LOWER(email));

DROP TRIGGER IF EXISTS profiles_set_updated_at ON public.profiles;
CREATE TRIGGER profiles_set_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

CREATE OR REPLACE FUNCTION public.sync_profile_from_auth_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_first_name TEXT;
  v_last_name TEXT;
  v_full_name TEXT;
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  v_first_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'first_name', '')), '');
  v_last_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'last_name', '')), '');
  v_full_name := NULLIF(TRIM(COALESCE(NEW.raw_user_meta_data->>'full_name', CONCAT_WS(' ', v_first_name, v_last_name))), '');

  INSERT INTO public.profiles (
    user_id,
    email,
    first_name,
    last_name,
    full_name,
    email_verified_at
  )
  VALUES (
    NEW.id,
    LOWER(NEW.email),
    v_first_name,
    v_last_name,
    v_full_name,
    NEW.email_confirmed_at
  )
  ON CONFLICT (user_id) DO UPDATE SET
    email = EXCLUDED.email,
    first_name = EXCLUDED.first_name,
    last_name = EXCLUDED.last_name,
    full_name = EXCLUDED.full_name,
    email_verified_at = EXCLUDED.email_verified_at,
    updated_at = NOW();

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_profile_sync ON auth.users;
CREATE TRIGGER on_auth_user_profile_sync
  AFTER INSERT OR UPDATE OF email, raw_user_meta_data, email_confirmed_at
  ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_from_auth_user();

INSERT INTO public.profiles (
  user_id,
  email,
  first_name,
  last_name,
  full_name,
  email_verified_at
)
SELECT
  id,
  LOWER(email),
  NULLIF(TRIM(COALESCE(raw_user_meta_data->>'first_name', '')), ''),
  NULLIF(TRIM(COALESCE(raw_user_meta_data->>'last_name', '')), ''),
  NULLIF(
    TRIM(
      COALESCE(
        raw_user_meta_data->>'full_name',
        CONCAT_WS(
          ' ',
          NULLIF(TRIM(COALESCE(raw_user_meta_data->>'first_name', '')), ''),
          NULLIF(TRIM(COALESCE(raw_user_meta_data->>'last_name', '')), '')
        )
      )
    ),
    ''
  ),
  email_confirmed_at
FROM auth.users
WHERE email IS NOT NULL
ON CONFLICT (user_id) DO UPDATE SET
  email = EXCLUDED.email,
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  full_name = EXCLUDED.full_name,
  email_verified_at = EXCLUDED.email_verified_at,
  updated_at = NOW();

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.generate_department_invite_code()
RETURNS TEXT AS $$
BEGIN
  RETURN UPPER(SUBSTRING(REPLACE(uuid_generate_v4()::TEXT, '-', '') FROM 1 FOR 12));
END;
$$ LANGUAGE plpgsql VOLATILE;

CREATE TABLE IF NOT EXISTS public.department_invite_links (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  department_id UUID NOT NULL UNIQUE REFERENCES public.departments(id) ON DELETE CASCADE,
  invite_code TEXT NOT NULL UNIQUE DEFAULT public.generate_department_invite_code(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  rotated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_department_invite_links_org_id
  ON public.department_invite_links(org_id);

DROP TRIGGER IF EXISTS department_invite_links_set_updated_at ON public.department_invite_links;
CREATE TRIGGER department_invite_links_set_updated_at
  BEFORE UPDATE ON public.department_invite_links
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.department_invite_links ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.member_onboarding_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  department_id UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  invite_link_id UUID NOT NULL REFERENCES public.department_invite_links(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  requested_role TEXT NOT NULL CHECK (requested_role IN ('org_admin', 'department_admin', 'faculty', 'trainee')) DEFAULT 'trainee',
  link_type TEXT NOT NULL CHECK (link_type IN ('invite', 'magiclink')),
  status TEXT NOT NULL CHECK (status IN ('PENDING', 'COMPLETED', 'CANCELLED')) DEFAULT 'PENDING',
  requested_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_member_onboarding_requests_invite_link_id
  ON public.member_onboarding_requests(invite_link_id);

CREATE INDEX IF NOT EXISTS idx_member_onboarding_requests_requested_user_id
  ON public.member_onboarding_requests(requested_user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_member_onboarding_requests_pending_email
  ON public.member_onboarding_requests(department_id, LOWER(email))
  WHERE status = 'PENDING';

DROP TRIGGER IF EXISTS member_onboarding_requests_set_updated_at ON public.member_onboarding_requests;
CREATE TRIGGER member_onboarding_requests_set_updated_at
  BEFORE UPDATE ON public.member_onboarding_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.set_updated_at_timestamp();

ALTER TABLE public.member_onboarding_requests ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.create_department_invite_link_for_department()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.department_invite_links (
    org_id,
    department_id,
    created_by
  )
  VALUES (
    NEW.org_id,
    NEW.id,
    NEW.created_by
  )
  ON CONFLICT (department_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_department_create_invite_link ON public.departments;
CREATE TRIGGER on_department_create_invite_link
  AFTER INSERT ON public.departments
  FOR EACH ROW
  EXECUTE FUNCTION public.create_department_invite_link_for_department();

INSERT INTO public.department_invite_links (
  org_id,
  department_id,
  created_by
)
SELECT
  org_id,
  id,
  created_by
FROM public.departments
ON CONFLICT (department_id) DO NOTHING;
