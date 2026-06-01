import type { ReactNode } from 'react'

export const metadata = {
  title: 'Comments host app',
  description: 'M9 integration host for the embeddable commenting tool',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
