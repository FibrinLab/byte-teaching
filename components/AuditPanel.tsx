'use client'

import { useState, useEffect } from 'react'
import { Button } from './Button'

interface AuditEntry {
  id: string
  attendee_first_name: string | null
  attendee_last_name: string | null
  attendee_email: string | null
  rating: number | null
  comment: string | null
  created_at: string
}

interface AuditPanelProps {
  sessionId: string
}

export function AuditPanel({ sessionId }: AuditPanelProps) {
  const [entries, setEntries] = useState<AuditEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    async function fetchAudit() {
      try {
        const res = await fetch(`/api/sessions/${sessionId}/feedback/audit`)
        if (!res.ok) throw new Error('Failed to fetch')
        const data = await res.json()
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
    const headers = ['First Name', 'Last Name', 'Email', 'Rating', 'Submitted At']
    const rows = entries.map(e => [
      e.attendee_first_name || '',
      e.attendee_last_name || '',
      e.attendee_email || '',
      e.rating?.toString() || '',
      new Date(e.created_at).toLocaleString('en-GB'),
    ])

    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `attendance-audit-${sessionId}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  if (loading) {
    return <p className="font-mono text-sm text-gray-600">Loading audit data...</p>
  }

  if (error) {
    return (
      <div className="p-4 border border-red-500 bg-red-50">
        <p className="font-mono text-sm text-red-800">{error}</p>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="font-mono text-sm text-gray-600">
          {entries.length} attendee{entries.length !== 1 ? 's' : ''} recorded
        </p>
        {entries.length > 0 && (
          <Button type="button" variant="secondary" onClick={exportCSV} className="text-xs">
            Export CSV
          </Button>
        )}
      </div>

      {entries.length === 0 ? (
        <p className="font-mono text-sm">No feedback submissions yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full font-mono text-sm border-collapse">
            <thead>
              <tr className="border-b-2 border-black">
                <th className="text-left py-2 pr-4">Name</th>
                <th className="text-left py-2 pr-4">Email</th>
                <th className="text-left py-2 pr-4">Rating</th>
                <th className="text-left py-2">Submitted</th>
              </tr>
            </thead>
            <tbody>
              {entries.map(entry => (
                <tr key={entry.id} className="border-b border-gray-300">
                  <td className="py-2 pr-4">
                    {entry.attendee_first_name} {entry.attendee_last_name}
                  </td>
                  <td className="py-2 pr-4">{entry.attendee_email}</td>
                  <td className="py-2 pr-4">{entry.rating}/5</td>
                  <td className="py-2">{new Date(entry.created_at).toLocaleString('en-GB')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
