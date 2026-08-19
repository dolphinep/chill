import type { Metadata, Viewport } from 'next'
import { Cinzel, Plus_Jakarta_Sans, Quicksand } from 'next/font/google'
import './globals.css'

const quicksand = Quicksand({
  subsets: ['latin'],
  variable: '--font-cozy',
  display: 'swap',
})

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap',
})

// Modeled on first-century Roman inscriptional capitals (the lettering style on
// monuments like Trajan's Column) — used only for constellation names, which are
// literally the Latin names Roman astronomers gave these star patterns. Everything
// else in the app keeps its own typeface; this one is deliberately narrow-scoped.
const cinzel = Cinzel({
  subsets: ['latin'],
  variable: '--font-constellation',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'Chill · Nightly Journey',
  description: 'A quiet, cozy 3D haven to leave open while you work and rest.',
  icons: {
    icon: '/icon.svg',
    apple: '/icon.svg',
  },
}

export const viewport: Viewport = {
  themeColor: '#0a0d14',
  colorScheme: 'dark',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      data-ui-polarity="dark"
      className={`${quicksand.variable} ${plusJakarta.variable} ${cinzel.variable}`}
      suppressHydrationWarning
    >
      <body suppressHydrationWarning>{children}</body>
    </html>
  )
}
