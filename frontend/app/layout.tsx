import './globals.css'
import type { Metadata } from 'next'
import Header from '@/components/Header'
import { Providers } from '@/components/Providers'

export const metadata: Metadata = {
  title: 'Orakamoto - Decentralized Prediction Markets on Stacks',
  description: 'Trade on future outcomes with AI-powered resolution, secured by Bitcoin via Stacks. Orakamoto combines prediction markets with the security of Bitcoin.',
  keywords: ['prediction markets', 'stacks', 'bitcoin', 'crypto', 'trading', 'oracle', 'defi'],
  openGraph: {
    title: 'Orakamoto - Prediction Markets on Stacks',
    description: 'Trade on future outcomes with AI-powered resolution, secured by Bitcoin',
    type: 'website',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="icon" href="/favicon.ico" />
      </head>
      <body className="min-h-screen bg-dark-bg">
        <Providers>
          <Header />
          {children}
        </Providers>
      </body>
    </html>
  )
}
