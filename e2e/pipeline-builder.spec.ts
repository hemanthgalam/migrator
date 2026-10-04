import { expect, test } from '@playwright/test';
import { createConnection, runStatus, setConcurrency, uid } from './helpers';

test.describe('Pipeline builder', () => {
  test.beforeAll(async ({ request }) => setConcurrency(request, 2));

  test('build an ETL pipeline end to end, run it, and inspect the output', async ({ page, request }) => {
    const id = uid();
    await createConnection(request, { name: `CRM ${id}`, type: 'sample', config: { rowsPerStream: 600, latencyMs: 60 } });
    await createConnection(request, { name: `Lake ${id}`, type: 'filesystem', config: { format: 'csv' } });

    await page.goto('/pipelines');
    await page.getByRole('link', { name: 'New pipeline' }).first().click();
    await expect(page.getByRole('heading', { name: 'New pipeline' })).toBeVisible();
    const cont = page.getByRole('button', { name: 'Continue' });
    await expect(cont).toBeDisabled();

    // 1. Source
    await page.getByRole('radiogroup', { name: 'Source connection' }).getByRole('radio', { name: new RegExp(`CRM ${id}`) }).click();
    await page.getByLabel('Stream').selectOption('customers');
    await cont.click();

    // 2. Transform with live preview
    await expect(page.getByTestId('transform-preview')).toContainText('first_name');
    await page.getByLabel('Transform type').selectOption('filter');
    await page.getByRole('button', { name: 'Add step' }).click();
    await page.getByLabel('Step 1 field').fill('plan');
    await page.getByLabel('Step 1 operator').selectOption('in');
    await page.getByLabel('Step 1 value').fill('growth, enterprise');
    await page.getByLabel('Transform type').selectOption('mask');
    await page.getByRole('button', { name: 'Add step' }).click();
    await page.getByLabel('Step 2 field').fill('email');
    await page.getByLabel('Step 2 strategy').selectOption('email');
    await page.getByLabel('Transform type').selectOption('select');
    await page.getByRole('button', { name: 'Add step' }).click();
    await page.getByLabel('Step 3 fields').fill('id, email, plan');
    await page.getByRole('button', { name: 'Run preview' }).click();
    await expect(page.getByTestId('preview-summary')).toContainText(/25 sample rows in → \d+ out \(\d+ filtered\)/);
    const preview = page.getByTestId('transform-preview');
    await expect(preview.locator('thead th')).toHaveText(['id', 'email', 'plan']);
    await expect(preview.locator('tbody')).toContainText('***@example.com');
    await expect(preview.locator('tbody')).not.toContainText('free');
    await cont.click();

    // 3. Destination
    await page.getByRole('radiogroup', { name: 'Destination connection' }).getByRole('radio', { name: new RegExp(`Lake ${id}`) }).click();
    await expect(page.getByLabel('Target')).toHaveValue('customers');
    await page.getByLabel('Target').fill(`premium_${id}`);
    await page.getByLabel('Write mode').selectOption('overwrite');
    await cont.click();

    // 4. Schedule & review
    await page.getByLabel('Pipeline name').fill(`Premium customers ${id}`);
    await page.getByLabel('Batch size').fill('50');
    await expect(page.getByText('Filter rows → Mask PII → Select fields')).toBeVisible();
    await page.getByRole('button', { name: 'Create & run' }).click();

    // Run page streams progress until the async job finishes.
    await expect(page).toHaveURL(/\/runs\/run_/);
    await expect(page.getByRole('heading', { name: `Premium customers ${id}` })).toBeVisible();
    await expect(runStatus(page)).toHaveAttribute('data-status', 'running');
    await expect(runStatus(page)).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 });
    await expect(page.getByTestId('rows-read')).toHaveText('600');
    await expect(page.getByTestId('run-percent')).toHaveText('100%');
    const logs = page.getByTestId('run-logs');
    await expect(logs).toContainText('Applying 3 transform step(s): filter → mask → select');
    await expect(logs).toContainText('Run succeeded');
    const written = Number((await page.getByTestId('rows-written').innerText()).replace(/,/g, ''));
    expect(written).toBeGreaterThan(0);
    expect(written).toBeLessThan(600);

    // Pipeline page shows history and the produced file.
    await page.getByRole('link', { name: `Premium customers ${id}` }).click();
    await expect(page.getByTestId('transform-steps').locator('li')).toHaveCount(3);
    await expect(page.getByTestId('run-row')).toHaveCount(1);
    await page.getByRole('button', { name: 'Preview output' }).click();
    const out = page.getByTestId('output-preview');
    await expect(out.locator('thead th')).toHaveText(['id', 'email', 'plan']);
    await expect(out.locator('tbody tr').first()).toContainText('***@example.com');
    const download = await (await request.get(`/api/pipelines`)).json();
    expect(download.find((p: { name: string }) => p.name === `Premium customers ${id}`).lastRun.status).toBe('succeeded');
  });

  test('edit a pipeline and delete it', async ({ page, request }) => {
    const id = uid();
    const src = await createConnection(request, { name: `Src ${id}`, type: 'sample', config: { rowsPerStream: 50 } });
    const dst = await createConnection(request, { name: `Dst ${id}`, type: 'filesystem' });
    const res = await request.post('/api/pipelines', { data: { name: `Orders ${id}`, sourceConnectionId: src.id, sourceStream: 'orders', destConnectionId: dst.id, destTarget: 'orders' } });
    const pipeline = await res.json();

    await page.goto(`/pipelines/${pipeline.id}`);
    await page.getByRole('link', { name: 'Edit' }).click();
    await page.getByRole('button', { name: /Schedule & review/ }).click();
    await page.getByLabel('Pipeline name').fill(`Orders renamed ${id}`);
    await page.getByLabel('Schedule').selectOption({ label: 'Every 15 min' });
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('heading', { name: `Orders renamed ${id}` })).toBeVisible();
    await expect(page.getByText('Every 15 min')).toBeVisible();

    await page.getByRole('button', { name: 'Delete' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete pipeline' }).click();
    await expect(page).toHaveURL(/\/pipelines$/);
    await expect(page.getByTestId('pipeline-card').filter({ hasText: `Orders renamed ${id}` })).toHaveCount(0);
  });
});
