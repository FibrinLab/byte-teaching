'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from './Button'
import { Input } from './Input'
import { useToast } from './ToastProvider'
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
  const { showToast } = useToast()
  const [leadName, setLeadName] = useState(initialLeadName)
  const [loading, setLoading] = useState(false)

  async function handleSave() {
    setLoading(true)

    try {
      await updateDepartmentLeadSettings(departmentId, leadName)
      showToast({
        variant: 'success',
        title: 'Settings saved',
        description: 'Certificate signature settings have been updated.',
      })
      router.refresh()
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Save failed',
        description: err instanceof Error ? err.message : 'Failed to save settings',
      })
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
