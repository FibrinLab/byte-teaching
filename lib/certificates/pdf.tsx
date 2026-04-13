import React from 'react'
import { Document, Page, Text, View, StyleSheet, pdf, Image } from '@react-pdf/renderer'
import QRCode from 'qrcode'

// ---------------------------------------------------------------------------
// Colour palette — Memphis/geometric inspired
// ---------------------------------------------------------------------------

const PALETTE = {
  lavender: '#d8d0e8',
  pink: '#e8a0bf',
  blue: '#5b8fb9',
  navy: '#1e2a5e',
  yellow: '#f2d388',
  coral: '#e76f7a',
  mint: '#7ecdb0',
  white: '#ffffff',
  dark: '#1a1a2e',
  grey: '#6b7280',
  lightGrey: '#d1d5db',
}

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  page: {
    width: 252,  // 3.5in * 72
    height: 144, // 2in * 72
    flexDirection: 'row',
    fontFamily: 'Helvetica',
    backgroundColor: PALETTE.lavender,
    padding: 4,
  },

  // Left geometric panel
  leftPanel: {
    width: 72,
    backgroundColor: PALETTE.navy,
    borderRadius: 2,
    position: 'relative',
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 6,
  },
  certLabel: {
    fontSize: 8,
    fontWeight: 'bold',
    color: PALETTE.white,
    lineHeight: 1.1,
  },
  certSub: {
    fontSize: 5,
    color: PALETTE.yellow,
    marginTop: 1,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },

  // Geometric shapes (positioned absolutely) — scaled for business card
  circle1: {
    position: 'absolute',
    top: 6,
    left: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: PALETTE.pink,
  },
  circle2: {
    position: 'absolute',
    top: 16,
    right: -5,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: PALETTE.blue,
    opacity: 0.8,
  },
  circle3: {
    position: 'absolute',
    top: 32,
    left: 20,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: PALETTE.yellow,
  },
  triangle: {
    position: 'absolute',
    top: 8,
    right: 12,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderBottomWidth: 10,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: PALETTE.yellow,
  },
  rect1: {
    position: 'absolute',
    top: 42,
    left: 5,
    width: 14,
    height: 14,
    backgroundColor: PALETTE.coral,
    borderRadius: 2,
  },
  lines: {
    position: 'absolute',
    bottom: 35,
    left: 10,
    width: 12,
    height: 16,
    borderLeftWidth: 1.5,
    borderLeftColor: PALETTE.yellow,
    borderRightWidth: 1.5,
    borderRightColor: PALETTE.yellow,
  },
  dotsCol: {
    position: 'absolute',
    top: 5,
    right: 4,
    flexDirection: 'column',
    gap: 3,
  },
  dot: {
    width: 3,
    height: 3,
    borderRadius: 1.5,
    backgroundColor: PALETTE.white,
  },
  halfCircle: {
    position: 'absolute',
    bottom: 25,
    right: 0,
    width: 16,
    height: 32,
    borderTopLeftRadius: 16,
    borderBottomLeftRadius: 16,
    backgroundColor: PALETTE.mint,
    opacity: 0.6,
  },

  // Right content panel
  rightPanel: {
    flex: 1,
    backgroundColor: PALETTE.white,
    borderRadius: 2,
    marginLeft: 4,
    padding: 8,
    justifyContent: 'center',
  },
  presentedTo: {
    fontSize: 4.5,
    color: PALETTE.grey,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 3,
  },
  recipientName: {
    fontSize: 9,
    fontWeight: 'bold',
    color: PALETTE.dark,
    marginBottom: 5,
  },
  divider: {
    width: 20,
    height: 1,
    backgroundColor: PALETTE.coral,
    marginBottom: 5,
  },
  sessionTitle: {
    fontSize: 5.5,
    color: '#374151',
    marginBottom: 2,
    lineHeight: 1.3,
  },
  sessionDate: {
    fontSize: 5,
    color: PALETTE.grey,
    marginBottom: 8,
  },

  // Footer row: date + QR
  footerRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    marginTop: 'auto',
  },
  dateSection: {
    alignItems: 'flex-start',
  },
  dateValue: {
    fontSize: 5,
    fontWeight: 'bold',
    color: PALETTE.dark,
    marginBottom: 1,
  },
  dateLabel: {
    fontSize: 4,
    color: PALETTE.grey,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  qrSection: {
    alignItems: 'center',
  },
  qrCode: {
    width: 28,
    height: 28,
    marginBottom: 1,
  },
  certCode: {
    fontSize: 4,
    fontFamily: 'Courier',
    color: PALETTE.lightGrey,
    letterSpacing: 0.5,
  },
})

// ---------------------------------------------------------------------------
// Data interface
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Document component
// ---------------------------------------------------------------------------

const CertificateDocument = ({
  data,
  qrCodeDataUrl,
}: {
  data: CertificateData
  qrCodeDataUrl: string
}) => {
  const isTeacher = data.role === 'Teacher'
  const roleLabel = isTeacher ? 'OF TEACHING' : 'OF ATTENDANCE'

  return (
    <Document>
      <Page size={[252, 144]} style={styles.page}>
        {/* Left geometric panel */}
        <View style={styles.leftPanel}>
          {/* Geometric shapes */}
          <View style={styles.circle1} />
          <View style={styles.circle2} />
          <View style={styles.circle3} />
          <View style={styles.triangle} />
          <View style={styles.rect1} />
          <View style={styles.lines} />
          <View style={styles.halfCircle} />
          <View style={styles.dotsCol}>
            {[0, 1, 2, 3, 4].map((i) => (
              <View key={i} style={styles.dot} />
            ))}
          </View>

          {/* Title text at bottom of panel */}
          <Text style={styles.certLabel}>CERTIFICATE</Text>
          <Text style={styles.certSub}>{roleLabel}</Text>
        </View>

        {/* Right content panel */}
        <View style={styles.rightPanel}>
          <Text style={styles.presentedTo}>This certificate is presented to</Text>
          <Text style={styles.recipientName}>{data.recipientName}</Text>
          <View style={styles.divider} />
          <Text style={styles.sessionTitle}>
            {isTeacher ? 'For delivering' : 'For attending'} the teaching session:{'\n'}
            {data.sessionTitle}
          </Text>
          <Text style={styles.sessionDate}>{data.sessionDate}</Text>

          {/* Footer: date + QR */}
          <View style={styles.footerRow}>
            <View style={styles.dateSection}>
              <Text style={styles.dateValue}>{data.issuedDate}</Text>
              <Text style={styles.dateLabel}>Date</Text>
            </View>
            <View style={styles.qrSection}>
              {qrCodeDataUrl ? (
                <Image src={qrCodeDataUrl} style={styles.qrCode} />
              ) : null}
              <Text style={styles.certCode}>{data.certificateCode}</Text>
            </View>
          </View>
        </View>
      </Page>
    </Document>
  )
}

// ---------------------------------------------------------------------------
// Generate PDF buffer
// ---------------------------------------------------------------------------

export async function generateCertificatePDF(data: CertificateData): Promise<Buffer> {
  const qrCodeDataUrl = await QRCode.toDataURL(data.verifyUrl, {
    width: 160,
    margin: 1,
    color: { dark: '#1a1a2e', light: '#ffffff' },
  })

  const doc = <CertificateDocument data={data} qrCodeDataUrl={qrCodeDataUrl} />
  const blob = await pdf(doc).toBlob()
  const arrayBuffer = await blob.arrayBuffer()
  return Buffer.from(arrayBuffer)
}
