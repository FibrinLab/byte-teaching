-- External teacher invitations (no account required)
CREATE TABLE teacher_invitations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  first_name TEXT,
  last_name TEXT,
  invite_code TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'ACCEPTED', 'DECLINED')),
  sent_by UUID NOT NULL REFERENCES auth.users(id),
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_teacher_invitations_session ON teacher_invitations(session_id);
CREATE INDEX idx_teacher_invitations_code ON teacher_invitations(invite_code);
CREATE INDEX idx_teacher_invitations_lookup ON teacher_invitations(session_id, email);

-- Enable RLS
ALTER TABLE teacher_invitations ENABLE ROW LEVEL SECURITY;

-- Allow public read of invitation by code (for RSVP page)
CREATE POLICY "Public can read invitation by code"
  ON teacher_invitations FOR SELECT
  USING (true);

-- Allow public update for RSVP response (name + status)
CREATE POLICY "Public can respond to invitation"
  ON teacher_invitations FOR UPDATE
  USING (true)
  WITH CHECK (true);

-- Make certificates.user_id nullable for external teachers
ALTER TABLE certificates ALTER COLUMN user_id DROP NOT NULL;

-- Add fields for external teacher certificates
ALTER TABLE certificates ADD COLUMN recipient_name TEXT;
ALTER TABLE certificates ADD COLUMN invitation_id UUID REFERENCES teacher_invitations(id);
