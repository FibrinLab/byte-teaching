import type { EmailType, TeacherEmail } from '@/lib/types'
import { getServiceDb } from './client'
import { toDbError } from './errors'

/**
 * Teacher email log — an append-only audit trail of emails sent to a
 * session's teachers (invitations, reminders). Uses service role throughout
 * because the log spans multiple user contexts and is written from flows
 * that have already verified authorization.
 */

export async function insertTeacherEmail(input: {
  orgId: string
  sessionId: string
  userId: string
  emailType: EmailType
  recipientEmail: string
  sentBy: string
  resendId: string | null
}): Promise<void> {
  const db = await getServiceDb()
  const { error } = await db.from('teacher_emails').insert({
    org_id: input.orgId,
    session_id: input.sessionId,
    user_id: input.userId,
    email_type: input.emailType,
    recipient_email: input.recipientEmail,
    sent_by: input.sentBy,
    resend_id: input.resendId,
  })

  if (error) throw toDbError('Failed to record teacher email', error)
}

export async function listTeacherEmailsForSession(
  orgId: string,
  sessionId: string
): Promise<TeacherEmail[]> {
  const db = await getServiceDb()
  const { data, error } = await db
    .from('teacher_emails')
    .select('*')
    .eq('session_id', sessionId)
    .eq('org_id', orgId)
    .order('sent_at', { ascending: false })

  if (error) throw toDbError('Failed to list teacher emails', error)
  return (data as TeacherEmail[] | null) ?? []
}
