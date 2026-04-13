'use client'

import { useState } from 'react'

interface SuperAdminTabsProps {
  manage: React.ReactNode
  users: React.ReactNode
  moderators: React.ReactNode
}

export function SuperAdminTabs({ manage, users, moderators }: SuperAdminTabsProps) {
  const [active, setActive] = useState<'manage' | 'users' | 'moderators'>('manage')

  const tabClass = (tab: string) =>
    `px-4 py-2 border border-black font-mono text-sm ${
      active === tab ? 'bg-black text-white' : 'bg-white text-black'
    }`

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button type="button" className={tabClass('manage')} onClick={() => setActive('manage')}>
          Organisations
        </button>
        <button type="button" className={tabClass('moderators')} onClick={() => setActive('moderators')}>
          Moderators
        </button>
        <button type="button" className={tabClass('users')} onClick={() => setActive('users')}>
          Users
        </button>
      </div>

      {active === 'manage' && manage}
      {active === 'moderators' && moderators}
      {active === 'users' && users}
    </div>
  )
}
