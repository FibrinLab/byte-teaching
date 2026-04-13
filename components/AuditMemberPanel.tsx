'use client'

import { useState } from 'react'
import { Button } from './Button'
import { generateMemberAttendanceReportPDF } from '@/app/actions/audit'
import type { AuditMemberSummary, AuditMemberRow } from '@/app/actions/audit'

interface AuditMemberPanelProps {
  summary: AuditMemberSummary
  members: AuditMemberRow[]
}

const ROLE_LABELS: Record<string, string> = {
  org_admin: 'Admin',
  department_admin: 'Moderator',
  faculty: 'Faculty',
  trainee: 'Trainee',
}

export function AuditMemberPanel({ summary, members }: AuditMemberPanelProps) {
  const [downloadingId, setDownloadingId] = useState<string | null>(null)

  async function handleDownloadReport(userId: string) {
    setDownloadingId(userId)
    try {
      const { base64, filename } = await generateMemberAttendanceReportPDF(userId)
      const blob = new Blob(
        [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
        { type: 'application/pdf' }
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      console.error('Failed to generate report:', err)
    } finally {
      setDownloadingId(null)
    }
  }

  const roles = [
    { label: 'Total', count: summary.totalMembers },
    { label: 'Admins', count: summary.admins },
    { label: 'Faculty', count: summary.faculty },
    { label: 'Trainees', count: summary.trainees },
  ]

  return (
    <div className="space-y-6">
      {/* Summary stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {roles.map((role) => (
          <div key={role.label} className="border border-black p-4">
            <p className="font-mono text-2xl font-bold">{role.count}</p>
            <p className="font-mono text-xs text-gray-600">{role.label}</p>
          </div>
        ))}
      </div>

      {/* Member table */}
      {members.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse font-mono text-sm">
            <thead>
              <tr className="border-b-2 border-black text-left">
                <th className="pb-2 pr-4">Name</th>
                <th className="pb-2 pr-4">Grade</th>
                <th className="pb-2 pr-4">Role</th>
                <th className="pb-2 pr-4">Attended</th>
                <th className="pb-2 pr-4">Rate</th>
                <th className="pb-2"></th>
              </tr>
            </thead>
            <tbody>
              {members.map((m) => {
                const name = m.full_name || m.email
                const rateBadge =
                  m.attendance_pct >= 80
                    ? 'bg-green-100 text-green-800'
                    : m.attendance_pct >= 60
                      ? 'bg-yellow-100 text-yellow-800'
                      : 'bg-red-100 text-red-800'

                return (
                  <tr key={m.user_id} className="border-b border-gray-200">
                    <td className="py-2 pr-4">
                      <div>{name}</div>
                      {m.full_name && (
                        <div className="text-xs text-gray-400">{m.email}</div>
                      )}
                    </td>
                    <td className="py-2 pr-4">{m.grade || '—'}</td>
                    <td className="py-2 pr-4">
                      <span className="bg-gray-100 px-2 py-0.5 text-xs">
                        {ROLE_LABELS[m.role] || m.role}
                      </span>
                    </td>
                    <td className="py-2 pr-4">
                      {m.sessions_attended} / {m.sessions_total}
                    </td>
                    <td className="py-2 pr-4">
                      <span className={`px-2 py-0.5 text-xs ${rateBadge}`}>
                        {m.attendance_pct}%
                      </span>
                    </td>
                    <td className="py-2 text-right">
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={downloadingId === m.user_id}
                        onClick={() => handleDownloadReport(m.user_id)}
                        className="!py-1 !px-2 !text-xs"
                      >
                        {downloadingId === m.user_id ? 'Generating...' : 'Report'}
                      </Button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {members.length === 0 && (
        <p className="font-mono text-sm text-gray-400">No members in your departments yet.</p>
      )}
    </div>
  )
}
