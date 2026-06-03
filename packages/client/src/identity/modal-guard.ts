// Keeps an open thread/draft popover from closing behind the identity modal.
//
// The identity modal is a Radix Dialog (modal); opening it moves focus into the dialog. That
// focusin lands outside any open Popover, so the Popover's DismissableLayer treats it as an
// outside interaction and fires onOpenChange(false) — closing the pin behind the modal. The
// comment still posts (the deferred send resumes), but the user is left with a closed pin.
//
// Both popovers (ThreadPopover, the MarkerLayer draft) mark this guard on their Popover.Content
// so the dismiss is suppressed when the focus/pointer that triggered it landed inside the modal.

/** Marker on the identity modal's overlay + content, used to recognize modal-originated events. */
export const IDENTITY_MODAL_ATTR = 'data-cmnt-identity-modal'

type OutsideEvent = { detail: { originalEvent: Event }; preventDefault: () => void }

/** Radix `onInteractOutside` guard: cancel the popover dismiss when the focus/pointer that
 *  triggered it came from inside the identity modal (Radix listens on `focusin`, so the event
 *  target is the element receiving focus). */
export function keepOpenThroughIdentityModal(event: OutsideEvent): void {
  const target = event.detail.originalEvent.target as Element | null
  if (target?.closest(`[${IDENTITY_MODAL_ATTR}]`)) event.preventDefault()
}
