import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import './globals.css'

export const metadata: Metadata = {
  title: 'Open Range Viewer',
  description: 'Open-source preflop range viewer for No-Limit Hold’em.',
}

export const viewport: Viewport = {
  themeColor: '#000000',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" data-theme="classic" suppressHydrationWarning>
      <body>{children}</body>
    </html>
  )
}
