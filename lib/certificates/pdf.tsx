import React from 'react'
import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer'
import QRCode from 'qrcode'

const styles = StyleSheet.create({
  page: {
    padding: 40,
    fontFamily: 'Helvetica',
    justifyContent: 'center',
  },
  border: {
    border: '2 solid #000',
    padding: 30,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  orgName: {
    fontSize: 14,
    textTransform: 'uppercase',
    letterSpacing: 2,
    marginBottom: 4,
    textAlign: 'center',
  },
  deptName: {
    fontSize: 12,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  certifyText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 8,
    textAlign: 'center',
  },
  recipientName: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 20,
    textAlign: 'center',
  },
  sessionText: {
    fontSize: 12,
    marginBottom: 4,
    textAlign: 'center',
  },
  dateText: {
    fontSize: 11,
    color: '#666',
    marginBottom: 25,
    textAlign: 'center',
  },
  signatureSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  signatureText: {
    fontSize: 20,
    fontFamily: 'Helvetica-Oblique',
    marginBottom: 4,
    textAlign: 'center',
  },
  signatureLine: {
    borderBottom: '1 solid #000',
    width: 200,
    marginBottom: 4,
  },
  leadName: {
    fontSize: 11,
    textAlign: 'center',
    marginBottom: 2,
  },
  leadLabel: {
    fontSize: 9,
    color: '#666',
    textAlign: 'center',
  },
  footer: {
    marginTop: 20,
    alignItems: 'center',
  },
  qrCode: {
    width: 60,
    height: 60,
    marginBottom: 4,
  },
  footerText: {
    fontSize: 8,
    color: '#999',
    textAlign: 'center',
  },
})

export interface CertificateData {
  orgName: string
  departmentName: string
  sessionTitle: string
  sessionDate: string
  recipientName: string
  role: string
  certificateCode: string
  issuedDate: string
  verifyUrl: string
  leadName?: string
}

const CertificateDocument = ({ data, qrCodeDataUrl }: { data: CertificateData; qrCodeDataUrl: string }) => (
  <Document>
    <Page size="A4" orientation="landscape" style={styles.page}>
      <View style={styles.border}>
        <Text style={styles.orgName}>{data.orgName}</Text>
        <Text style={styles.deptName}>{data.departmentName}</Text>
        <Text style={styles.title}>Certificate of Attendance</Text>
        <Text style={styles.certifyText}>This is to certify that</Text>
        <Text style={styles.recipientName}>{data.recipientName}</Text>
        <Text style={styles.sessionText}>
          {data.role === 'Teacher' ? 'delivered' : 'attended'} {data.sessionTitle}
        </Text>
        <Text style={styles.dateText}>{data.sessionDate}</Text>

        <View style={styles.signatureSection}>
          {data.leadName ? (
            <Text style={styles.signatureText}>{data.leadName}</Text>
          ) : (
            <View style={styles.signatureLine} />
          )}
          {data.leadName ? (
            <Text style={styles.leadName}>{data.leadName}</Text>
          ) : null}
          <Text style={styles.leadLabel}>Teaching Lead</Text>
        </View>

        <View style={styles.footer}>
          {qrCodeDataUrl && (
            <Image src={qrCodeDataUrl} style={styles.qrCode} />
          )}
          <Text style={styles.footerText}>Certificate ID: {data.certificateCode}</Text>
        </View>
      </View>
    </Page>
  </Document>
)

export async function generateCertificatePDF(data: CertificateData): Promise<Buffer> {
  const qrCodeDataUrl = await QRCode.toDataURL(data.verifyUrl, {
    width: 120,
    margin: 1,
  })

  const doc = <CertificateDocument data={data} qrCodeDataUrl={qrCodeDataUrl} />
  const blob = await pdf(doc).toBlob()
  const arrayBuffer = await blob.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
