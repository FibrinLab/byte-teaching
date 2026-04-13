'use client'

import { useState } from 'react'
import { Button } from '@/components/Button'
import { downloadMyCertificateForSession } from '@/app/actions/certificates'

interface CertificateDownloadButtonProps {
  sessionId: string
}

export function CertificateDownloadButton({ sessionId }: CertificateDownloadButtonProps) {
  const [loading, setLoading] = useState(false)

  async function handleDownload() {
    setLoading(true)
    try {
      const { base64, filename } = await downloadMyCertificateForSession(sessionId)
      const blob = new Blob(
        [Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))],
        { type: 'application/pdf' }
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)
    } catch {
      // Certificate may not exist yet — silently ignore
    } finally {
      setLoading(false)
    }
  }

  return (
    <Button
      type="button"
      variant="secondary"
      onClick={handleDownload}
      disabled={loading}
      className="!py-1 !px-2 !text-xs"
    >
      {loading ? 'Generating...' : 'Certificate'}
    </Button>
  )
}
