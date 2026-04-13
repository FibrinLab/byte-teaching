'use client'

import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { Input } from '@/components/Input'
import { Button } from '@/components/Button'
import { PasswordlessLoginForm } from '@/components/PasswordlessLoginForm'

export default function LoginPage() {
  const [showPassword, setShowPassword] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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

        <h2 className="text-lg sm:text-xl font-mono font-bold mb-2 text-center">Sign In</h2>
        <p className="mb-6 text-center font-mono text-sm text-gray-600">
          Enter your email to receive a sign-in link.
        </p>

        {/* Passwordless login (default) */}
        {!showPassword && <PasswordlessLoginForm />}

        {/* Password login (admin toggle) */}
        {showPassword && (
          <>
            {error && (
              <div className="mb-4 border border-red-500 bg-red-50 p-4">
                <p className="font-mono text-sm text-red-800">{error}</p>
              </div>
            )}
            <form onSubmit={handlePasswordLogin} className="space-y-4">
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
                {loading ? 'Signing in...' : 'Sign In'}
              </Button>
            </form>
          </>
        )}

        {/* Toggle */}
        <div className="mt-6 border-t border-gray-200 pt-4 text-center">
          <button
            type="button"
            onClick={() => { setShowPassword(!showPassword); setError(null) }}
            className="font-mono text-xs text-gray-400 underline"
          >
            {showPassword ? 'Use magic link instead' : 'Admin? Sign in with password'}
          </button>
        </div>

        {/* Join link */}
        <div className="mt-4 text-center">
          <Link href="/join/dept" className="font-mono text-sm underline">
            New here? Join a department
          </Link>
        </div>
      </div>
    </div>
  )
}
