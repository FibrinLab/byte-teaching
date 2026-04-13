-- 024: Switch UUID defaults from uuid_generate_v4() to gen_random_uuid()
-- gen_random_uuid() is built into PostgreSQL 13+ and doesn't require the uuid-ossp extension

ALTER TABLE public.organizations ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.organization_members ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.departments ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.department_members ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.sessions ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.session_teachers ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.attendance ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.attendance_evidence ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.certificates ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.session_feedback ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.department_invite_links ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.member_onboarding_requests ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.teacher_invitations ALTER COLUMN id SET DEFAULT gen_random_uuid();
ALTER TABLE public.teacher_emails ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Fix function that also used uuid_generate_v4() internally
CREATE OR REPLACE FUNCTION public.generate_department_invite_code()
RETURNS TEXT AS $$
BEGIN
  RETURN UPPER(SUBSTRING(REPLACE(gen_random_uuid()::TEXT, '-', '') FROM 1 FOR 12));
END;
$$ LANGUAGE plpgsql VOLATILE;
