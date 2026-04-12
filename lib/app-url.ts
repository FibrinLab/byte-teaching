import { headers } from 'next/headers'

export function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_BASE_URL ||
    'http://localhost:3000'
  )
}

export async function getAppUrlFromHeaders() {
  const envUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_BASE_URL
  if (envUrl) return envUrl

  const h = await headers()
  const host = h.get('x-forwarded-host') || h.get('host')
  if (host) {
    const proto = h.get('x-forwarded-proto') || 'https'
    return `${proto}://${host}`
  }

  return 'http://localhost:3000'
}
