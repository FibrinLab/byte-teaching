'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from './Button'
import { Input } from './Input'
import { removeSessionTeacher } from '@/app/actions/sessions'
import { sendTeacherEmail } from '@/app/actions/emails'
import { inviteExternalTeacher, deleteTeacherInvitation } from '@/app/actions/teacher-invitations'
import type { EmailType, TeacherInvitation } from '@/lib/types'

interface ManageTeachersPanelProps {
  sessionId: string
  currentTeachers: { id: string; user_id: string }[]
  departmentMembers: { id: string; email: string | null }[]
  emailHistory: { user_id: string; email_type: string; sent_at: string }[]
  invitations: TeacherInvitation[]
}

export function ManageTeachersPanel({
  sessionId,
  currentTeachers,
  departmentMembers,
  emailHistory,
  invitations,
}: ManageTeachersPanelProps) {
  const router = useRouter()
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [inviteEmail, setInviteEmail] = useState('')

  async function handleInvite() {
    if (!inviteEmail.trim()) return

    setLoading('invite')
    setError(null)
    setSuccess(null)

    try {
      const result = await inviteExternalTeacher(sessionId, inviteEmail.trim())
      if (result.emailSent === false) {
        setSuccess(`Invitation created but email could not be sent: ${result.emailError}`)
      } else {
        setSuccess('Invitation sent successfully')
      }
      setInviteEmail('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invitation')
    } finally {
      setLoading(null)
    }
  }

  async function handleRemoveTeacher(userId: string) {
    setLoading(`remove-${userId}`)
    setError(null)
    setSuccess(null)

    try {
      await removeSessionTeacher(sessionId, userId)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove teacher')
    } finally {
      setLoading(null)
    }
  }

  async function handleSendEmail(userId: string, emailType: EmailType) {
    const key = `${emailType.toLowerCase()}-${userId}`
    setLoading(key)
    setError(null)
    setSuccess(null)

    try {
      await sendTeacherEmail(sessionId, userId, emailType)
      setSuccess(`${emailType === 'INVITATION' ? 'Invitation' : 'Reminder'} sent successfully`)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : `Failed to send ${emailType.toLowerCase()}`)
    } finally {
      setLoading(null)
    }
  }

  async function handleResendInvitation(invitation: TeacherInvitation) {
    setLoading(`resend-${invitation.id}`)
    setError(null)
    setSuccess(null)

    try {
      await inviteExternalTeacher(sessionId, invitation.email)
      setSuccess('Invitation resent successfully')
      router.refresh()
    } catch (err) {
      // If existing pending, that's fine — the email was already sent
      if (err instanceof Error && err.message.includes('already been sent')) {
        setError(err.message)
      } else {
        setError(err instanceof Error ? err.message : 'Failed to resend invitation')
      }
    } finally {
      setLoading(null)
    }
  }

  async function handleDeleteInvitation(invitationId: string) {
    setLoading(`delete-${invitationId}`)
    setError(null)
    setSuccess(null)

    try {
      await deleteTeacherInvitation(sessionId, invitationId)
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete invitation')
    } finally {
      setLoading(null)
    }
  }

  function getLastEmail(userId: string, emailType: string) {
    return emailHistory
      .filter(e => e.user_id === userId && e.email_type === emailType)
      .sort((a, b) => new Date(b.sent_at).getTime() - new Date(a.sent_at).getTime())[0]
  }

  const statusBadge = (status: string) => {
    const colors: Record<string, string> = {
      PENDING: 'border-yellow-500 text-yellow-800 bg-yellow-50',
      ACCEPTED: 'border-green-500 text-green-800 bg-green-50',
      DECLINED: 'border-red-500 text-red-800 bg-red-50',
    }
    return (
      <span className={`font-mono text-xs border px-2 py-0.5 ${colors[status] || ''}`}>
        {status}
      </span>
    )
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-4 border border-red-500 bg-red-50">
          <p className="font-mono text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="p-4 border border-green-500 bg-green-50">
          <p className="font-mono text-sm text-green-800">{success}</p>
        </div>
      )}

      {/* Invite by Email */}
      <div>
        <h3 className="font-mono font-bold mb-2">Invite Teacher</h3>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="Enter teacher's email address"
            className="flex-1"
          />
          <Button
            type="button"
            onClick={handleInvite}
            disabled={!inviteEmail.trim() || loading === 'invite'}
            className="w-full sm:w-auto"
          >
            {loading === 'invite' ? 'Sending...' : 'Send Invitation'}
          </Button>
        </div>
      </div>

      {/* Invitations */}
      {invitations.length > 0 && (
        <div>
          <h3 className="font-mono font-bold mb-2">Invitations</h3>
          <ul className="space-y-3">
            {invitations.map(invitation => (
              <li key={invitation.id} className="p-3 border border-gray-300 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-sm font-bold">{invitation.email}</span>
                  {statusBadge(invitation.status)}
                </div>

                {invitation.first_name && invitation.last_name && (
                  <p className="font-mono text-xs text-gray-600">
                    Name: {invitation.first_name} {invitation.last_name}
                  </p>
                )}

                <p className="font-mono text-xs text-gray-500">
                  Sent: {new Date(invitation.sent_at).toLocaleString('en-GB')}
                  {invitation.responded_at && (
                    <> | Responded: {new Date(invitation.responded_at).toLocaleString('en-GB')}</>
                  )}
                </p>

                <div className="flex gap-2 flex-wrap">
                  {invitation.status === 'PENDING' && (
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleResendInvitation(invitation)}
                      disabled={loading === `resend-${invitation.id}`}
                      className="text-xs"
                    >
                      {loading === `resend-${invitation.id}` ? 'Sending...' : 'Resend Invitation'}
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="danger"
                    onClick={() => handleDeleteInvitation(invitation.id)}
                    disabled={loading === `delete-${invitation.id}`}
                    className="text-xs"
                  >
                    {loading === `delete-${invitation.id}` ? 'Removing...' : 'Remove'}
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Current Teachers (existing department members assigned) */}
      {currentTeachers.length > 0 && (
        <div>
          <h3 className="font-mono font-bold mb-2">Assigned Teachers</h3>
          <ul className="space-y-3">
            {currentTeachers.map(teacher => {
              const member = departmentMembers.find(m => m.id === teacher.user_id)
              const lastInvitation = getLastEmail(teacher.user_id, 'INVITATION')
              const lastReminder = getLastEmail(teacher.user_id, 'REMINDER')

              return (
                <li key={teacher.id} className="p-3 border border-gray-300 space-y-2">
                  <span className="font-mono text-sm font-bold">{member?.email || teacher.user_id}</span>

                  <div className="font-mono text-xs text-gray-500 space-y-0.5">
                    {lastInvitation ? (
                      <p>Invited: {new Date(lastInvitation.sent_at).toLocaleString('en-GB')}</p>
                    ) : null}
                    {lastReminder ? (
                      <p>Reminded: {new Date(lastReminder.sent_at).toLocaleString('en-GB')}</p>
                    ) : null}
                    {!lastInvitation && !lastReminder && (
                      <p>No emails sent yet</p>
                    )}
                  </div>

                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleSendEmail(teacher.user_id, 'INVITATION')}
                      disabled={loading === `invitation-${teacher.user_id}`}
                      className="text-xs"
                    >
                      {loading === `invitation-${teacher.user_id}` ? 'Sending...' : 'Send Invitation'}
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => handleSendEmail(teacher.user_id, 'REMINDER')}
                      disabled={loading === `reminder-${teacher.user_id}`}
                      className="text-xs"
                    >
                      {loading === `reminder-${teacher.user_id}` ? 'Sending...' : 'Send Reminder'}
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      onClick={() => handleRemoveTeacher(teacher.user_id)}
                      disabled={loading === `remove-${teacher.user_id}`}
                      className="text-xs"
                    >
                      {loading === `remove-${teacher.user_id}` ? 'Removing...' : 'Remove'}
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
