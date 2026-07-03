import { expect, test } from '@playwright/test'
import { activate, login, placeElementPin } from './helpers'

test.describe('cross-page panel', () => {
  // Cold next start: page loads + the cross-page navigation handoff can be slow.
  test.setTimeout(90_000)

  test('lists threads across pages; selecting one navigates and focuses its pin', async ({
    page,
  }) => {
    const ns = 'panel'

    // A thread on the pricing page. The in-memory store is shared across the whole suite, so
    // identify this test's rows by their unique comment body (the panel row renders the page
    // title for context now, not the URL — see #56 — and every host page shares one title).
    await activate(page, '/pricing', ns)
    await login(page)
    await placeElementPin(page, 'Starter', 'Comment on the Starter plan')

    // A thread on the article page.
    await activate(page, '/article', ns)
    await login(page) // no-op: identity persists from the first login
    await placeElementPin(page, 'disambiguate near-matches', 'Comment on the article')

    // Open the panel. It lists threads across pages; the shared store means other specs'
    // threads may also appear, so assert on this test's rows by their unique comment body.
    await page.getByTestId('airside-panel-open').click()
    await expect(page.getByTestId('airside-panel')).toBeVisible()
    const rows = page.getByTestId('airside-panel-row')
    const pricingRow = rows.filter({ hasText: 'Comment on the Starter plan' })
    await expect(pricingRow).toHaveCount(1)
    // The article page is represented too.
    await expect(rows.filter({ hasText: 'Comment on the article' })).toHaveCount(1)

    // Select the pricing thread → navigate to /pricing and focus its pin (the focused pin
    // renders a pulse element).
    await pricingRow.first().click()
    await expect(page).toHaveURL(/\/pricing/)
    await expect(page.getByTestId('airside-pin-pulse')).toBeVisible()
  })
})
