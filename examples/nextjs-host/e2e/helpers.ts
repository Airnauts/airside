import { expect, type Page } from '@playwright/test'

export const KEY_PARAM = 'comments-key=dev-key'

/** Open a route with the activation key and wait for the widget to mount. */
export async function activate(page: Page, path = '/') {
  const sep = path.includes('?') ? '&' : '?'
  await page.goto(`${path}${sep}${KEY_PARAM}`)
  // Launcher place button proves the widget activated.
  await expect(page.getByTestId('comments-place')).toBeVisible()
}

/** Fill the self-asserted email identity modal if it is showing. Idempotent.
 *  Keyed off the identity-specific "Start commenting" button, not a generic
 *  dialog role (the draft composer is also a Radix dialog). */
export async function ensureIdentity(page: Page, email = 'reviewer@example.com') {
  const submit = page.getByRole('button', { name: 'Start commenting' })
  if (await submit.isVisible().catch(() => false)) {
    await page.getByRole('textbox', { name: 'Email', exact: true }).fill(email)
    await submit.click()
    await expect(submit).toBeHidden()
  }
}

/** Enter place mode, click an element target, fill the draft composer, submit. */
export async function placeElementPin(page: Page, targetText: string, body: string) {
  await page.getByTestId('comments-place').click()
  await page.getByText(targetText, { exact: false }).first().click()
  const draft = page.getByTestId('comments-draft')
  await expect(draft).toBeVisible()
  await draft.getByRole('textbox').fill(body)
  await draft.getByRole('button', { name: 'Send' }).click()
  // The first submit triggers the identity gate; on submit it resumes and posts.
  await ensureIdentity(page)
  await expect(page.getByTestId('comments-pin').first()).toBeVisible()
}

/** Enter place mode, DRAG-select text within an element, then the place click fires
 *  on mouseup with the selection intact → text (selection) anchor. */
export async function placeTextSelection(page: Page, targetText: string, body: string) {
  await page.getByTestId('comments-place').click()
  const el = page.getByText(targetText, { exact: false }).first()
  const box = await el.boundingBox()
  if (!box) throw new Error(`no bounding box for "${targetText}"`)
  const y = box.y + box.height / 2
  await page.mouse.move(box.x + 4, y)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width - 4, y, { steps: 12 })
  await page.mouse.up()
  const draft = page.getByTestId('comments-draft')
  await expect(draft).toBeVisible()
  await draft.getByRole('textbox').fill(body)
  await draft.getByRole('button', { name: 'Send' }).click()
  // The first submit triggers the identity gate; on submit it resumes and posts.
  await ensureIdentity(page)
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
