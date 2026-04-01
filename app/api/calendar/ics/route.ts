import { NextRequest, NextResponse } from 'next/server'
import { createSupabaseServiceClient } from '@/lib/supabase/server'
import ical, { ICalCalendarMethod, ICalEventStatus } from 'ical-generator'

function computeToken(orgId: string): string {
  // Simple deterministic token: hex-encoded hash of orgId + server secret
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  let hash = 0
  const str = orgId + secret
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16)
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const orgId = searchParams.get('orgId')
  const token = searchParams.get('token')
  const departmentId = searchParams.get('departmentId')

  if (!orgId || !token) {
    return NextResponse.json({ error: 'Missing orgId or token' }, { status: 400 })
  }

  // Verify token
  const expectedToken = computeToken(orgId)
  if (token !== expectedToken) {
    return NextResponse.json({ error: 'Invalid token' }, { status: 403 })
  }

  const supabase = await createSupabaseServiceClient()

  // Fetch org name
  const { data: org } = await supabase
    .from('organizations')
    .select('name')
    .eq('id', orgId)
    .single()

  // Fetch published sessions
  let query = supabase
    .from('sessions')
    .select('*')
    .eq('org_id', orgId)
    .eq('status', 'PUBLISHED')
    .order('date_start', { ascending: true })

  if (departmentId) {
    query = query.eq('department_id', departmentId)
  }

  const { data: sessions, error } = await query

  if (error) {
    return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 })
  }

  // Build ICS calendar
  const calendar = ical({
    name: org?.name ? `${org.name} Teaching Sessions` : 'Teaching Sessions',
    method: ICalCalendarMethod.PUBLISH,
    prodId: { company: 'Byte Teaching', product: 'Dashboard' },
    ttl: 3600, // Suggest 1-hour refresh to calendar apps
  })

  for (const session of sessions || []) {
    const locationParts: string[] = []
    if (session.location_type === 'MS_TEAMS' || session.location_type === 'HYBRID') {
      if (session.teams_meeting_url) {
        locationParts.push(session.teams_meeting_url)
      } else {
        locationParts.push('Microsoft Teams')
      }
    }
    if (session.location_type === 'IN_PERSON' || session.location_type === 'HYBRID') {
      locationParts.push('In Person')
    }

    calendar.createEvent({
      id: session.id,
      start: new Date(session.date_start),
      end: new Date(session.date_end),
      summary: session.title,
      description: session.description || undefined,
      location: locationParts.join(' / ') || undefined,
      status: ICalEventStatus.CONFIRMED,
    })
  }

  const icsContent = calendar.toString()

  return new NextResponse(icsContent, {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="sessions.ics"',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  })
}
