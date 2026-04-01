'use client'

import Link from 'next/link'
import type { AuditSessionRow } from '@/app/actions/audit'

interface AuditSessionsTableProps {
  sessions: AuditSessionRow[]
}

export function AuditSessionsTable({ sessions }: AuditSessionsTableProps) {
  if (sessions.length === 0) {
    return (
      <p className="font-mono text-sm text-gray-600">No published sessions yet.</p>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-mono text-sm">
        <thead>
          <tr className="border-b-2 border-black text-left">
            <th className="py-2 pr-4 whitespace-nowrap">Session</th>
            <th className="py-2 pr-4 whitespace-nowrap">Date</th>
            <th className="py-2 pr-4 whitespace-nowrap">Attendance</th>
            <th className="py-2 pr-4 whitespace-nowrap">Rating</th>
            <th className="py-2 pr-4 whitespace-nowrap">Certs</th>
            <th className="py-2 whitespace-nowrap">Locked</th>
          </tr>
        </thead>
        <tbody>
          {sessions.map(session => (
            <tr key={session.id} className="border-b border-gray-200">
              <td className="py-2 pr-4">
                <Link
                  href={`/sessions/${session.id}`}
                  className="hover:underline"
                >
                  {session.title}
                </Link>
                <span className="block text-xs text-gray-500">
                  {session.departmentName}
                </span>
              </td>
              <td className="py-2 pr-4 whitespace-nowrap text-gray-600">
                {new Date(session.dateStart).toLocaleDateString('en-GB')}
              </td>
              <td className="py-2 pr-4 whitespace-nowrap">
                <span className="font-bold">{session.attendancePresent}</span>
                <span className="text-gray-500">/{session.attendanceTotal}</span>
              </td>
              <td className="py-2 pr-4 whitespace-nowrap">
                {session.averageRating !== null ? (
                  <span>
                    {session.averageRating}
                    <span className="text-gray-500">/5</span>
                    <span className="text-xs text-gray-400 ml-1">
                      ({session.feedbackCount})
                    </span>
                  </span>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="py-2 pr-4 whitespace-nowrap">
                {session.certificatesIssued > 0 ? session.certificatesIssued : '—'}
              </td>
              <td className="py-2 whitespace-nowrap">
                {session.attendanceLocked ? (
                  <span title="Attendance locked">🔒</span>
                ) : (
                  <span className="text-gray-400" title="Attendance unlocked">🔓</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
