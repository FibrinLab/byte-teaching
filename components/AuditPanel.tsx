'use client'

import { useEffect, useState } from 'react'
import { Button } from './Button'
import { formatFeedbackAnswerValue } from '@/lib/feedback-form'
import type { SubmittedFeedbackAnswer } from '@/lib/types'

interface AuditEntry {
  id: string
  attendee_first_name: string | null
  attendee_last_name: string | null
  attendee_email: string | null
  rating: number | null
  comment: string | null
  answers: SubmittedFeedbackAnswer[]
  created_at: string
}

interface AuditPanelProps {
  sessionId: string
}

function stringifyResponses(entry: AuditEntry) {
  const answeredFields = entry.answers.filter((answer) => answer.value || answer.comment)

  if (answeredFields.length === 0) {
    return entry.comment || ''
  }

  return answeredFields
    .map((answer) => {
      const value = formatFeedbackAnswerValue(answer)
      const parts = [answer.label, value]
      if (answer.comment) {
        parts.push(answer.comment)
      }
      return parts.join(': ')
    })
    .join(' | ')
}

export function AuditPanel({ sessionId }: AuditPanelProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAudit() {
      try {
        const response = await fetch(`/api/sessions/${sessionId}/feedback/audit`)
        if (!response.ok) {
          throw new Error('Failed to fetch')
        }

        const data = await response.json()
        setEntries(data)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load audit data')
      } finally {
        setLoading(false)
      }
    }

    fetchAudit()
  }, [sessionId])

  function exportCSV() {
    const headers = ['First Name', 'Last Name', 'Email', 'Overall Rating', 'Responses', 'Submitted At']
    const rows = entries.map((entry) => [
      entry.attendee_first_name || '',
      entry.attendee_last_name || '',
      entry.attendee_email || '',
      entry.rating?.toString() || '',
      stringifyResponses(entry),
      new Date(entry.created_at).toLocaleString('en-GB'),
    ])

    const csv = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell.replaceAll('"', '""')}"`).join(','))
      .join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `attendance-audit-${sessionId}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <p className="font-mono text-sm text-gray-600">Loading audit data...</p>
  }

  if (error) {
    return (
      <div className="border border-red-500 bg-red-50 p-4">
        <p className="font-mono text-sm text-red-800">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="font-mono text-sm text-gray-600">
          {entries.length} attendee{entries.length !== 1 ? 's' : ''} recorded
        </p>
        {entries.length > 0 ? (
          <Button type="button" variant="secondary" onClick={exportCSV} className="text-xs w-full sm:w-auto">
            Export CSV
          </Button>
        ) : null}
      </div>

      {entries.length === 0 ? (
        <p className="font-mono text-sm">No feedback submissions yet.</p>
      ) : (
        <>
          {/* Mobile: stacked cards */}
          <ul className="space-y-3 md:hidden">
            {entries.map((entry) => (
              <li key={entry.id} className="border border-gray-300 p-3 font-mono text-sm">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-bold break-words">
                    {entry.attendee_first_name} {entry.attendee_last_name}
                  </span>
                  <span className="flex-shrink-0 text-xs font-bold">
                    {entry.rating !== null ? `${entry.rating}/5` : 'N/A'}
                  </span>
                </div>
                <p className="mt-1 text-xs text-gray-600 break-all">{entry.attendee_email}</p>
                <p className="mt-2 text-xs leading-5 text-gray-700 break-words">
                  {stringifyResponses(entry)}
                </p>
                <p className="mt-2 text-xs text-gray-500">
                  {new Date(entry.created_at).toLocaleString('en-GB')}
                </p>
              </li>
            ))}
          </ul>

          {/* Desktop: table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full border-collapse font-mono text-sm">
              <thead>
                <tr className="border-b-2 border-black">
                  <th className="py-2 pr-4 text-left">Name</th>
                  <th className="py-2 pr-4 text-left">Email</th>
                  <th className="py-2 pr-4 text-left">Overall</th>
                  <th className="py-2 pr-4 text-left">Responses</th>
                  <th className="py-2 text-left">Submitted</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-gray-300 align-top">
                    <td className="py-3 pr-4">
                      {entry.attendee_first_name} {entry.attendee_last_name}
                    </td>
                    <td className="py-3 pr-4">{entry.attendee_email}</td>
                    <td className="py-3 pr-4">{entry.rating !== null ? `${entry.rating}/5` : 'N/A'}</td>
                    <td className="py-3 pr-4 text-xs leading-5 text-gray-700">{stringifyResponses(entry)}</td>
                    <td className="py-3">{new Date(entry.created_at).toLocaleString('en-GB')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}
