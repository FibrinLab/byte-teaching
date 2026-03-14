-- Teacher email tracking table
CREATE TABLE teacher_emails (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  email_type TEXT NOT NULL CHECK (email_type IN ('INVITATION', 'REMINDER')),
  recipient_email TEXT NOT NULL,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_by UUID NOT NULL REFERENCES auth.users(id),
  resend_id TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_teacher_emails_session_id ON teacher_emails(session_id);
CREATE INDEX idx_teacher_emails_user_id ON teacher_emails(user_id);
CREATE INDEX idx_teacher_emails_lookup
  ON teacher_emails(session_id, user_id, email_type, sent_at DESC);

-- Enable RLS but use service client for all access (same as computed attendance)
ALTER TABLE teacher_emails ENABLE ROW LEVEL SECURITY;
