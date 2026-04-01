'use client'

import { useState } from 'react'
import Image from 'next/image'
import { Input } from '@/components/Input'
import { Button } from '@/components/Button'
import Link from 'next/link'
import { sendPasswordlessLoginLink } from '@/app/actions/member-onboarding'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [magicLinkEmail, setMagicLinkEmail] = useState('')
  const [passwordLoading, setPasswordLoading] = useState(false)
  const [magicLinkLoading, setMagicLinkLoading] = useState(false)
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [magicLinkError, setMagicLinkError] = useState<string | null>(null)
  const [magicLinkSuccess, setMagicLinkSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setPasswordLoading(true)
    setPasswordError(null)

    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ email, password }),
      })

      // If not ok, check for error
      if (!response.ok) {
        const data = await response.json()
        setPasswordError(data.error || 'Login failed')
        setPasswordLoading(false)
        return
      }

      // Wait a moment for cookies to be fully set, then redirect
      // This ensures cookies are available when middleware runs
      await new Promise(resolve => setTimeout(resolve, 200))
      
      // Force a full page navigation to ensure cookies are sent
      window.location.replace('/dashboard')
    } catch (err) {
      console.error('Unexpected error:', err)
      setPasswordError(err instanceof Error ? err.message : 'An unexpected error occurred')
      setPasswordLoading(false)
    }
  }

  async function handleMagicLinkSubmit(e: React.FormEvent) {
    e.preventDefault()
    setMagicLinkLoading(true)
    setMagicLinkError(null)
    setMagicLinkSuccess(null)

    try {
      const response = await sendPasswordlessLoginLink(magicLinkEmail)
      setMagicLinkSuccess(response.message)
    } catch (err) {
      setMagicLinkError(err instanceof Error ? err.message : 'Failed to send sign-in link')
    } finally {
      setMagicLinkLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md border border-black p-6 sm:p-8 bg-white">
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
        <h2 className="text-lg sm:text-xl font-mono font-bold mb-4 sm:mb-6 text-center">Login</h2>
        
        {passwordError && (
          <div className="p-4 border border-red-500 bg-red-50 mb-4">
            <p className="font-mono text-sm text-red-800">{passwordError}</p>
          </div>
        )}

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
          <Button type="submit" disabled={passwordLoading} className="w-full">
            {passwordLoading ? 'Logging in...' : 'Login'}
          </Button>
        </form>

        <div className="my-6 border-t border-black pt-6">
          <h3 className="font-mono text-sm font-bold uppercase tracking-[0.2em] mb-3">
            Passwordless Sign-In
          </h3>

          {magicLinkError && (
            <div className="p-4 border border-red-500 bg-red-50 mb-4">
              <p className="font-mono text-sm text-red-800">{magicLinkError}</p>
            </div>
          )}

          {magicLinkSuccess && (
            <div className="p-4 border border-black bg-white mb-4">
              <p className="font-mono text-sm">{magicLinkSuccess}</p>
            </div>
          )}

          <form onSubmit={handleMagicLinkSubmit} className="space-y-4">
            <Input
              label="Email"
              type="email"
              value={magicLinkEmail}
              onChange={(e) => setMagicLinkEmail(e.target.value)}
              required
            />
            <Button type="submit" variant="secondary" disabled={magicLinkLoading} className="w-full">
              {magicLinkLoading ? 'Sending link...' : 'Email Me a Sign-In Link'}
            </Button>
          </form>
        </div>

        <p className="font-mono text-sm mt-4 text-center">
          Don't have an account?{' '}
          <Link href="/signup" className="underline">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  )
}
