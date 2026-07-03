// packages/client/src/ui/PageContextCard.tsx

export type PageContextCardProps = {
  /** Page title; falls back to the URL when absent. */
  pageTitle?: string
  pageUrl: string
  /** When provided the card becomes a "take me back to the pin" button (re-fires the
   *  focus/navigate split); otherwise it stays a non-interactive label. */
  onReturnToPin?: () => void
}

/** The sidebar detail's page-context card: the thread's page title + URL. */
export function PageContextCard({ pageTitle, pageUrl, onReturnToPin }: PageContextCardProps) {
  const body = (
    <>
      <div className="air:text-[13px] air:font-semibold air:text-gray-900 air:truncate">
        {pageTitle ?? pageUrl}
      </div>
      <div className="air:text-[11px] air:text-gray-500 air:truncate">{pageUrl}</div>
    </>
  )
  return onReturnToPin ? (
    <button
      type="button"
      onClick={onReturnToPin}
      aria-label="Scroll to this thread's pin"
      data-testid="airside-detail-page-context"
      className="air:block air:mx-3 air:mt-2 air:px-3 air:py-2 air:rounded-lg air:bg-gray-50 air:border air:border-gray-200 air:text-left air:cursor-pointer air:hover:bg-gray-100"
    >
      {body}
    </button>
  ) : (
    <div className="air:mx-3 air:mt-2 air:px-3 air:py-2 air:rounded-lg air:bg-gray-50 air:border air:border-gray-200">
      {body}
    </div>
  )
}
