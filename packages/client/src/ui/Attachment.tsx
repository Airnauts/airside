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
    <div
      role="status"
      aria-label={
        status === 'uploading'
          ? `Uploading ${name}`
          : status === 'error'
            ? `Upload failed for ${name}`
            : name
      }
      className="air:relative air:w-[88px] air:h-[58px] air:rounded-lg air:overflow-hidden air:border air:border-slate-300 air:bg-[#dbe3f0] air:flex air:items-center air:justify-center air:mb-2"
    >
      {previewUrl ? (
        <img src={previewUrl} alt={name} className="air:w-full air:h-full air:object-cover" />
      ) : (
        <span className="air:text-slate-500 air:text-[11px] air:p-1 air:text-center">{name}</span>
      )}
      {status === 'uploading' && (
        <div
          aria-hidden
          data-testid="attachment-spinner"
          className="air:absolute air:inset-0 air:bg-white/55 air:flex air:items-center air:justify-center"
        >
          <span
            aria-hidden
            className="air:w-5 air:h-5 air:border-2 air:border-blue-600 air:border-t-transparent air:rounded-full air:animate-spin"
          />
        </div>
      )}
      {status === 'error' && (
        <button
          type="button"
          aria-label="Retry upload"
          onClick={onRetry}
          className="air:absolute air:inset-0 air:bg-red-500/15 air:border-none air:text-red-700 air:text-[11px] air:cursor-pointer"
        >
          Retry
        </button>
      )}
      <button
        type="button"
        aria-label="Remove attachment"
        onClick={onRemove}
        className="air:absolute air:top-0.5 air:right-0.5 air:w-4 air:h-4 air:rounded-full air:bg-gray-900 air:text-white air:text-[10px] air:border-none air:cursor-pointer air:flex air:items-center air:justify-center"
      >
        ✕
      </button>
    </div>
  )
}
