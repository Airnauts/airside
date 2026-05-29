// packages/client/src/ui/Attachment.tsx

export type PendingStatus = 'uploading' | 'ready' | 'error'

export function PendingAttachment({
  name,
  status,
  previewUrl,
  onRemove,
  onRetry,
}: {
  name: string
  status: PendingStatus
  previewUrl?: string
  onRemove: () => void
  onRetry: () => void
}) {
  return (
    <div className="cmnt:relative cmnt:w-[88px] cmnt:h-[58px] cmnt:rounded-lg cmnt:overflow-hidden cmnt:border cmnt:border-slate-300 cmnt:bg-[#dbe3f0] cmnt:flex cmnt:items-center cmnt:justify-center cmnt:mb-2">
      {previewUrl ? (
        <img src={previewUrl} alt={name} className="cmnt:w-full cmnt:h-full cmnt:object-cover" />
      ) : (
        <span className="cmnt:text-slate-500 cmnt:text-[11px] cmnt:p-1 cmnt:text-center">
          {name}
        </span>
      )}
      {status === 'uploading' && (
        <div
          data-testid="attachment-spinner"
          className="cmnt:absolute cmnt:inset-0 cmnt:bg-white/55 cmnt:flex cmnt:items-center cmnt:justify-center"
        >
          <span className="cmnt:w-5 cmnt:h-5 cmnt:border-2 cmnt:border-blue-600 cmnt:border-t-transparent cmnt:rounded-full cmnt:animate-spin" />
        </div>
      )}
      {status === 'error' && (
        <button
          type="button"
          aria-label="Retry upload"
          onClick={onRetry}
          className="cmnt:absolute cmnt:inset-0 cmnt:bg-red-500/15 cmnt:border-none cmnt:text-red-700 cmnt:text-[11px] cmnt:cursor-pointer"
        >
          Retry
        </button>
      )}
      <button
        type="button"
        aria-label="Remove attachment"
        onClick={onRemove}
        className="cmnt:absolute cmnt:top-0.5 cmnt:right-0.5 cmnt:w-4 cmnt:h-4 cmnt:rounded-full cmnt:bg-gray-900 cmnt:text-white cmnt:text-[10px] cmnt:border-none cmnt:cursor-pointer cmnt:flex cmnt:items-center cmnt:justify-center"
      >
        ✕
      </button>
    </div>
  )
}
