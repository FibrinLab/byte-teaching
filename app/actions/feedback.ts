'use server'

import { createSupabaseClient, createSupabaseServiceClient } from '@/lib/supabase/server'
import { requireOrg, requireDepartmentModerator } from '@/lib/auth'
import { revalidatePath } from 'next/cache'
import { generateCertificatePDF } from '@/lib/certificates/pdf'
import { generateCertificateCode } from '@/lib/certificates/utils'
import { getResendClient } from '@/lib/resend'
import { buildCertificateEmailHtml, buildTeacherFeedbackEmailHtml } from '@/lib/email-templates'

export interface FeedbackData {
  firstName: string
  lastName: string
  email: string
  rating: number
  comment?: string
}

export async function submitFeedback(sessionId: string, feedback: FeedbackData) {
  // Use service client — this is a public form, no auth required
  const serviceClient = await createSupabaseServiceClient()

  // Get session to verify it exists and is published
  const { data: session, error: sessionError } = await serviceClient
    .from('sessions')
    .select('id, org_id, status, department_id')
    .eq('id', sessionId)
    .single()

  if (sessionError || !session) {
    throw new Error('Session not found')
  }

  if (session.status !== 'PUBLISHED') {
    throw new Error('Feedback can only be submitted for published sessions')
  }

  // Save feedback with attendee info
  const { data, error } = await serviceClient
    .from('session_feedback')
    .insert({
      org_id: session.org_id,
      session_id: sessionId,
      rating: feedback.rating,
      comment: feedback.comment || null,
      is_anonymous: false,
      attendee_first_name: feedback.firstName,
      attendee_last_name: feedback.lastName,
      attendee_email: feedback.email.toLowerCase(),
    })
    .select()
    .single()

  if (error) {
    throw new Error(`Failed to submit feedback: ${error.message}`)
  }

  // Auto-generate and email attendance certificate (non-blocking)
  try {
    const recipientName = `${feedback.firstName} ${feedback.lastName}`

    // Fetch org, department, and session details for certificate
    const { data: sessionFull } = await serviceClient
      .from('sessions')
      .select('title, date_start, department_id, org_id')
      .eq('id', sessionId)
      .single()

    const { data: org } = await serviceClient
      .from('organizations')
      .select('name')
      .eq('id', session.org_id)
      .single()

    const { data: dept } = await serviceClient
      .from('departments')
      .select('name, lead_name')
      .eq('id', session.department_id)
      .single()

    if (sessionFull && org && dept) {
      const certificateCode = generateCertificateCode()
      const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const verifyUrl = `${baseUrl}/verify/${certificateCode}`

      // Create certificate record
      await serviceClient
        .from('certificates')
        .insert({
          org_id: session.org_id,
          department_id: session.department_id,
          session_id: sessionId,
          user_id: null,
          certificate_role: 'ATTENDEE',
          certificate_code: certificateCode,
          recipient_name: recipientName,
        })

      // Generate PDF
      const pdfBuffer = await generateCertificatePDF({
        orgName: org.name,
        departmentName: dept.name,
        sessionTitle: sessionFull.title,
        sessionDate: new Date(sessionFull.date_start).toLocaleDateString('en-GB', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        recipientName,
        role: 'Attendee',
        certificateCode,
        issuedDate: new Date().toLocaleDateString('en-GB', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        verifyUrl,
        leadName: dept.lead_name || undefined,
      })

      // Send email with PDF attachment
      const resend = getResendClient()
      const fromAddress = process.env.RESEND_FROM_EMAIL || 'Byte Teaching <onboarding@resend.dev>'
      const htmlBody = buildCertificateEmailHtml(sessionFull.title, recipientName)

      await resend.emails.send({
        from: fromAddress,
        to: feedback.email.toLowerCase(),
        subject: `Your Attendance Certificate — ${sessionFull.title}`,
        html: htmlBody,
        attachments: [
          {
            filename: `certificate-${certificateCode}.pdf`,
            content: pdfBuffer,
          },
        ],
      })
    }
  } catch (certError) {
    console.error('Failed to generate/email certificate:', certError)
    // Don't throw — feedback was saved successfully
  }

  revalidatePath(`/sessions/${sessionId}`)
  revalidatePath(`/sessions/${sessionId}/manage`)
  return data
}

export async function getSessionFeedback(sessionId: string) {
  const orgId = await requireOrg()
  const supabase = await createSupabaseClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('department_id')
    .eq('id', sessionId)
    .eq('org_id', orgId)
    .single()

  if (!session) {
    throw new Error('Session not found')
  }

  await requireDepartmentModerator(session.department_id)

  const { data, error } = await supabase
    .from('session_feedback')
    .select('*')
    .eq('org_id', orgId)
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch feedback: ${error.message}`)
  }

  return data || []
}

export async function getSessionFeedbackStats(sessionId: string) {
  const feedback = await getSessionFeedback(sessionId)

  const total = feedback.length
  const ratings = feedback.map(f => f.rating).filter(Boolean) as number[]
  const averageRating = ratings.length > 0
    ? ratings.reduce((sum, r) => sum + r, 0) / ratings.length
    : 0

  const ratingDistribution = {
    1: ratings.filter(r => r === 1).length,
    2: ratings.filter(r => r === 2).length,
    3: ratings.filter(r => r === 3).length,
    4: ratings.filter(r => r === 4).length,
    5: ratings.filter(r => r === 5).length,
  }

  const comments = feedback.filter(f => f.comment && f.comment.trim().length > 0)

  return {
    total,
    averageRating: Math.round(averageRating * 10) / 10,
    ratingDistribution,
    commentsCount: comments.length,
    comments,
  }
}

export async function getSessionFeedbackAudit(sessionId: string) {
  const orgId = await requireOrg()
  const supabase = await createSupabaseClient()

  const { data: session } = await supabase
    .from('sessions')
    .select('department_id')
    .eq('id', sessionId)
    .eq('org_id', orgId)
    .single()

  if (!session) {
    throw new Error('Session not found')
  }

  await requireDepartmentModerator(session.department_id)

  const serviceClient = await createSupabaseServiceClient()

  const { data, error } = await serviceClient
    .from('session_feedback')
    .select('id, attendee_first_name, attendee_last_name, attendee_email, rating, comment, created_at')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: false })

  if (error) {
    throw new Error(`Failed to fetch audit data: ${error.message}`)
  }

  return data || []
}

export async function releaseTeacherFeedback(sessionId: string) {
  const orgId = await requireOrg()
  const supabase = await createSupabaseClient()

  // Fetch session
  const { data: session } = await supabase
    .from('sessions')
    .select('id, title, date_start, department_id, org_id, status')
    .eq('id', sessionId)
    .eq('org_id', orgId)
    .single()

  if (!session) {
    throw new Error('Session not found')
  }

  await requireDepartmentModerator(session.department_id)

  const serviceClient = await createSupabaseServiceClient()

  // Fetch org, department, feedback stats in parallel
  const [orgResult, deptResult, feedbackStats] = await Promise.all([
    serviceClient.from('organizations').select('name').eq('id', orgId).single(),
    serviceClient.from('departments').select('name, lead_name').eq('id', session.department_id).single(),
    getSessionFeedbackStats(sessionId),
  ])

  const org = orgResult.data
  const dept = deptResult.data

  if (!org || !dept) {
    throw new Error('Organization or department not found')
  }

  // Get feedback comments for the email
  const { data: feedbackComments } = await serviceClient
    .from('session_feedback')
    .select('attendee_first_name, attendee_last_name, comment')
    .eq('session_id', sessionId)
    .not('comment', 'is', null)
    .order('created_at', { ascending: false })

  const comments = (feedbackComments || [])
    .filter(f => f.comment && f.comment.trim().length > 0)
    .map(f => ({
      attendee_first_name: f.attendee_first_name,
      attendee_last_name: f.attendee_last_name,
      comment: f.comment!,
    }))

  // Get all teachers: external invitations (ACCEPTED) + registered session_teachers
  const [invitationsResult, sessionTeachersResult] = await Promise.all([
    serviceClient
      .from('teacher_invitations')
      .select('id, email, first_name, last_name')
      .eq('session_id', sessionId)
      .eq('status', 'ACCEPTED'),
    serviceClient
      .from('session_teachers')
      .select('id, user_id')
      .eq('session_id', sessionId),
  ])

  const externalTeachers = invitationsResult.data || []
  const registeredTeachers = sessionTeachersResult.data || []

  // Look up emails for registered teachers
  const registeredTeacherDetails: { email: string; name: string; userId: string }[] = []
  for (const rt of registeredTeachers) {
    const { data: profile } = await serviceClient
      .from('profiles')
      .select('email, full_name')
      .eq('id', rt.user_id)
      .single()
    if (profile?.email) {
      registeredTeacherDetails.push({
        email: profile.email,
        name: profile.full_name || profile.email,
        userId: rt.user_id,
      })
    }
  }

  const allTeachers = [
    ...externalTeachers.map(t => ({
      email: t.email,
      name: `${t.first_name} ${t.last_name}`,
      userId: null as string | null,
    })),
    ...registeredTeacherDetails.map(t => ({
      email: t.email,
      name: t.name,
      userId: t.userId as string | null,
    })),
  ]

  if (allTeachers.length === 0) {
    throw new Error('No teachers found for this session')
  }

  const sessionDate = new Date(session.date_start).toLocaleDateString('en-GB', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })

  const resend = getResendClient()
  const fromAddress = process.env.RESEND_FROM_EMAIL || 'Byte Teaching <onboarding@resend.dev>'
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

  let sentCount = 0

  for (const teacher of allTeachers) {
    try {
      // Generate certificate
      const certificateCode = generateCertificateCode()
      const verifyUrl = `${baseUrl}/verify/${certificateCode}`

      // Create certificate record
      await serviceClient
        .from('certificates')
        .insert({
          org_id: orgId,
          department_id: session.department_id,
          session_id: sessionId,
          user_id: teacher.userId,
          certificate_role: 'TEACHER',
          certificate_code: certificateCode,
          recipient_name: teacher.name,
        })

      // Generate PDF
      const pdfBuffer = await generateCertificatePDF({
        orgName: org.name,
        departmentName: dept.name,
        sessionTitle: session.title,
        sessionDate,
        recipientName: teacher.name,
        role: 'Teacher',
        certificateCode,
        issuedDate: new Date().toLocaleDateString('en-GB', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        verifyUrl,
        leadName: dept.lead_name || undefined,
      })

      // Build email
      const htmlBody = buildTeacherFeedbackEmailHtml({
        teacherName: teacher.name,
        sessionTitle: session.title,
        sessionDate,
        departmentName: dept.name,
        totalResponses: feedbackStats.total,
        averageRating: feedbackStats.averageRating,
        ratingDistribution: feedbackStats.ratingDistribution,
        comments,
      })

      // Send email with PDF attachment
      await resend.emails.send({
        from: fromAddress,
        to: teacher.email,
        subject: `Feedback Summary & Teaching Certificate — ${session.title}`,
        html: htmlBody,
        attachments: [
          {
            filename: `teacher-certificate-${certificateCode}.pdf`,
            content: pdfBuffer,
          },
        ],
      })

      sentCount++
    } catch (teacherError) {
      console.error(`Failed to send feedback to teacher ${teacher.email}:`, teacherError)
      // Continue with next teacher
    }
  }

  revalidatePath(`/sessions/${sessionId}/manage`)
  revalidatePath('/audit')

  return { sentCount, totalTeachers: allTeachers.length }
}
