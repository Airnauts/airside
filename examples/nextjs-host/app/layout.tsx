import type { ReactNode } from 'react'
import { AirsideMount } from './components/airside-mount'

export const metadata = {
  title: 'Airside host app',
  description: 'M9 integration host for the embeddable commenting tool',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <AirsideMount />
      </body>
    </html>
  )
}
