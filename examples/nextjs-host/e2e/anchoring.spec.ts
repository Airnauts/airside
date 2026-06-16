import { expect, test } from '@playwright/test'
import { activate, login, placeElementPin, placeTextSelection, urlFor } from './helpers'

test.describe('anchoring', () => {
  test('text selection: highlight renders and re-renders after reload', async ({ page }) => {
    await activate(page, '/article', 'anchor-text')
    await login(page)
    await placeTextSelection(page, 'Honoring that promise is the whole game', 'Comment on a quote')
    // A selection anchor renders a highlight rect.
    await expect(page.getByTestId('airside-highlight').first()).toBeVisible()

    await page.reload()
    // Highlight re-renders against the unchanged DOM (ns carried in the URL).
    await expect(page.getByTestId('airside-highlight').first()).toBeVisible()
  })

  for (const variant of ['reordered', 'renamed', 'wrapped'] as const) {
    test(`element pin re-anchors after ?variant=${variant}`, async ({ page }) => {
      const ns = `anchor-${variant}`
      await activate(page, '/article', ns)
      await login(page)
      // Target the 2nd <li> by text unique to it ("Content signals" also occurs in a nearby <p>).
      await placeElementPin(page, 'disambiguate near-matches', `pin for ${variant}`)
      await expect(page.getByTestId('airside-pin')).toHaveCount(1)

      // Reload the mutated variant (same ns → same pageKey); must re-anchor.
      await page.goto(urlFor('/article', { ns, variant }))
      await expect(page.getByTestId('airside-place')).toBeVisible() // active via localStorage
      await expect(page.getByTestId('airside-pin')).toHaveCount(1)
      await expect(page.getByTestId('airside-detached')).toHaveCount(0)
    })
  }

  test('element pin orphans after ?variant=removed', async ({ page }) => {
    const ns = 'anchor-removed'
    await activate(page, '/article', ns)
    await login(page)
    // Target the 2nd <li> by text unique to it ("Content signals" also occurs in a nearby <p>).
    await placeElementPin(page, 'disambiguate near-matches', 'pin that will orphan')
    await expect(page.getByTestId('airside-pin')).toHaveCount(1)

    await page.goto(urlFor('/article', { ns, variant: 'removed' }))
    await expect(page.getByTestId('airside-place')).toBeVisible()
    // The anchored <li> is gone → no positioned pin; the thread surfaces as detached
    // and/or in the panel's needs-review section.
    await expect(page.getByTestId('airside-pin')).toHaveCount(0)
    const detached = page.getByTestId('airside-detached')
    await page.getByTestId('airside-panel-open').click()
    const needsReview = page.getByTestId('airside-needs-review')
    await expect(detached.or(needsReview).first()).toBeVisible()
  })
})
