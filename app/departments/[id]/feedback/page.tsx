import { createSupabaseServiceClient } from '@/lib/supabase/server'
import { Card } from '@/components/Card'
import { FeedbackForm } from '@/components/FeedbackForm'

export const dynamic = 'force-dynamic'

export default async function DepartmentFeedbackPage({
  params,
}: {
  params: { id: string }
}) {
  const serviceClient = await createSupabaseServiceClient()

  // Get department name
  const { data: department } = await serviceClient
    .from('departments')
    .select('name')
    .eq('id', params.id)
    .single()

  if (!department) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card>
          <h1 className="text-xl font-mono font-bold mb-2">Department Not Found</h1>
          <p className="font-mono text-sm text-gray-600">
            This department does not exist.
          </p>
        </Card>
      </div>
    )
  }

  // Find active published session for this department
  // Active = 15 mins before date_start to feedback_valid_mins_after_end after date_end
  const now = new Date().toISOString()

  const { data: sessions } = await serviceClient
    .from('sessions')
    .select('*')
    .eq('department_id', params.id)
    .eq('status', 'PUBLISHED')
    .order('date_start', { ascending: false })

  const activeSession = sessions?.find(session => {
    const start = new Date(session.date_start)
    const end = new Date(session.date_end)
    const windowBefore = 15 // minutes before start
    const windowAfter = session.feedback_valid_mins_after_end || 120 // minutes after end

    const windowStart = new Date(start.getTime() - windowBefore * 60 * 1000)
    const windowEnd = new Date(end.getTime() + windowAfter * 60 * 1000)
    const currentTime = new Date(now)

    return currentTime >= windowStart && currentTime <= windowEnd
  })

  if (!activeSession) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <Card>
          <h1 className="text-xl font-mono font-bold mb-2">{department.name}</h1>
          <p className="font-mono text-sm text-gray-600">
            No active session right now. Please check back during a scheduled session.
          </p>
        </Card>
      </div>
    )
  }

  const startDate = new Date(activeSession.date_start)
  const endDate = new Date(activeSession.date_end)

  const locationLabel: Record<string, string> = {
    'MS_TEAMS': 'Microsoft Teams (Online)',
    'IN_PERSON': 'In Person',
    'HYBRID': 'Hybrid (In Person + Online)',
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <div className="mb-6 sm:mb-8">
          <p className="font-mono text-sm text-gray-600 mb-1">{department.name}</p>
          <h1 className="text-2xl sm:text-3xl font-mono font-bold mb-2 break-words">
            {activeSession.title}
          </h1>
          <div className="space-y-1 font-mono text-sm text-gray-600">
            <p>
              {startDate.toLocaleDateString('en-GB', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
              })}
              {' '}
              {startDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
              {' - '}
              {endDate.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </p>
            <p>{locationLabel[activeSession.location_type] || activeSession.location_type}</p>
          </div>
        </div>

        <Card>
          <h2 className="text-lg font-mono font-bold mb-4">Session Feedback</h2>
          <p className="font-mono text-sm text-gray-600 mb-6">
            Please complete this form to record your attendance and provide feedback.
          </p>
          <FeedbackForm sessionId={activeSession.id} sessionTitle={activeSession.title} />
        </Card>
      </div>
    </div>
  )
}
