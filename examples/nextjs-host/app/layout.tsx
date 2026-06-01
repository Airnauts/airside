import type { ReactNode } from 'react'
import { CommentsMount } from './components/comments-mount'

export const metadata = {
  title: 'Comments host app',
  description: 'M9 integration host for the embeddable commenting tool',
}

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {children}
        <CommentsMount />
      </body>
    </html>
  )
}
