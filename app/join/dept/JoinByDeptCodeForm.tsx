'use client'

import { useState } from 'react'
import { Input } from '@/components/Input'
import { Select } from '@/components/Select'
import { Button } from '@/components/Button'
import { lookupDepartmentByCode, beginDepartmentOnboarding } from '@/app/actions/member-onboarding'
import { TRAINEE_GRADES } from '@/lib/types'

interface JoinByDeptCodeFormProps {
  signedInEmail: string | null
  initialFirstName: string
  initialLastName: string
}

export function JoinByDeptCodeForm({
  signedInEmail,
  initialFirstName,
  initialLastName,
}: JoinByDeptCodeFormProps) {
  const [step, setStep] = useState<'code' | 'details' | 'done'>('code')
  const [deptCode, setDeptCode] = useState('')
  const [deptName, setDeptName] = useState('')
  const [orgName, setOrgName] = useState('')

  const [email, setEmail] = useState(signedInEmail ?? '')
  const [firstName, setFirstName] = useState(initialFirstName)
  const [lastName, setLastName] = useState(initialLastName)
  const [grade, setGrade] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleCodeSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const dept = await lookupDepartmentByCode(deptCode)
      if (!dept) {
        setError('No department found with that code. Please check and try again.')
        return
      }
      setDeptName(dept.department_name)
      setOrgName(dept.org_name)
      setStep('details')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to look up department')
    } finally {
      setLoading(false)
    }
  }

  async function handleDetailsSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      const result = await beginDepartmentOnboarding({
        departmentCode: deptCode,
        email,
        firstName,
        lastName,
        grade: grade || undefined,
      })

      if (result.status === 'joined') {
        window.location.replace(result.redirectTo)
        return
      }

      if (result.status === 'email-sent') {
        setSuccess(result.message)
        setStep('done')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join department')
    } finally {
      setLoading(false)
    }
  }

  return (
    <>
      {error && (
        <div className="border border-red-500 bg-red-50 p-4 mb-4">
          <p className="font-mono text-sm text-red-800">{error}</p>
        </div>
      )}

      {step === 'code' && (
        <form onSubmit={handleCodeSubmit} className="space-y-4 border border-black bg-white p-6">
          <Input
            label="Department Code"
            value={deptCode}
            onChange={(e) => setDeptCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="e.g. 482913"
            maxLength={6}
            pattern="\d{6}"
            required
            className="text-center text-2xl tracking-[0.3em] font-mono"
          />
          <Button type="submit" disabled={loading || deptCode.length !== 6} className="w-full">
            {loading ? 'Looking up...' : 'Find Department'}
          </Button>
        </form>
      )}

      {step === 'details' && (
        <>
          <div className="border border-black bg-white p-4 mb-4">
            <p className="font-mono text-xs uppercase tracking-[0.2em] text-gray-500">Department</p>
            <h2 className="mt-1 font-mono text-xl font-bold">{deptName}</h2>
            <p className="mt-1 font-mono text-sm text-gray-600">{orgName}</p>
            <button
              type="button"
              onClick={() => { setStep('code'); setError(null) }}
              className="mt-2 font-mono text-xs underline text-gray-500"
            >
              Change code
            </button>
          </div>

          <form onSubmit={handleDetailsSubmit} className="space-y-4 border border-black bg-white p-6">
            {signedInEmail ? (
              <div>
                <label className="block mb-1 text-sm font-mono">Email</label>
                <p className="px-3 py-2 border border-black bg-gray-50 font-mono text-sm text-gray-600">
                  {signedInEmail}
                </p>
              </div>
            ) : (
              <Input
                label="Email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            )}
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="First Name"
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                required
              />
              <Input
                label="Last Name"
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                required
              />
            </div>
            <Select
              label="Grade"
              value={grade}
              onChange={(e) => setGrade(e.target.value)}
              required
            >
              <option value="">Select your grade</option>
              {TRAINEE_GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </Select>
            <Button type="submit" disabled={loading} className="w-full">
              {loading ? 'Joining...' : 'Join Department'}
            </Button>
          </form>
        </>
      )}

      {step === 'done' && success && (
        <div className="border border-black bg-white p-6">
          <h3 className="font-mono text-lg font-bold">Check Your Email</h3>
          <p className="mt-3 font-mono text-sm text-gray-600">{success}</p>
          <p className="mt-3 font-mono text-sm text-gray-600">
            After opening the link, you will finish joining the department and land on your dashboard.
          </p>
        </div>
      )}
    </>
  )
}
