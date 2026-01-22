import './globals.css'
import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'StacksPredict - USDCx Markets',
  description: 'Prediction markets powered by USDCx on Stacks',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
