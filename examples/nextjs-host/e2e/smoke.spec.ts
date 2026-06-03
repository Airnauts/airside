import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { expect, test } from '@playwright/test'
import { activate, login, openThread, placeElementPin } from './helpers'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

test.describe('single-page commenting loop', () => {
  // Generous per-test budget: this test does the full loop and the first upload to a
  // cold `next start` route can be slow.
  test.setTimeout(90_000)

  test('activate, identity, comment, reply, attach, resolve, reopen, reload', async ({ page }) => {
    await activate(page, '/article', 'smoke')
    await login(page)

    // Place an element pin + first comment (identity modal handled inside). Target the 2nd
    // <li> by text unique to it ("Content signals" also occurs in a nearby <p>).
    await placeElementPin(page, 'disambiguate near-matches', 'First comment on the list item')
    await expect(page.getByTestId('comments-pin')).toHaveCount(1)

    // Open the thread and wait for it to load (the first comment is visible).
    await openThread(page)
    await expect(page.getByText('First comment on the list item')).toBeVisible()

    // Attach a screenshot, then post a reply carrying it. Do the attach on the freshly
    // opened, settled composer — BEFORE posting any other reply. On a cold server the
    // thread refresh after a post briefly remounts the reply composer, which would drop an
    // in-flight upload; attaching first avoids that race.
    await page
      .getByTestId('composer-file')
      .setInputFiles(path.join(__dirname, 'fixtures', 'screenshot.png'))
    // Wait for the upload to be READY: the pending attachment's status region label becomes
    // exactly the filename. Use exact match — the uploading ("Uploading screenshot.png") and
    // error ("Upload failed for screenshot.png") labels both *contain* the filename, so a
    // substring match would let an in-flight or failed upload pass and post with no attachment.
    // Generous timeout: the first upload to a cold route is slow.
    await expect(page.getByRole('status', { name: 'screenshot.png', exact: true })).toBeVisible({
      timeout: 30_000,
    })
    await expect(page.getByTestId('attachment-spinner')).toHaveCount(0)
    await page.getByRole('textbox', { name: 'Reply…' }).fill('Reply with a screenshot')
    await page.getByRole('button', { name: 'Send' }).click()
    await expect(page.getByText('Reply with a screenshot')).toBeVisible()

    // Resolve → reopen. (One reply is enough; a second post here would race the thread
    // refresh that briefly remounts the composer on a cold server.)
    await page.getByRole('button', { name: /Resolve/ }).click()
    await expect(page.getByRole('button', { name: /Reopen/ })).toBeVisible()
    await page.getByRole('button', { name: /Reopen/ }).click()
    await expect(page.getByRole('button', { name: /Resolve/ })).toBeVisible()

    // Reload: the pin re-anchors and the comment persists.
    await page.reload()
    await expect(page.getByTestId('comments-pin')).toHaveCount(1)
    await openThread(page)
    await expect(page.getByText('First comment on the list item')).toBeVisible()
    await expect(page.getByText('Reply with a screenshot')).toBeVisible()
    // The posted attachment persists (server resolves attachmentIds → attachments) and
    // renders in the reopened thread with its /uploads/ url. Assert the element + src,
    // not pixel visibility: runtime-written public/uploads bytes aren't guaranteed to be
    // served by `next start`, and the persisted attachment record is the behavior tested.
    const posted = page.locator('img[alt="screenshot.png"]')
    await expect(posted).toHaveCount(1)
    await expect(posted).toHaveAttribute('src', /\/uploads\//)
  })
})
