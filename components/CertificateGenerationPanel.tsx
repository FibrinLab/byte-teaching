'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from './Button'
import { useToast } from './ToastProvider'
import { generateCertificatesForSession } from '@/app/actions/certificates'

interface CertificateGenerationPanelProps {
  sessionId: string
  attendance: any[]
}

export function CertificateGenerationPanel({
  sessionId,
  attendance,
}: CertificateGenerationPanelProps) {
  const router = useRouter()
  const { showToast } = useToast()
  const [loading, setLoading] = useState(false)

  const presentAttendees = attendance.filter(a => a.status === 'PRESENT' || a.status === 'LATE')

  async function handleGenerateCertificates() {
    setLoading(true)

    try {
      await generateCertificatesForSession(sessionId)
      showToast({
        variant: 'success',
        title: 'Certificates generated',
        description: 'They are now available in the Certificates section.',
      })
      router.refresh()
    } catch (err) {
      showToast({
        variant: 'error',
        title: 'Certificate generation failed',
        description: err instanceof Error ? err.message : 'Failed to generate certificates',
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="font-mono text-sm mb-4">
          Generate attendance certificates for all present attendees and teachers. Certificates will include QR codes for verification.
        </p>
        <p className="font-mono text-sm text-gray-600 mb-4">
          Eligible recipients: <strong>{presentAttendees.length}</strong> present/late attendees + teachers
        </p>
      </div>

      <Button
        type="button"
        onClick={handleGenerateCertificates}
        disabled={loading || presentAttendees.length === 0}
      >
        {loading ? 'Generating...' : 'Generate Certificates'}
      </Button>

      {presentAttendees.length === 0 && (
        <p className="font-mono text-sm text-gray-600">
          No present attendees found. Certificates can only be generated for attendees who checked in.
        </p>
      )}
    </div>
  )
}
