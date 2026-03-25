import { test, expect } from '@playwright/test'

const SLUG = 'yolan-maldonado'
const FORM_URL = `/form/${SLUG}`

/**
 * These E2E tests require authentication.
 *
 * Option 1 (recommended): Set E2E_PIN to your user's PIN:
 *   E2E_PIN=123456 npx playwright test
 *
 * Option 2: Use saved auth state:
 *   1. Log in manually: npx playwright codegen --save-storage=e2e/auth.json http://localhost:5173
 *   2. Run tests (they'll use the saved session cookies)
 */

// Helper: authenticate via the login dialog
async function login(page: import('@playwright/test').Page) {
  const pin = process.env.E2E_PIN
  if (!pin) {
    test.skip(true, 'E2E_PIN env var not set — skipping auth-dependent tests')
    return
  }

  await page.goto('/')

  // If already on form page (session still valid), done
  const loginBtn = page.getByRole('button', { name: 'Se connecter' })
  if (!(await loginBtn.isVisible({ timeout: 3000 }).catch(() => false))) {
    await page.goto(FORM_URL)
    return
  }

  await loginBtn.click()
  await page.getByText('Yolan M.').click()
  await page.getByPlaceholder('Code a 6 chiffres').fill(pin)
  await page.getByPlaceholder('Code a 6 chiffres').press('Enter')

  // Handle potential PIN customization dialog
  const customizeHeading = page.getByText('Choisissez votre code personnel')
  if (await customizeHeading.isVisible({ timeout: 2000 }).catch(() => false)) {
    // Already customized or skip — just navigate directly
    test.skip(true, 'PIN customization required — set up user first')
    return
  }

  await page.waitForURL(`**/form/${SLUG}`, { timeout: 10_000 })
}

test.describe('Form submit flow', () => {
  test('submit button is visible on step 1 and shows confirmation dialog', async ({ page }) => {
    await login(page)

    // Submit button should be visible in the header on step 1
    const submitBtn = page.getByTestId('header-submit-btn')
    await expect(submitBtn).toBeVisible({ timeout: 10_000 })
    await expect(submitBtn).toContainText('Soumettre')

    // Click submit on non-review step — confirmation dialog appears
    await submitBtn.click()
    await expect(page.getByText('Soumettre sans vérifier ?')).toBeVisible()

    // Cancel closes the dialog without submitting
    await page.getByRole('button', { name: 'Annuler' }).click()
    await expect(page.getByText('Soumettre sans vérifier ?')).not.toBeVisible()
  })

  test('autosave indicator appears after rating a skill', async ({ page }) => {
    await login(page)

    const submitBtn = page.getByTestId('header-submit-btn')
    await expect(submitBtn).toBeVisible({ timeout: 10_000 })

    // Click a rating option on the first skill
    const skillCard = page.locator('[data-skill]').first()
    await expect(skillCard).toBeVisible()
    const ratingOption = skillCard.locator('button').first()
    await ratingOption.click()

    // Autosave indicator shows "Sauvegardé ✓" after debounce + network
    await expect(page.getByText('Sauvegardé ✓')).toBeVisible({ timeout: 5000 })
  })
})
