import { expect, type Page } from '@playwright/test'

export const KEY_PARAM = 'comments-key=dev-key'

/** Open a route with the activation key and wait for the widget to mount. */
export async function activate(page: Page, path = '/') {
  const sep = path.includes('?') ? '&' : '?'
  await page.goto(`${path}${sep}${KEY_PARAM}`)
  // Launcher place button proves the widget activated.
  await expect(page.getByTestId('comments-place')).toBeVisible()
}

/** Fill the self-asserted email identity modal if it is showing. Idempotent. */
export async function ensureIdentity(page: Page, email = 'reviewer@example.com') {
  const dialog = page.getByRole('dialog')
  if (await dialog.isVisible().catch(() => false)) {
    await page.getByLabel('Email').fill(email)
    await page.getByRole('button', { name: 'Start commenting' }).click()
    await expect(dialog).toBeHidden()
  }
}

/** Enter place mode, click an element target, fill the draft composer, submit. */
export async function placeElementPin(page: Page, targetText: string, body: string) {
  await page.getByTestId('comments-place').click()
  await page.getByText(targetText, { exact: false }).first().click()
  await ensureIdentity(page) // identity modal can interrupt the first draft
  const draft = page.getByTestId('comments-draft')
  await expect(draft).toBeVisible()
  await draft.getByRole('textbox').fill(body)
  await draft.getByRole('button', { name: 'Send' }).click()
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
  await ensureIdentity(page)
  const draft = page.getByTestId('comments-draft')
  await expect(draft).toBeVisible()
  await draft.getByRole('textbox').fill(body)
  await draft.getByRole('button', { name: 'Send' }).click()
}

/** Open the thread popover by clicking its pin. */
export async function openThread(page: Page) {
  await page.getByTestId('comments-pin').first().click()
}
