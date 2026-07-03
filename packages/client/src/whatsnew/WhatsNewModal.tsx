// packages/client/src/whatsnew/WhatsNewModal.tsx

import * as Dialog from '@radix-ui/react-dialog'
import { usePortalContainer } from '../app/providers'
import { Button } from '../ui/Button'
import type { Highlight } from './highlights'

export type WhatsNewModalProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  /** The release highlights to show, newest first. */
  entries: Highlight[]
}

/** Presentational "what's new" dialog: renders each release's title, date and bullet
 *  points, dismissed via the "Got it" button, overlay click or Escape (all route through
 *  `onOpenChange(false)`). State and persistence live in `WhatsNewProvider`. */
export function WhatsNewModal({ open, onOpenChange, entries }: WhatsNewModalProps) {
  const container = usePortalContainer()

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal container={container ?? undefined}>
        <Dialog.Overlay className="air:fixed air:inset-0 air:bg-black/40 air:pointer-events-auto" />
        <Dialog.Content className="air:fixed air:top-1/2 air:left-1/2 air:-translate-x-1/2 air:-translate-y-1/2 air:bg-white air:p-6 air:rounded-xl air:min-w-80 air:max-w-96 air:max-h-[80vh] air:overflow-y-auto air:pointer-events-auto">
          <Dialog.Title className="air:mt-0 air:text-[18px] air:font-semibold air:text-gray-900">
            What's new
          </Dialog.Title>
          <Dialog.Description className="air:mt-1 air:text-sm air:text-gray-500">
            Recent updates to the commenting widget.
          </Dialog.Description>
          {entries.map((entry) => (
            <div key={entry.version} className="air:mt-4">
              <div className="air:text-sm air:font-semibold air:text-gray-900">{entry.title}</div>
              <div className="air:text-xs air:text-gray-500">
                {entry.version} · {entry.date}
              </div>
              <ul className="air:mt-1.5 air:mb-0 air:pl-5 air:text-sm air:text-gray-600">
                {entry.items.map((item) => (
                  <li key={item} className="air:mt-1">
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
          <Dialog.Close asChild>
            <Button variant="primary" size="md" className="air:mt-4">
              Got it
            </Button>
          </Dialog.Close>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}
