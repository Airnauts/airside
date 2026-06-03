import { expect, type Page } from '@playwright/test'

export const DEV_KEY = 'dev-key'

/** Build a URL with merged query params; empty-string values are skipped. */
export function urlFor(path: string, params: Record<string, string> = {}) {
  const [p, q = ''] = path.split('?')
  const sp = new URLSearchParams(q)
  for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v)
  const s = sp.toString()
  return s ? `${p}?${s}` : p
}

/** Open a route with the activation key and wait for the widget to mount.
 *  `ns` namespaces the page via the host's pageKey override so tests sharing the
 *  single in-memory store don't see each other's threads. Pass a unique `ns` per test
 *  (and carry the same `ns` on any later navigation/reload within that test). */
export async function activate(page: Page, path = '/', ns = '') {
  await page.goto(urlFor(path, { ns, 'comments-key': DEV_KEY }))
  // Logged out: the Log In button proves the widget activated.
  await expect(page.getByTestId('comments-login')).toBeVisible()
}

/** Log in with a self-asserted email so the full commenting UI unlocks. Idempotent: a no-op
 *  if the Log In button isn't showing (already logged in). */
export async function login(page: Page, email = 'reviewer@example.com') {
  const trigger = page.getByTestId('comments-login')
  if (!(await trigger.isVisible().catch(() => false))) return
  await trigger.click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
  await dialog.getByRole('button', { name: 'Log in' }).click()
  // The full launcher proves login completed.
  await expect(page.getByTestId('comments-place')).toBeVisible()
}

/** Enter place mode, click an element target, fill the draft composer, submit. */
export async function placeElementPin(page: Page, targetText: string, body: string) {
  await page.getByTestId('comments-place').click()
  await page.getByText(targetText, { exact: false }).first().click()
  const draft = page.getByTestId('comments-draft')
  await expect(draft).toBeVisible()
  await draft.getByRole('textbox').fill(body)
  await draft.getByRole('button', { name: 'Send' }).click()
  await expect(page.getByTestId('comments-pin').first()).toBeVisible()
}

/** Enter place mode, select a literal text run via the DOM Selection API, then dispatch a
 *  click that preserves the live selection → the place handler reads window.getSelection()
 *  and captures a text (selection) anchor. A real mouse-drag clears the selection on the
 *  click's mousedown, so we build the Range explicitly and fire a synthetic click. */
export async function placeTextSelection(page: Page, targetText: string, body: string) {
  await page.getByTestId('comments-place').click()
  // Select `targetText` within whichever element contains it, then dispatch a click whose
  // coordinates fall on the selected range. The handler reads getSelection() before reacting.
  const ok = await page.evaluate((needle) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    let node: Text | null = null
    let idx = -1
    while (walker.nextNode()) {
      const t = walker.currentNode as Text
      const at = (t.data ?? '').indexOf(needle)
      if (at >= 0) {
        node = t
        idx = at
        break
      }
    }
    if (!node || idx < 0) return null
    const range = document.createRange()
    range.setStart(node, idx)
    range.setEnd(node, idx + needle.length)
    const sel = window.getSelection()
    if (!sel) return null
    sel.removeAllRanges()
    sel.addRange(range)
    const rect = range.getBoundingClientRect()
    const x = rect.left + rect.width / 2
    const y = rect.top + rect.height / 2
    const el = (node.parentElement ?? document.body) as Element
    // Synthetic click leaves the selection intact (a real pointer mousedown would collapse it).
    el.dispatchEvent(
      new MouseEvent('click', { bubbles: true, cancelable: true, clientX: x, clientY: y }),
    )
    return true
  }, targetText)
  if (!ok) throw new Error(`could not select text "${targetText}"`)
  const draft = page.getByTestId('comments-draft')
  await expect(draft).toBeVisible()
  await draft.getByRole('textbox').fill(body)
  await draft.getByRole('button', { name: 'Send' }).click()
}

/** Ensure the thread popover is open. The pin is a Radix Popover trigger, so a
 *  blind click toggles it; placing a comment can leave the thread already open.
 *  Key off the thread card's status button to open only when it is closed. */
export async function openThread(page: Page) {
  const statusButton = page.getByRole('button', { name: /Resolve|Reopen/ })
  if (await statusButton.isVisible().catch(() => false)) return
  await page.getByTestId('comments-pin').first().click()
  await expect(statusButton).toBeVisible()
}
