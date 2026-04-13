'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Button } from '@/components/Button'
import { createModeratorAccount } from '@/app/actions/super-admin'

interface CreateModeratorFormProps {
  departments: { id: string; name: string; orgName: string }[]
}

export function CreateModeratorForm({ departments }: CreateModeratorFormProps) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [departmentId, setDepartmentId] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await createModeratorAccount({
        email,
        departmentId,
        firstName: firstName || undefined,
        lastName: lastName || undefined,
      })

      setSuccess(`Moderator account created for ${email}. Credentials have been emailed.`)
      setEmail('')
      setFirstName('')
      setLastName('')
      setDepartmentId('')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create moderator account')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      {error && (
        <div className="mb-4 border border-red-500 bg-red-50 p-4">
          <p className="font-mono text-sm text-red-800">{error}</p>
        </div>
      )}

      {success && (
        <div className="mb-4 border border-green-500 bg-green-50 p-4">
          <p className="font-mono text-sm text-green-800">{success}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Select
          label="Department"
          value={departmentId}
          onChange={(e) => setDepartmentId(e.target.value)}
          required
        >
          <option value="">Select a department</option>
          {departments.map((d) => (
            <option key={d.id} value={d.id}>
              {d.name} ({d.orgName})
            </option>
          ))}
        </Select>

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />

        <div className="grid grid-cols-2 gap-4">
          <Input
            label="First Name (optional)"
            value={firstName}
            onChange={(e) => setFirstName(e.target.value)}
          />
          <Input
            label="Last Name (optional)"
            value={lastName}
            onChange={(e) => setLastName(e.target.value)}
          />
        </div>

        <Button type="submit" disabled={loading || !departmentId || !email}>
          {loading ? 'Creating...' : 'Create Moderator Account'}
        </Button>
      </form>
    </div>
  )
}
