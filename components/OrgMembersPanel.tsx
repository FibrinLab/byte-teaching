'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@/components/Button'
import { removeOrgMember } from '@/app/actions/member-onboarding'
import type { ManagedOrgMember } from '@/lib/types'

interface OrgMembersPanelProps {
  members: ManagedOrgMember[]
}

function formatMemberName(member: ManagedOrgMember) {
  if (member.full_name?.trim()) {
    return member.full_name
  }

  const fallbackName = [member.first_name, member.last_name].filter(Boolean).join(' ').trim()
  return fallbackName || member.email
}

export function OrgMembersPanel({ members }: OrgMembersPanelProps) {
  const router = useRouter()
  const [loadingUserId, setLoadingUserId] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<string | null>(null)

  async function handleRemove(userId: string) {
    setLoadingUserId(userId)
    setFeedback(null)

    try {
      await removeOrgMember(userId)
      setFeedback('Member removed from this organization.')
      router.refresh()
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Failed to remove member')
    } finally {
      setLoadingUserId(null)
    }
  }

  if (members.length === 0) {
    return <p className="font-mono text-sm text-gray-600">No members found in this organization.</p>
  }

  return (
    <div className="space-y-4">
      {feedback ? (
        <div className="border border-black bg-white px-4 py-3">
          <p className="font-mono text-sm">{feedback}</p>
        </div>
      ) : null}

      <div className="space-y-3">
        {members.map((member) => (
          <div
            key={member.user_id}
            className="flex flex-col gap-4 border border-black bg-white p-4 lg:flex-row lg:items-start lg:justify-between"
          >
            <div className="min-w-0">
              <h3 className="truncate font-mono text-lg font-bold">{formatMemberName(member)}</h3>
              <p className="mt-1 break-all font-mono text-sm text-gray-600">{member.email}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <span className="border border-black px-2 py-1 font-mono text-xs uppercase tracking-[0.2em]">
                  {member.role}
                </span>
                <span className="border border-black px-2 py-1 font-mono text-xs uppercase tracking-[0.2em]">
                  Joined {new Date(member.joined_at).toLocaleDateString('en-GB')}
                </span>
              </div>
              <p className="mt-3 font-mono text-sm">
                <span className="font-bold">Departments:</span>{' '}
                {member.department_names.length > 0 ? member.department_names.join(', ') : 'No departments'}
              </p>
            </div>

            {member.removable ? (
              <Button
                type="button"
                variant="secondary"
                disabled={loadingUserId === member.user_id}
                onClick={() => handleRemove(member.user_id)}
              >
                {loadingUserId === member.user_id ? 'Removing...' : 'Remove Member'}
              </Button>
            ) : (
              <span className="font-mono text-xs uppercase tracking-[0.2em] text-gray-500">
                Protected role
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
