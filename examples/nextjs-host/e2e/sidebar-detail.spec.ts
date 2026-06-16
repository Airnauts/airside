import { expect, test } from '@playwright/test'
import { activate, DEV_KEY, login, placeElementPin, urlFor } from './helpers'

test.describe('sidebar master–detail', () => {
  // Cold next start + cross-page navigation handoff can be slow.
  test.setTimeout(90_000)

  test('same-page row click opens the in-sidebar detail and focuses the pin', async ({ page }) => {
    const ns = 'sidebar-same'
    const body = 'Same-page sidebar detail body'

    await activate(page, '/pricing', ns)
    await login(page)
    await placeElementPin(page, 'Starter', body)

    await page.getByTestId('comments-panel-open').click()
    await expect(page.getByTestId('comments-panel')).toBeVisible()

    // Click this test's row (root text appears in the card).
    const row = page.getByTestId('comments-panel-row').filter({ hasText: body })
    await expect(row).toHaveCount(1)
    await row.first().click()

    // The in-sidebar detail opens (Back button) while the panel stays open and the pin focuses.
    await expect(page.getByRole('button', { name: /back/i })).toBeVisible()
    await expect(page.getByTestId('comments-panel')).toBeVisible()
    await expect(page.getByTestId('comments-pin-pulse')).toBeVisible()
    // The thread's comment must actually render in the detail on the FIRST open (regression guard:
    // the detail used to read comments via openId, which the pin popover nulled → empty on first open).
    await expect(page.getByTestId('comments-panel').getByText(body)).toBeVisible()
    // The reply input is focused on detail entry so the user can type immediately. This is the
    // real-browser check: the Composer mounts inside a Radix Dialog (which has its own focus
    // management) — jsdom can't observe that interaction.
    await expect(page.getByTestId('comments-panel').getByPlaceholder(/reply/i)).toBeFocused()
    // No navigation occurred.
    await expect(page).toHaveURL(/\/pricing/)

    // Back returns to the list.
    await page.getByRole('button', { name: /back/i }).click()
    await expect(page.getByTestId('comments-panel-row').filter({ hasText: body })).toBeVisible()
  })

  test('an open pin popover survives opening and interacting with the sidebar', async ({
    page,
  }) => {
    const ns = 'sidebar-popover-coexist'
    const body = 'Popover coexist body'

    await activate(page, '/pricing', ns)
    await login(page)
    // Placing a comment leaves its pin popover open.
    await placeElementPin(page, 'Starter', body)
    await expect(page.getByTestId('comments-pin-popover')).toBeVisible()

    // Opening the sidebar must NOT dismiss the open pin popover.
    await page.getByTestId('comments-panel-open').click()
    await expect(page.getByTestId('comments-panel')).toBeVisible()
    await expect(page.getByTestId('comments-pin-popover')).toBeVisible()

    // Interacting with the sidebar (a filter chip) must NOT dismiss it either.
    await page.getByRole('button', { name: 'All' }).click()
    await expect(page.getByTestId('comments-pin-popover')).toBeVisible()
  })

  test('clicking a pin opens the popover with the reply input focused', async ({ page }) => {
    const ns = 'pin-focus'
    const body = 'Pin focus body'

    await activate(page, '/pricing', ns)
    await login(page)
    await placeElementPin(page, 'Starter', body)

    // Reload so the popover starts closed, then open it by clicking the pin.
    await activate(page, '/pricing', ns)
    await login(page)
    await page.getByTestId('comments-pin').first().click()
    await expect(page.getByTestId('comments-pin-popover')).toBeVisible()
    // The popover's reply input is focused on open (deferred-rAF autofocus beats Radix's
    // open-autofocus, which we prevent on the popover content).
    await expect(page.getByTestId('comments-pin-popover').getByPlaceholder(/reply/i)).toBeFocused()
  })

  test('cross-page row click navigates and restores the detail view', async ({ page }) => {
    const ns = 'sidebar-cross'
    const body = 'Cross-page sidebar detail body'

    // Thread lives on /article.
    await activate(page, '/article', ns)
    await login(page)
    await placeElementPin(page, 'disambiguate near-matches', body)

    // From /pricing, open the panel and select the /article thread (identity persists in
    // localStorage, so login() is a no-op here).
    await activate(page, '/pricing', ns)
    await login(page)
    await page.getByTestId('comments-panel-open').click()
    await expect(page.getByTestId('comments-panel')).toBeVisible()
    const row = page.getByTestId('comments-panel-row').filter({ hasText: body })
    await expect(row).toHaveCount(1)
    await row.first().click()

    // Navigates to /article and reopens the sidebar detail there, with the pin focused.
    await expect(page).toHaveURL(/\/article/)
    await expect(page.getByRole('button', { name: /back/i })).toBeVisible()
    await expect(page.getByTestId('comments-pin-pulse')).toBeVisible()
    // The restored detail must render the thread's comment (cross-page fallback reads detail by id).
    await expect(page.getByTestId('comments-panel').getByText(body)).toBeVisible()
    // Cross-page focus: the reply input is focused after the fresh-page Dialog open + restore.
    // This is the path most at risk (Radix open-autofocus competing with the Composer mount).
    await expect(page.getByTestId('comments-panel').getByPlaceholder(/reply/i)).toBeFocused()
  })

  test('?airside-thread deep-link opens the detail and strips the param', async ({ page }) => {
    const ns = 'sidebar-deeplink'
    const body = 'Deep-link sidebar detail body'

    await activate(page, '/article', ns)
    await login(page)
    await placeElementPin(page, 'disambiguate near-matches', body)

    // Read the thread id from its panel row wrapper (data-thread-id).
    await page.getByTestId('comments-panel-open').click()
    const rowWrapper = page.locator('[data-thread-id]').filter({ hasText: body })
    await expect(rowWrapper).toHaveCount(1)
    const id = await rowWrapper.first().getAttribute('data-thread-id')
    expect(id).toBeTruthy()

    // Load the article fresh with the deep-link param.
    await page.goto(
      urlFor('/article', { ns, 'airside-key': DEV_KEY, 'airside-thread': id as string }),
    )

    // The detail opens automatically and the deep-link param is stripped from the URL.
    await expect(page.getByRole('button', { name: /back/i })).toBeVisible()
    await expect(page.getByTestId('comments-panel').getByText(body)).toBeVisible()
    await expect(page).not.toHaveURL(/airside-thread/)
  })
})
