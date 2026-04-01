import { redirect } from 'next/navigation'

export default async function DepartmentSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  await params
  redirect('/settings')
}
