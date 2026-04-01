'use client'

import { useState } from 'react'
import { Input } from './Input'
import type { AuditCertificateRow } from '@/app/actions/audit'

interface AuditCertificateTableProps {
  certificates: AuditCertificateRow[]
}

export function AuditCertificateTable({ certificates }: AuditCertificateTableProps) {
  const [search, setSearch] = useState('')

  const filtered = certificates.filter(cert => {
    if (!search) return true
    const q = search.toLowerCase()
    return (
      (cert.recipientName?.toLowerCase().includes(q)) ||
      (cert.recipientEmail?.toLowerCase().includes(q)) ||
      cert.sessionTitle.toLowerCase().includes(q) ||
      cert.certificateCode.toLowerCase().includes(q)
    )
  })

  if (certificates.length === 0) {
    return (
      <p className="font-mono text-sm text-gray-600">No certificates issued yet.</p>
    )
  }

  return (
    <div className="space-y-4">
      <Input
        type="text"
        placeholder="Search by name, email, session, or code..."
        value={search}
        onChange={e => setSearch(e.target.value)}
      />

      <div className="overflow-x-auto">
        <table className="w-full border-collapse font-mono text-sm">
          <thead>
            <tr className="border-b-2 border-black text-left">
              <th className="py-2 pr-4 whitespace-nowrap">Recipient</th>
              <th className="py-2 pr-4 whitespace-nowrap">Session</th>
              <th className="py-2 pr-4 whitespace-nowrap">Role</th>
              <th className="py-2 pr-4 whitespace-nowrap">Code</th>
              <th className="py-2 whitespace-nowrap">Issued</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="py-4 text-center text-gray-500">
                  No certificates match your search.
                </td>
              </tr>
            ) : (
              filtered.map(cert => (
                <tr key={cert.id} className="border-b border-gray-200">
                  <td className="py-2 pr-4">
                    {cert.recipientName || cert.recipientEmail || (
                      <span className="text-gray-400">Unknown</span>
                    )}
                  </td>
                  <td className="py-2 pr-4">
                    {cert.sessionTitle}
                    <span className="block text-xs text-gray-500">
                      {cert.departmentName}
                    </span>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <span className="text-xs border border-black px-1.5 py-0.5">
                      {cert.certificateRole}
                    </span>
                  </td>
                  <td className="py-2 pr-4 whitespace-nowrap">
                    <a
                      href={`/verify/${cert.certificateCode}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="hover:underline text-gray-700"
                    >
                      {cert.certificateCode}
                    </a>
                  </td>
                  <td className="py-2 whitespace-nowrap text-gray-600">
                    {new Date(cert.issuedAt).toLocaleDateString('en-GB')}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="font-mono text-xs text-gray-500">
        {filtered.length} of {certificates.length} certificates
      </p>
    </div>
  )
}
