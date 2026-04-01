import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getCurrentOrgId, getCurrentUser, isOrgAdmin, isOrgManager } from '@/lib/auth'
import { NavShell } from '@/components/NavShell'
import { Card } from '@/components/Card'
import { SignatureUploadPanel } from '@/components/SignatureUploadPanel'
import { DepartmentInviteLinksPanel } from '@/components/DepartmentInviteLinksPanel'
import { OrgMembersPanel } from '@/components/OrgMembersPanel'
import {
  getDepartmentLeadSettings,
  getDepartmentsForOrg,
  getMyModeratedDepartments,
} from '@/app/actions/departments'
import {
  getManagedDepartmentInviteLinks,
  getOrgMembersForManagement,
} from '@/app/actions/member-onboarding'
import type { ManagedDepartmentInviteLink, ManagedOrgMember } from '@/lib/types'

export default async function SettingsPage() {
  const user = await getCurrentUser()

  if (!user) {
    redirect('/login')
  }

  const orgId = await getCurrentOrgId()

  let editableDepartments: { id: string; name: string }[] = []
  let orgManager = false
  let inviteLinks: ManagedDepartmentInviteLink[] = []
  let orgMembers: ManagedOrgMember[] = []

  if (orgId) {
    const [orgAdmin, canManageOrgAccess, orgDepartments, moderatedDepartments] = await Promise.all([
      isOrgAdmin(orgId),
      isOrgManager(orgId),
      getDepartmentsForOrg(orgId),
      getMyModeratedDepartments(orgId),
    ])

    orgManager = canManageOrgAccess

    editableDepartments = orgAdmin
      ? orgDepartments.map((department) => ({
          id: department.id,
          name: department.name,
        }))
      : moderatedDepartments

    if (orgManager) {
      ;[inviteLinks, orgMembers] = await Promise.all([
        getManagedDepartmentInviteLinks(),
        getOrgMembersForManagement(),
      ])
    }
  }

  const departmentSettings = await Promise.all(
    editableDepartments.map(async (department) => ({
      department,
      settings: await getDepartmentLeadSettings(department.id),
    }))
  )
  const hasSettingsContent = orgManager || departmentSettings.length > 0

  return (
    <div className="min-h-screen">
      <NavShell />
      <div className="mx-auto max-w-6xl px-6 py-6 sm:px-8 sm:py-8 lg:px-12">
        <div className="mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h1 className="text-2xl sm:text-3xl font-mono font-bold">Settings</h1>
            <p className="mt-2 font-mono text-sm text-gray-600">
              Manage department access, invite links, and certificate defaults.
            </p>
          </div>
          <Link
            href="/dashboard"
            className="border border-black bg-white px-4 py-3 text-center font-mono text-sm text-black hover:bg-gray-50"
          >
            Back to Dashboard
          </Link>
        </div>

        {!orgId ? (
          <Card>
            <h2 className="mb-3 text-xl font-mono font-bold">Organization Required</h2>
            <p className="mb-4 font-mono text-sm text-gray-600">
              Join or create an organization before configuring certificate settings.
            </p>
            <Link href="/admin" className="font-mono text-sm underline">
              Go to Admin →
            </Link>
          </Card>
        ) : !hasSettingsContent ? (
          <Card>
            <h2 className="mb-3 text-xl font-mono font-bold">No Editable Settings</h2>
            <p className="font-mono text-sm text-gray-600">
              Settings are available to department moderators and org admins.
            </p>
          </Card>
        ) : (
          <div className="space-y-6">
            {orgManager ? (
              <>
                <Card>
                  <h2 className="mb-2 text-xl font-mono font-bold">Department Invite Links</h2>
                  <p className="mb-5 font-mono text-sm text-gray-600">
                    Share reusable department invite links or QR codes with new members. Invited
                    users are added directly to this organization and department after completing
                    the email flow.
                  </p>
                  <DepartmentInviteLinksPanel links={inviteLinks} />
                </Card>

                <Card>
                  <h2 className="mb-2 text-xl font-mono font-bold">Organization Members</h2>
                  <p className="mb-5 font-mono text-sm text-gray-600">
                    Remove trainees or faculty from this organization. Protected roles stay managed
                    separately.
                  </p>
                  <OrgMembersPanel members={orgMembers} />
                </Card>
              </>
            ) : null}

            <Card>
              <h2 className="mb-2 text-xl font-mono font-bold">Certificate Settings</h2>
              <p className="font-mono text-sm text-gray-600">
                Update the teaching lead signature shown on certificate PDFs and preview each
                department&apos;s current certificate layout before issuing it.
              </p>
            </Card>

            <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
              {departmentSettings.map(({ department, settings }) => (
                <Card key={department.id}>
                  <div className="mb-5">
                    <h2 className="text-xl font-mono font-bold">{department.name}</h2>
                    <p className="mt-2 font-mono text-sm text-gray-600">
                      Certificates issued for this department will use these signature details.
                    </p>
                  </div>
                  <SignatureUploadPanel
                    departmentId={department.id}
                    initialLeadName={settings.leadName}
                  />
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
