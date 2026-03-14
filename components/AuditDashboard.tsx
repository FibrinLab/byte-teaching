'use client'

import { useState } from 'react'
import { AuditSessionsTable } from './AuditSessionsTable'
import { AuditCertificateTable } from './AuditCertificateTable'
import { AuditMemberPanel } from './AuditMemberPanel'
import type { AuditPageData } from '@/app/actions/audit'

interface AuditDashboardProps {
  data: AuditPageData
}

export function AuditDashboard({ data }: AuditDashboardProps) {
  const [activeTab, setActiveTab] = useState<'sessions' | 'certificates' | 'members'>('sessions')

  const tabs = [
    { id: 'sessions' as const, label: 'Sessions' },
    { id: 'certificates' as const, label: 'Certificates' },
    { id: 'members' as const, label: 'Members' },
  ]

  const { stats } = data

  return (
    <div className="space-y-6">
      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Sessions" value={stats.totalSessions} />
        <StatCard
          label="Attendance Rate"
          value={`${stats.averageAttendanceRate}%`}
        />
        <StatCard
          label="Avg Rating"
          value={stats.averageFeedbackRating > 0 ? `${stats.averageFeedbackRating}/5` : '—'}
        />
        <StatCard label="Certificates" value={stats.certificatesIssued} />
      </div>

      {/* Tabs */}
      <div className="border-b border-black mb-6">
        <div className="flex gap-0 overflow-x-auto">
          {tabs.map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 font-mono text-sm whitespace-nowrap border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-black font-bold'
                  : 'border-transparent text-gray-500 hover:text-black'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {activeTab === 'sessions' && (
        <AuditSessionsTable sessions={data.recentSessions} />
      )}
      {activeTab === 'certificates' && (
        <AuditCertificateTable certificates={data.certificates} />
      )}
      {activeTab === 'members' && (
        <AuditMemberPanel summary={data.memberSummary} />
      )}
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border border-black p-4">
      <p className="font-mono text-2xl font-bold">{value}</p>
      <p className="font-mono text-xs text-gray-600">{label}</p>
    </div>
  )
}
