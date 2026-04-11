'use client'

import { useEffect, useState } from 'react'
import { formatFeedbackAnswerValue } from '@/lib/feedback-form'
import type { SubmittedFeedbackAnswer } from '@/lib/types'

interface FeedbackEntry {
  id: string
  attendee_first_name: string | null
  attendee_last_name: string | null
  attendee_email: string | null
  rating: number | null
  comment: string | null
  answers: SubmittedFeedbackAnswer[]
  created_at: string
}

interface FeedbackListPanelProps {
  sessionId: string
}

export function FeedbackListPanel({ sessionId }: FeedbackListPanelProps) {
  const [entries, setEntries] = useState<FeedbackEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchFeedback() {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/feedback/audit`)
        if (!response.ok) {
          throw new Error('Failed to fetch feedback')
        }

        const data = await response.json()
        setEntries(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load feedback')
      } finally {
        setLoading(false)
      }
    }

    fetchFeedback()
  }, [sessionId])

  if (loading) {
    return <p className="font-mono text-sm text-gray-600">Loading feedback...</p>
  }

  if (error) {
    return <p className="font-mono text-sm text-red-600">{error}</p>
  }

  if (entries.length === 0) {
    return <p className="font-mono text-sm text-gray-600">No feedback submitted yet.</p>
  }

  return (
    <div className="space-y-3">
      <p className="font-mono text-xs text-gray-500">
        {entries.length} response{entries.length !== 1 ? 's' : ''}
      </p>
      <ul className="space-y-3">
        {entries.map((entry) => {
          const answeredFields = entry.answers.filter((answer) => answer.value || answer.comment)

          return (
            <li key={entry.id} className="space-y-4 border border-gray-300 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-sm font-bold">
                {entry.attendee_first_name} {entry.attendee_last_name}
              </span>
              <div className="flex flex-wrap items-center gap-3">
                {entry.rating !== null ? (
                  <span className="font-mono text-sm font-bold">{entry.rating}/5 overall</span>
                ) : null}
                <span className="font-mono text-xs text-gray-500">
                  {new Date(entry.created_at).toLocaleString('en-GB')}
                </span>
              </div>
            </div>

            {answeredFields.length > 0 ? (
              <div className="space-y-3">
                {answeredFields.map((answer) => (
                  <div key={`${entry.id}-${answer.fieldId}`} className="border-l-2 border-black pl-3">
                    <p className="font-mono text-xs uppercase tracking-[0.18em] text-gray-500">
                      {answer.label}
                    </p>
                    <p className="mt-1 font-mono text-sm font-bold">
                      {formatFeedbackAnswerValue(answer)}
                    </p>
                    {answer.comment ? (
                      <p className="mt-2 font-mono text-sm leading-6 text-gray-700">
                        {answer.comment}
                      </p>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : entry.comment ? (
              <p className="font-mono text-sm text-gray-700">{entry.comment}</p>
            ) : null}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
