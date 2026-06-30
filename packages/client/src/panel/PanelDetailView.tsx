// packages/client/src/panel/PanelDetailView.tsx

import type { ThreadListItem } from '@airnauts/airside-core'
import * as Dialog from '@radix-ui/react-dialog'
import type { ApiClient } from '../api/client'
import { useDraft } from '../drafts/DraftsProvider'
import { useController, useThreadDetail } from '../threads/useThreads'
import { Button } from '../ui/Button'
import { ThreadConversation } from '../ui/ThreadConversation'
import { goToThread } from './navigate'

export type PanelDetailViewProps = {
  threadId: string
  /** The panel row for this thread, when it is in the loaded list (instant render). */
  listItem: ThreadListItem | null
  /** Maps a URL to its normalized page key — the same dependency the drawer threads in, used to
   *  decide whether the thread's pin is on this page or another. */
  resolvePageKey: (url: string) => string
  client: Pick<ApiClient, 'getThread' | 'addComment' | 'setThreadStatus' | 'upload'>
  onBack: () => void
  /** Step to the previous thread in the filtered list; absent (disabled) at the top of the list. */
  onPrev?: () => void
  /** Step to the next thread in the filtered list; absent (disabled) at the bottom of the list. */
  onNext?: () => void
}

/** The drawer's thread-detail pane: back/close header + the sidebar conversation. */
export function PanelDetailView({
  threadId,
  listItem,
  resolvePageKey,
  client,
  onBack,
  onPrev,
  onNext,
}: PanelDetailViewProps) {
  const { detail } = useThreadDetail(threadId)
  const controller = useController()
  const draft = useDraft(threadId)
  // Prefer the panel list item (instant); fall back to the id-keyed loaded thread (cross-page /
  // deep-link, where the thread isn't in the list). Reading by threadId — not openId — keeps the
  // pane populated regardless of the popover's open state.
  const item = listItem ?? detail

  // "Return to the pin" from the open detail: re-fire the same same-page-vs-cross-page split as
  // PanelDrawer.onSelect. Same page → pulse/scroll the pin (the detail is already open, so unlike
  // onSelect there's no openDetail to do); different page → stash the focus and navigate there.
  function returnToPin() {
    if (!item) return
    if (item.pageKey === resolvePageKey(window.location.href)) {
      controller.requestFocus(threadId)
    } else {
      goToThread({ id: threadId, pageUrl: item.pageUrl, openDetail: true })
    }
  }

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
        <div className="air:flex air:items-center air:gap-1">
          <Button
            variant="ghost"
            size="icon"
            aria-label="Previous thread"
            disabled={!onPrev}
            onClick={onPrev}
            className="air:disabled:text-gray-300"
          >
            <span aria-hidden={true}>⌃</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Next thread"
            disabled={!onNext}
            onClick={onNext}
            className="air:disabled:text-gray-300"
          >
            <span aria-hidden={true}>⌄</span>
          </Button>
          <Dialog.Close asChild>
            <Button variant="ghost" size="icon" aria-label="Close panel">
              ✕
            </Button>
          </Dialog.Close>
        </div>
      </div>
      <div className="air:flex-1 air:overflow-y-auto air:flex air:flex-col air:min-h-0">
        {item && (
          <ThreadConversation
            item={item}
            client={client}
            variant="sidebar"
            onReturnToPin={returnToPin}
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
