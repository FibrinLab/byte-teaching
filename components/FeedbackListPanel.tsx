'use client'

import { useState, useEffect } from 'react'

interface FeedbackEntry {
  id: string
  attendee_first_name: string | null
  attendee_last_name: string | null
  attendee_email: string | null
  rating: number
  comment: string | null
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
        const res = await fetch(`/api/sessions/${sessionId}/feedback/audit`)
        if (!res.ok) throw new Error('Failed to fetch feedback')
        const data = await res.json()
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
      <p className="font-mono text-xs text-gray-500">{entries.length} response{entries.length !== 1 ? 's' : ''}</p>
      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="border border-gray-300 p-3 space-y-1">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className="font-mono text-sm font-bold">
                {entry.attendee_first_name} {entry.attendee_last_name}
              </span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm">
                  {Array.from({ length: 5 }, (_, i) => (
                    <span key={i} className={i < entry.rating ? 'text-black' : 'text-gray-300'}>
                      &#9733;
                    </span>
                  ))}
                </span>
                <span className="font-mono text-xs text-gray-500">
                  {new Date(entry.created_at).toLocaleString()}
                </span>
              </div>
            </div>
            {entry.comment && (
              <p className="font-mono text-sm text-gray-700">{entry.comment}</p>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
