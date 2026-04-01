import Link from 'next/link'
import { redirect } from 'next/navigation'
import { NavShell } from '@/components/NavShell'
import { Card } from '@/components/Card'
import { DepartmentForm } from '@/components/DepartmentForm'
import { OrganizationForm } from '@/components/OrganizationForm'
import { getDepartments } from '@/app/actions/departments'
import {
  getCurrentOrgId,
  getCurrentUser,
  isOrgAdmin,
  isOrgManager,
  isSuperAdmin,
} from '@/lib/auth'

export default async function AdminPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const orgId = await getCurrentOrgId()
  const superAdmin = await isSuperAdmin()

  if (!orgId) {
    return (
      <div className="min-h-screen">
        <NavShell />
        <div className="mx-auto max-w-6xl px-6 py-6 sm:px-8 sm:py-8 lg:px-12">
          <h1 className="mb-6 font-mono text-2xl font-bold sm:text-3xl">Admin Panel</h1>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Card>
              <h2 className="mb-4 font-mono text-xl font-bold">Join By Invite</h2>
              <p className="font-mono text-sm text-gray-600">
                Department access is now invite-based. Ask a moderator or org admin for a join
                link or QR code, then complete onboarding from that public invite page.
              </p>
            </Card>

            <Card>
              <h2 className="mb-4 font-mono text-xl font-bold">Create Organization</h2>
              <p className="mb-4 font-mono text-sm text-gray-600">
                Only super admins can create organizations directly.
              </p>
              {superAdmin ? (
                <OrganizationForm />
              ) : (
                <p className="font-mono text-sm text-gray-600">
                  Contact your super admin if you need a new organization created.
                </p>
              )}
            </Card>
          </div>
        </div>
      </div>
    )
  }

  const [orgAdmin, orgManager] = await Promise.all([isOrgAdmin(orgId), isOrgManager(orgId)])

  if (!superAdmin && !orgAdmin) {
    redirect(orgManager ? '/settings' : '/dashboard')
  }

  const departments = await getDepartments()

  return (
    <div className="min-h-screen">
      <NavShell />
      <div className="mx-auto max-w-6xl px-6 py-6 sm:px-8 sm:py-8 lg:px-12">
        <div className="mb-6 sm:mb-8">
          <h1 className="font-mono text-2xl font-bold sm:text-3xl">Admin Panel</h1>
          <p className="mt-2 font-mono text-sm text-gray-600">
            Create departments and manage organization-level setup. Invite links, member access,
            and certificate controls now live in Settings.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card>
            <h2 className="mb-4 font-mono text-xl font-bold">Create Department</h2>
            <DepartmentForm />
          </Card>

          <Card className="lg:col-span-2">
            <h2 className="mb-4 font-mono text-xl font-bold">Departments</h2>
            {departments.length === 0 ? (
              <p className="font-mono text-sm text-gray-600">No departments yet.</p>
            ) : (
              <ul className="space-y-2">
                {departments.map((department) => (
                  <li key={department.id} className="font-mono text-sm">
                    <Link href={`/departments/${department.id}/sessions`} className="underline">
                      {department.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            <Link href="/settings" className="mt-4 inline-block font-mono text-sm underline">
              Go to Settings →
            </Link>
          </Card>
        </div>
      </div>
    </div>
  )
}
