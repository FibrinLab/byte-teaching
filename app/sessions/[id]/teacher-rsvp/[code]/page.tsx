import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { Card } from '@/components/Card'
import { TeacherRsvpForm } from '@/components/TeacherRsvpForm'

export const dynamic = 'force-dynamic'

export default async function TeacherRsvpPage({
  params,
}: {
  params: { id: string; code: string }
}) {
  const serviceClient = await createSupabaseServiceClient()

  // Look up invitation by code
  const { data: invitation, error } = await serviceClient
    .from('teacher_invitations')
    .select('*')
    .eq('invite_code', params.code)
    .eq('session_id', params.id)
    .single()

  if (error || !invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card>
          <h1 className="text-xl font-mono font-bold mb-2">Invitation Not Found</h1>
          <p className="font-mono text-sm text-gray-600">
            This invitation link is invalid or has expired.
          </p>
        </Card>
      </div>
    )
  }

  if (invitation.status !== 'PENDING') {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card>
          <h1 className="text-xl font-mono font-bold mb-2">Already Responded</h1>
          <p className="font-mono text-sm text-gray-600">
            You have already {invitation.status === 'ACCEPTED' ? 'accepted' : 'declined'} this invitation.
          </p>
        </Card>
      </div>
    )
  }

  // Get session details
  const { data: session } = await serviceClient
    .from('sessions')
    .select('title, date_start, date_end, location_type, description')
    .eq('id', params.id)
    .single()

  const startDate = session ? new Date(session.date_start) : null
  const endDate = session ? new Date(session.date_end) : null

  const locationLabel: Record<string, string> = {
    'MS_TEAMS': 'Microsoft Teams (Online)',
    'IN_PERSON': 'In Person',
    'HYBRID': 'Hybrid (In Person + Online)',
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <h1 className="text-2xl sm:text-3xl font-mono font-bold mb-2 break-words">
            Teaching Invitation
          </h1>
          <p className="font-mono text-sm text-gray-600">
            You have been invited to teach a session
          </p>
        </div>

        {session && (
          <Card>
            <h2 className="text-xl font-mono font-bold mb-4">{session.title}</h2>
            <div className="space-y-2 font-mono text-sm mb-6">
              {startDate && endDate && (
                <>
                  <p>
                    <strong>Date:</strong>{' '}
                    {startDate.toLocaleDateString('en-GB', {
                      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
                    })}
                  </p>
                  <p>
                    <strong>Time:</strong>{' '}
                    {startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                    {' - '}
                    {endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </>
              )}
              <p>
                <strong>Location:</strong>{' '}
                {locationLabel[session.location_type] || session.location_type}
              </p>
              {session.description && (
                <p className="mt-2 whitespace-pre-wrap">{session.description}</p>
              )}
            </div>

            <div className="border-t border-gray-300 pt-4">
              <TeacherRsvpForm inviteCode={params.code} />
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
