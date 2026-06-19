// packages/client/src/ui/imageInput.ts
//
// Affordance-level (client-side) validation and naming for drag-and-drop / clipboard-paste
// image uploads. This is a UX nicety, NOT a security boundary: the server
// (`upload-attachment.ts`) authoritatively re-checks type and size. We keep our own
// best-effort copy of the allowlist so drag/paste — which bypass the file picker's
// `accept="image/*"` filter — get instant feedback.

/** The image types the composer accepts. Mirrors the server's `ALLOWED_UPLOAD_TYPES`
 *  (`packages/server/src/use-cases/upload-attachment.ts`) — deliberately the explicit four,
 *  not `image/*` (svg/heic would pass `accept` but be rejected 400/413 server-side). */
export const CLIENT_ALLOWED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/webp',
  'image/gif',
] as const

export type ClientAllowedImageType = (typeof CLIENT_ALLOWED_IMAGE_TYPES)[number]

/** Matches the server's default `maxBytes` (5 MB) for instant feedback on the common case.
 *  A host that overrides the server limit lower is still enforced authoritatively server-side
 *  (surfaced via the pending-upload error affordance). */
export const CLIENT_MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024

export type ImageValidation = { ok: true } | { ok: false; reason: 'type' | 'size' }

/** Best-effort client check before we spend a round-trip uploading. */
export function validateImageFile(file: File): ImageValidation {
  if (!CLIENT_ALLOWED_IMAGE_TYPES.includes(file.type as ClientAllowedImageType)) {
    return { ok: false, reason: 'type' }
  }
  if (file.size > CLIENT_MAX_ATTACHMENT_BYTES) {
    return { ok: false, reason: 'size' }
  }
  return { ok: true }
}

const EXTENSION_BY_TYPE: Record<ClientAllowedImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

/** Pasted blobs carry an empty/generic `name`, and `File.name` is read-only — so we wrap the
 *  blob in a freshly named `File` (`pasted-<timestamp>.<ext>`) for display and storage. */
export function namePastedImage(blob: File): File {
  const ext = EXTENSION_BY_TYPE[blob.type as ClientAllowedImageType] ?? 'png'
  return new File([blob], `pasted-${Date.now()}.${ext}`, { type: blob.type })
}
