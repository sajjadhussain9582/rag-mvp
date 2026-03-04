import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import { Analytics } from '@vercel/analytics/next'
import { Header } from '@/components/header'
import './globals.css'

const _geist = Geist({ subsets: ["latin"] });
const _geistMono = Geist_Mono({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: ' Chatty - AI-Powered Document Q&A',
  description: 'Chat with your documents using AI. Upload JSON or text files and get intelligent answers with source citations.',
  generator: 'sajjad',
  icons: ""
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <Header />
        <main className="min-h-[calc(100vh-3.5rem)]">
          {children}
        </main>
        <Analytics />
      </body>
    </html>
  )
}
