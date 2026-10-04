import { expect, test } from '@playwright/test';
import { uid } from './helpers';

test.describe('Connections', () => {
  test('create file storage, upload a CSV, and preview it', async ({ page }) => {
    const name = `Uploads ${uid()}`;
    await page.goto('/connections');
    await page.getByRole('button', { name: 'Add connection' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /File storage/ }).click();
    await dialog.getByLabel('Connection name').fill(name);
    await dialog.getByRole('button', { name: 'Test connection' }).click();
    await expect(dialog.getByTestId('connection-test-result')).toContainText('Storage is writable');
    await dialog.getByRole('button', { name: 'Create connection' }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Connection created' })).toBeVisible();

    const card = page.getByTestId('connection-card').filter({ hasText: name });
    await card.getByRole('button', { name: 'Browse' }).click();
    await page.getByTestId('file-upload').setInputFiles({
      name: 'people.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from('id,name,city\n1,Ada,London\n2,"Hopper, Grace",New York\n'),
    });
    await expect(page.getByTestId('stream-list').getByRole('button', { name: 'people.csv' })).toBeVisible();
    const preview = page.getByTestId('stream-preview');
    await expect(preview).toContainText('Hopper, Grace');
    await expect(preview.locator('tbody tr')).toHaveCount(2);
  });

  test('failed connection tests explain the problem and secrets stay masked', async ({ page, request }) => {
    const name = `Warehouse ${uid()}`;
    await page.goto('/connections');
    await page.getByRole('button', { name: 'Add connection' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /PostgreSQL/ }).click();
    await dialog.getByLabel('Connection name').fill(name);
    await dialog.getByLabel('Host').fill('127.0.0.1');
    await dialog.getByLabel('Port').fill('1');
    await dialog.getByLabel('Database').fill('analytics');
    await dialog.getByLabel('Username').fill('etl');
    await dialog.getByLabel('Password').fill('super-secret');
    await dialog.getByRole('button', { name: 'Test connection' }).click();
    await expect(dialog.getByTestId('connection-test-result')).toContainText(/ECONNREFUSED|connect/i);
    await dialog.getByRole('button', { name: 'Create connection' }).click();
    await expect(page.getByTestId('connection-card').filter({ hasText: name })).toBeVisible();

    const list = await (await request.get('/api/connections')).text();
    expect(list).not.toContain('super-secret');

    await page.getByRole('button', { name: `Edit ${name}` }).click();
    await expect(page.getByRole('dialog').getByLabel('Password')).toHaveValue('••••••••');
    await page.getByRole('dialog').getByRole('button', { name: 'Close' }).click();

    await page.getByRole('button', { name: `Delete ${name}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByTestId('connection-card').filter({ hasText: name })).toHaveCount(0);
  });

  test('required fields are enforced', async ({ page }) => {
    await page.goto('/connections');
    await page.getByRole('button', { name: 'Add connection' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('button', { name: /MongoDB/ }).click();
    await dialog.getByLabel('Connection name').fill('Mongo without URI');
    await dialog.getByRole('button', { name: 'Create connection' }).click();
    await expect(dialog.getByRole('alert')).toContainText('Missing required fields: Connection URI, Database');
  });
});
