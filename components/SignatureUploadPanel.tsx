'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from './Button'
import { Input } from './Input'
import { updateDepartmentLeadSettings } from '@/app/actions/departments'

interface SignatureUploadPanelProps {
  departmentId: string
  initialLeadName: string
}

export function SignatureUploadPanel({
  departmentId,
  initialLeadName,
}: SignatureUploadPanelProps) {
  const router = useRouter()
  const [leadName, setLeadName] = useState(initialLeadName)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function handleSave() {
    setLoading(true)
    setError(null)
    setSuccess(null)

    try {
      await updateDepartmentLeadSettings(departmentId, leadName)
      setSuccess('Settings saved')
      router.refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings')
    } finally {
      setLoading(false)
    }
  }

  function handlePreview() {
    window.open(`/api/certificates/preview?departmentId=${departmentId}`, '_blank')
  }

  return (
    <div className="space-y-4">
      <h3 className="font-mono font-bold text-sm">Certificate Settings</h3>

      {error && (
        <p className="font-mono text-xs text-red-600">{error}</p>
      )}
      {success && (
        <p className="font-mono text-xs text-green-600">{success}</p>
      )}

      <Input
        label="Teaching Lead Name"
        type="text"
        value={leadName}
        onChange={(e) => setLeadName(e.target.value)}
        placeholder="e.g. Dr. Jane Smith"
      />
      <p className="font-mono text-xs text-gray-500">
        This name will appear as the signature on attendance certificates.
      </p>

      <div className="flex flex-col sm:flex-row gap-3">
        <Button
          type="button"
          onClick={handleSave}
          disabled={loading}
          className="flex-1"
        >
          {loading ? 'Saving...' : 'Save Settings'}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={handlePreview}
          className="flex-1"
        >
          Preview Certificate
        </Button>
      </div>
    </div>
  )
}
