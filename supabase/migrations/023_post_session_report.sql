-- 023: Track when post-session reports have been sent to attendees
ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS report_sent_at TIMESTAMPTZ;
