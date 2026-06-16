// packages/client/src/panel/PanelDetailView.tsx

import type { ThreadListItem } from '@airnauts/comments-core'
import * as Dialog from '@radix-ui/react-dialog'
import type { ApiClient } from '../api/client'
import { useDraft } from '../drafts/DraftsProvider'
import { useThreadDetail } from '../threads/useThreads'
import { Button } from '../ui/Button'
import { ThreadConversation } from '../ui/ThreadConversation'

export type PanelDetailViewProps = {
  threadId: string
  /** The panel row for this thread, when it is in the loaded list (instant render). */
  listItem: ThreadListItem | null
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
  onBack: () => void
}

/** The drawer's thread-detail pane: back/close header + the sidebar conversation. */
export function PanelDetailView({ threadId, listItem, client, onBack }: PanelDetailViewProps) {
  const { detail } = useThreadDetail(threadId)
  const draft = useDraft(threadId)
  // Prefer the panel list item (instant); fall back to the id-keyed loaded thread (cross-page /
  // deep-link, where the thread isn't in the list). Reading by threadId — not openId — keeps the
  // pane populated regardless of the popover's open state.
  const item = listItem ?? detail
  return (
    <>
      <div className="air:flex air:items-center air:justify-between air:px-3 air:py-2 air:border-b air:border-gray-200">
        <button
          type="button"
          onClick={onBack}
          aria-label="Back"
          className="air:flex air:items-center air:gap-1 air:bg-transparent air:border-0 air:cursor-pointer air:text-sm air:text-gray-700 air:px-1"
        >
          <span aria-hidden={true}>‹</span> Back
        </button>
        <Dialog.Title className="air:sr-only">Thread</Dialog.Title>
        <Dialog.Description className="air:sr-only">Thread detail</Dialog.Description>
        <Dialog.Close asChild>
          <Button variant="ghost" size="icon" aria-label="Close panel">
            ✕
          </Button>
        </Dialog.Close>
      </div>
      <div className="air:flex-1 air:overflow-y-auto air:flex air:flex-col air:min-h-0">
        {item && (
          <ThreadConversation
            item={item}
            client={client}
            variant="sidebar"
            draftText={draft.draft.text}
            onDraftTextChange={draft.setText}
            draftAttachment={draft.draft.attachment}
            onDraftAttachmentChange={draft.setAttachment}
          />
        )}
      </div>
    </>
  )
}
