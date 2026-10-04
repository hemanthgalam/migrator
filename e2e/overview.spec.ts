import { expect, test } from '@playwright/test';

test.describe('Workspace shell', () => {
  test('overview shows KPIs, chart, and the seeded demo workspace', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
    for (const kpi of ['runs', 'success-rate', 'rows-loaded', 'avg-duration']) await expect(page.getByTestId(`kpi-${kpi}`)).toBeVisible();
    await expect(page.getByRole('img', { name: /Runs per day/ })).toBeVisible();
    await expect(page.getByTestId('worker-status')).toContainText('Live');

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Pipelines' }).click();
    await expect(page).toHaveURL(/\/pipelines$/);
    await expect(page.getByTestId('pipeline-card').filter({ hasText: 'Active customers to lake' })).toBeVisible();
    await expect(page.getByTestId('pipeline-card').filter({ hasText: 'Paid orders sync' })).toContainText('Hourly');

    await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Connections' }).click();
    await expect(page.getByTestId('connection-card').filter({ hasText: 'Demo SaaS data' })).toBeVisible();
  });

  test('dark mode toggles and persists across reloads', async ({ page }) => {
    await page.goto('/');
    const html = page.locator('html');
    const initial = await html.getAttribute('data-theme');
    await page.getByRole('button', { name: 'Toggle theme' }).click();
    const toggled = initial === 'dark' ? 'light' : 'dark';
    await expect(html).toHaveAttribute('data-theme', toggled);
    await page.reload();
    await expect(html).toHaveAttribute('data-theme', toggled);
  });

  test('unknown routes show a friendly 404', async ({ page }) => {
    await page.goto('/does-not-exist');
    await expect(page.getByText('Page not found')).toBeVisible();
    await page.getByRole('button', { name: 'Back to overview' }).click();
    await expect(page.getByRole('heading', { name: 'Overview' })).toBeVisible();
  });
});
