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
    <>
      {/* Mobile: stacked cards */}
      <ul className="space-y-3 md:hidden">
        {sessions.map(session => (
          <li key={session.id} className="border border-gray-300 p-3 font-mono text-sm">
            <div className="flex items-start justify-between gap-2">
              <Link
                href={`/sessions/${session.id}`}
                className="font-bold hover:underline break-words"
              >
                {session.title}
              </Link>
              <span className="flex-shrink-0" title={session.attendanceLocked ? 'Attendance locked' : 'Attendance unlocked'}>
                {session.attendanceLocked ? '🔒' : <span className="text-gray-400">🔓</span>}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-500 break-words">{session.departmentName}</p>
            <p className="mt-2 text-xs text-gray-600">
              {new Date(session.dateStart).toLocaleDateString('en-GB')}
            </p>
            <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="uppercase tracking-[0.14em] text-gray-500">Attend.</dt>
                <dd>
                  <span className="font-bold">{session.attendancePresent}</span>
                  <span className="text-gray-500">/{session.attendanceTotal}</span>
                </dd>
              </div>
              <div>
                <dt className="uppercase tracking-[0.14em] text-gray-500">Rating</dt>
                <dd>
                  {session.averageRating !== null ? (
                    <>
                      {session.averageRating}
                      <span className="text-gray-500">/5</span>
                      <span className="text-xs text-gray-400 ml-1">({session.feedbackCount})</span>
                    </>
                  ) : (
                    <span className="text-gray-400">—</span>
                  )}
                </dd>
              </div>
              <div>
                <dt className="uppercase tracking-[0.14em] text-gray-500">Certs</dt>
                <dd>{session.certificatesIssued > 0 ? session.certificatesIssued : '—'}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>

      {/* Desktop: table */}
      <div className="hidden md:block overflow-x-auto">
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
    </>
  )
}
