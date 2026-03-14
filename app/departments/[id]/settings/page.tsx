import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/auth'
import { NavShell } from '@/components/NavShell'
import { Card } from '@/components/Card'
import { SignatureUploadPanel } from '@/components/SignatureUploadPanel'
import { getDepartmentLeadSettings } from '@/app/actions/departments'
import { getMyModeratedDepartment } from '@/app/actions/departments'
import Link from 'next/link'

export default async function DepartmentSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { id: departmentId } = await params

  // Verify user moderates this department
  const moderatedDept = await getMyModeratedDepartment()
  if (!moderatedDept || moderatedDept.id !== departmentId) {
    redirect('/dashboard')
  }

  const leadSettings = await getDepartmentLeadSettings(departmentId)

  return (
    <div className="min-h-screen">
      <NavShell />
      <div className="max-w-2xl mx-auto px-4 sm:px-6 py-6 sm:py-8">
        <Link href="/dashboard" className="font-mono text-sm underline mb-6 inline-block">
          ← Back to dashboard
        </Link>

        <h1 className="text-2xl sm:text-3xl font-mono font-bold mb-2">Certificate Settings</h1>
        <p className="font-mono text-sm text-gray-600 mb-6">{moderatedDept.name}</p>

        <Card>
          <SignatureUploadPanel
            departmentId={departmentId}
            initialLeadName={leadSettings.leadName}
          />
        </Card>
      </div>
    </div>
  )
}
