'use server'

import { revalidatePath } from 'next/cache'
import { getCurrentUserId, requireAuth } from '@/lib/auth'
import * as organizationsDb from '@/lib/db/organizations'
import { DbNotFoundError } from '@/lib/db'

export async function createOrganization(name: string) {
  const userId = await requireAuth()

  const org = await organizationsDb.insertOrganization({
    name,
    createdBy: userId,
  })

  await organizationsDb.insertOrganizationMember({
    orgId: org.id,
    userId,
    role: 'org_admin',
  })

  revalidatePath('/dashboard')
  revalidatePath('/admin')
  return org
}

export async function getMyOrganizations() {
  const userId = await getCurrentUserId()
  if (!userId) return []
  return organizationsDb.listMyOrganizations(userId)
}

export async function getOrganization(id: string) {
  const org = await organizationsDb.findOrganization(id)
  if (!org) {
    throw new DbNotFoundError(`Organization ${id} not found`)
  }
  return org
}
