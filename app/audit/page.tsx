import { redirect } from 'next/navigation'
import { getCurrentUser, getCurrentOrgId, isOrgAdmin, isSuperAdmin } from '@/lib/auth'
import { getMyModeratedDepartments } from '@/app/actions/departments'
import { getAuditPageData } from '@/app/actions/audit'
import { NavShell } from '@/components/NavShell'
import { AuditDashboard } from '@/components/AuditDashboard'

export default async function AuditPage() {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const orgId = await getCurrentOrgId()
  if (!orgId) redirect('/dashboard')

  // Check if user has audit access (moderator, org admin, or super admin)
  const orgAdmin = await isOrgAdmin()
  const superAdmin = await isSuperAdmin()
  const moderatedDepts = await getMyModeratedDepartments()

  if (!orgAdmin && !superAdmin && moderatedDepts.length === 0) {
    redirect('/certificates')
  }

  const auditData = await getAuditPageData()

  return (
    <div className="min-h-screen">
      <NavShell />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <h1 className="text-2xl sm:text-3xl font-mono font-bold mb-2">
          Audit & Governance
        </h1>
        <p className="font-mono text-sm text-gray-600 mb-6">
          {auditData.departmentNames.map(d => d.name).join(', ')}
        </p>
        <AuditDashboard data={auditData} />
      </div>
    </div>
  )
}
