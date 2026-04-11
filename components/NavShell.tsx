import { Nav } from '@/components/Nav'
import { getCurrentUserId, isSuperAdmin } from '@/lib/auth'
import * as organizationsDb from '@/lib/db/organizations'

export async function NavShell() {
  const userId = await getCurrentUserId()
  let adminLink: { href: string; label: string } | null = null
  let roleLabel: string | null = null

  if (userId) {
    if (await isSuperAdmin()) {
      adminLink = { href: '/super-admin', label: 'Super Admin' }
      roleLabel = 'Super Admin'
    } else if (await organizationsDb.userIsOrgAdminAnywhere(userId)) {
      adminLink = { href: '/admin', label: 'Admin' }
      roleLabel = 'Org Admin'
    } else if (await organizationsDb.userIsDepartmentAdminAnywhere(userId)) {
      roleLabel = 'Moderator'
    }
  }

  return <Nav adminLink={adminLink} roleLabel={roleLabel} />
}
