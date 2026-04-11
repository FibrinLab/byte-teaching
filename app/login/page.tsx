'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Input } from '@/components/Input'
import { Button } from '@/components/Button'
import Link from 'next/link'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || 'Login failed')
        setLoading(false)
        return
      }

      await new Promise((resolve) => setTimeout(resolve, 200))
      window.location.replace('/dashboard')
    } catch (err) {
      console.error('Unexpected error:', err)
      setError(err instanceof Error ? err.message : 'An unexpected error occurred')
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md border border-black bg-white p-6 sm:p-8">
        <div className="flex justify-center mb-6">
          <Image
            src="/assets/byte_logo.png"
            alt="Byte Teaching Logo"
            width={200}
            height={133}
            className="w-auto h-auto max-w-full"
            priority
          />
        </div>
        <h2 className="text-lg sm:text-xl font-mono font-bold mb-2 text-center">Staff Login</h2>
        <p className="mb-6 text-center font-mono text-sm text-gray-600">
          For moderators, org admins, and password-based accounts.
        </p>

        {error ? (
          <div className="mb-4 border border-red-500 bg-red-50 p-4">
            <p className="font-mono text-sm text-red-800">{error}</p>
          </div>
        ) : null}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? 'Logging in...' : 'Login'}
          </Button>
        </form>

        <div className="mt-6 border-t border-black pt-6">
          <h3 className="font-mono text-sm font-bold uppercase tracking-[0.2em]">
            Trainee Access
          </h3>
          <p className="mt-3 font-mono text-sm text-gray-600">
            Trainees invited through a department link should use the passwordless sign-in page.
          </p>
          <Link
            href="/trainee-login"
            className="mt-4 inline-block border border-black bg-white px-4 py-3 font-mono text-sm text-black hover:bg-gray-50"
          >
            Go to Trainee Sign-In
          </Link>
        </div>

        <p className="mt-4 text-center font-mono text-sm">
          Don&apos;t have a staff account?{' '}
          <Link href="/signup" className="underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
