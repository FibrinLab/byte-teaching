'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/Button'
import { useToast } from '@/components/ToastProvider'
import { removeDepartmentMember } from '@/app/actions/departments'
import type { DepartmentMemberWithProfile } from '@/app/actions/departments'

interface DepartmentMembersPanelProps {
  departmentId: string
  departmentName: string
  members: DepartmentMemberWithProfile[]
}

const ROLE_LABELS: Record<string, string> = {
  org_admin: 'Admin',
  department_admin: 'Moderator',
  faculty: 'Faculty',
  trainee: 'Trainee',
}

const PROTECTED_ROLES = new Set(['org_admin', 'department_admin'])

export function DepartmentMembersPanel({ departmentId, departmentName, members }: DepartmentMembersPanelProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const [removingId, setRemovingId] = useState<string | null>(null)

  async function handleRemove(userId: string) {
    if (!confirm('Remove this member from the department?')) return

    setRemovingId(userId)

    try {
      await removeDepartmentMember(departmentId, userId)
      showToast({ variant: 'success', title: 'Member removed' })
      router.refresh()
    } catch (err) {
      showToast({ variant: 'error', title: 'Failed to remove member', description: err instanceof Error ? err.message : undefined })
    } finally {
      setRemovingId(null)
    }
  }

  if (members.length === 0) {
    return <p className="font-mono text-sm text-gray-400">No members in this department yet.</p>
  }

  return (
    <div>
      <p className="mb-3 font-mono text-sm text-gray-600">
        {members.length} member{members.length !== 1 ? 's' : ''} in {departmentName}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-sm">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="pb-2 pr-4">Name</th>
              <th className="pb-2 pr-4">Email</th>
              <th className="pb-2 pr-4">Grade</th>
              <th className="pb-2 pr-4">Role</th>
              <th className="pb-2"></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => {
              const name =
                m.full_name ||
                [m.first_name, m.last_name].filter(Boolean).join(' ') ||
                '—'
              const canRemove = !PROTECTED_ROLES.has(m.role)

              return (
                <tr key={m.user_id} className="border-b border-gray-200">
                  <td className="py-2 pr-4">{name}</td>
                  <td className="py-2 pr-4 text-gray-500">{m.email}</td>
                  <td className="py-2 pr-4">{m.grade || '—'}</td>
                  <td className="py-2 pr-4">
                    <span className="inline-block bg-gray-100 px-2 py-0.5 text-xs">
                      {ROLE_LABELS[m.role] || m.role}
                    </span>
                  </td>
                  <td className="py-2 text-right">
                    {canRemove && (
                      <Button
                        type="button"
                        variant="secondary"
                        disabled={removingId === m.user_id}
                        onClick={() => handleRemove(m.user_id)}
                        className="!py-1 !px-2 !text-xs"
                      >
                        {removingId === m.user_id ? 'Removing...' : 'Remove'}
                      </Button>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
