import { expect, test } from '@playwright/test';

test('API reference is linked from the console and can call the live API', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'API docs' }).click();
  await expect(page).toHaveURL(/\/api-docs\/$/);
  await expect(page.getByRole('heading', { name: /Migrator API/ })).toBeVisible();
  for (const tag of ['Connections', 'Pipelines', 'Runs', 'System']) await expect(page.locator(`[data-tag="${tag}"]`)).toBeVisible();

  const health = page.locator('.opblock').filter({ hasText: 'Health check' });
  await health.locator('.opblock-summary-control').click();
  await health.getByRole('button', { name: 'Try it out' }).click();
  await health.getByRole('button', { name: 'Execute' }).click();
  await expect(health.locator('.live-responses-table')).toContainText('"status": "ok"');

  await page.getByRole('link', { name: 'Back to console' }).click();
  await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
});
