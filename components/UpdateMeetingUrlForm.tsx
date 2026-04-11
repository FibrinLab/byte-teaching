'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from './Input'
import { Button } from './Button'
import { useToast } from './ToastProvider'
import { updateSessionMeetingUrl } from '@/app/actions/sessions'

interface UpdateMeetingUrlFormProps {
  sessionId: string
  currentUrl: string | null
}

export function UpdateMeetingUrlForm({ sessionId, currentUrl }: UpdateMeetingUrlFormProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setLoading(true)

    const formData = new FormData(e.currentTarget)
    const url = formData.get('url')?.toString() || null

    try {
      await updateSessionMeetingUrl(sessionId, url || '')
      showToast({
        variant: 'success',
        title: 'Meeting URL updated',
        description: 'The session meeting link has been saved.',
      })
      router.refresh()
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Update failed',
        description: err instanceof Error ? err.message : 'Failed to update meeting URL',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Input
        label="MS Teams Meeting URL"
        name="url"
        type="url"
        defaultValue={currentUrl || ''}
        placeholder="https://teams.microsoft.com/..."
      />

      <div className="flex gap-4">
        <Button type="submit" disabled={loading}>
          {loading ? 'Updating...' : 'Update URL'}
        </Button>
      </div>
    </form>
  )
}
