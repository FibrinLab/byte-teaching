'use client'

import Link from 'next/link'
import { Card } from './Card'
import type { AuditMemberSummary } from '@/app/actions/audit'

interface AuditMemberPanelProps {
  summary: AuditMemberSummary
}

export function AuditMemberPanel({ summary }: AuditMemberPanelProps) {
  const roles = [
    { label: 'Admins', count: summary.admins },
    { label: 'Faculty', count: summary.faculty },
    { label: 'Trainees', count: summary.trainees },
  ]

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="border border-black p-4">
          <p className="font-mono text-2xl font-bold">{summary.totalMembers}</p>
          <p className="font-mono text-xs text-gray-600">Total Members</p>
        </div>
        {roles.map(role => (
          <div key={role.label} className="border border-black p-4">
            <p className="font-mono text-2xl font-bold">{role.count}</p>
            <p className="font-mono text-xs text-gray-600">{role.label}</p>
          </div>
        ))}
      </div>

      {summary.pendingJoinRequests > 0 && (
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="font-mono text-sm font-bold">
                {summary.pendingJoinRequests} Pending Join Request{summary.pendingJoinRequests !== 1 ? 's' : ''}
              </p>
              <p className="font-mono text-xs text-gray-600">
                Members waiting for approval
              </p>
            </div>
            <Link
              href="/admin"
              className="px-3 py-1.5 border border-black font-mono text-xs hover:bg-gray-50"
            >
              Review
            </Link>
          </div>
        </Card>
      )}

      {summary.totalMembers === 0 && summary.pendingJoinRequests === 0 && (
        <p className="font-mono text-sm text-gray-600">No members in your departments yet.</p>
      )}
    </div>
  )
}
