-- Add attendee identity fields to session_feedback for attendance tracking
ALTER TABLE session_feedback ADD COLUMN attendee_first_name TEXT;
ALTER TABLE session_feedback ADD COLUMN attendee_last_name TEXT;
ALTER TABLE session_feedback ADD COLUMN attendee_email TEXT;
