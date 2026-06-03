import { expect, test } from '@playwright/test'
import { activate, placeElementPin } from './helpers'

test.describe('cross-page panel', () => {
  // Cold next start: page loads + the cross-page navigation handoff can be slow.
  test.setTimeout(90_000)

  test('lists threads across pages; selecting one navigates and focuses its pin', async ({
    page,
  }) => {
    const ns = 'panel'

    // A thread on the pricing page — no other spec touches /pricing, so its panel row is
    // unique even though the in-memory store is shared across the whole suite.
    await activate(page, '/pricing', ns)
    await placeElementPin(page, 'Starter', 'Comment on the Starter plan')

    // A thread on the article page.
    await activate(page, '/article', ns)
    await placeElementPin(page, 'disambiguate near-matches', 'Comment on the article')

    // Open the panel. It lists threads across pages; the shared store means other specs'
    // threads may also appear, so assert on this test's rows by page URL, not a total count.
    await page.getByTestId('comments-panel-open').click()
    await expect(page.getByTestId('comments-panel')).toBeVisible()
    const rows = page.getByTestId('comments-panel-row')
    const pricingRow = rows.filter({ hasText: '/pricing' })
    await expect(pricingRow).toHaveCount(1)
    // The article page is represented too (at least this test's thread; maybe others').
    await expect(rows.filter({ hasText: '/article' })).not.toHaveCount(0)

    // Select the pricing thread → navigate to /pricing and focus its pin (the focused pin
    // renders a pulse element).
    await pricingRow.first().click()
    await expect(page).toHaveURL(/\/pricing/)
    await expect(page.getByTestId('comments-pin-pulse')).toBeVisible()
  })
})
