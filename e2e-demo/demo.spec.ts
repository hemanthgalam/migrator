import { expect, test } from '@playwright/test';

const status = (page: import('@playwright/test').Page) => page.getByTestId('run-status').first();

test.describe('Static demo (GitHub Pages build)', () => {
  test('runs the seeded pipeline asynchronously in the browser', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByTestId('demo-banner')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Pipelines' }).click();
    await page.getByRole('button', { name: 'Run Active customers to lake' }).click();
    await expect(page).toHaveURL(/\/migrator\/runs\/run_/);
    await expect(status(page)).toHaveAttribute('data-status', 'running');
    await expect(status(page)).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 });
    await expect(page.getByTestId('rows-read')).toHaveText('2,500');
    await expect(page.getByTestId('run-logs')).toContainText('Run succeeded');

    // Deep links survive a reload (404.html fallback) and state persists in the browser.
    await page.reload();
    await expect(status(page)).toHaveAttribute('data-status', 'succeeded');

    await page.getByRole('link', { name: 'Active customers to lake' }).click();
    await page.getByRole('button', { name: 'Preview output' }).click();
    await expect(page.getByTestId('output-preview').locator('tbody tr').first()).toContainText('***@example.com');
  });

  test('builds a pipeline with transforms, cancels a run, and explains database limits', async ({ page }) => {
    await page.goto('pipelines/new');
    await page.getByRole('radiogroup', { name: 'Source connection' }).getByRole('radio', { name: /Demo SaaS data/ }).click();
    await page.getByLabel('Stream').selectOption('events');
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Transform type').selectOption('filter');
    await page.getByRole('button', { name: 'Add step' }).click();
    await page.getByLabel('Step 1 field').fill('event');
    await page.getByLabel('Step 1 value').fill('checkout');
    await page.getByRole('button', { name: 'Run preview' }).click();
    await expect(page.getByTestId('preview-summary')).toContainText(/25 sample rows in → \d+ out/);
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('radiogroup', { name: 'Destination connection' }).getByRole('radio', { name: /Analytics lake/ }).click();
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByLabel('Pipeline name').fill('Checkout events');
    await page.getByLabel('Batch size').fill('25');
    await page.getByRole('button', { name: 'Create & run' }).click();

    await expect(status(page)).toHaveAttribute('data-status', 'running');
    await page.getByRole('button', { name: 'Cancel run' }).click();
    await expect(status(page)).toHaveAttribute('data-status', 'cancelled');
    await expect(page.getByTestId('run-logs')).toContainText('Run cancelled');

    await page.goto('connections');
    await page.getByRole('button', { name: 'Add connection' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /PostgreSQL/ }).click();
    await dialog.getByLabel('Host').fill('db');
    await dialog.getByLabel('Database').fill('dw');
    await dialog.getByLabel('Username').fill('etl');
    await dialog.getByRole('button', { name: 'Test connection' }).click();
    await expect(dialog.getByTestId('connection-test-result')).toContainText('need the self-hosted server');
  });
});
