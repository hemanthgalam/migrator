import { expect, test } from '@playwright/test';
import { cancelActiveRuns, createConnection, createPipeline, runStatus, setConcurrency, uid } from './helpers';

test.describe('Async processing', () => {
  test.afterEach(async ({ request }) => {
    await cancelActiveRuns(request);
    await setConcurrency(request, 2);
  });

  test('long runs report live progress and can be cancelled', async ({ page, request }) => {
    const id = uid();
    const src = await createConnection(request, { name: `Slow ${id}`, type: 'sample', config: { rowsPerStream: 20000, latencyMs: 250 } });
    const dst = await createConnection(request, { name: `Out ${id}`, type: 'filesystem', config: { format: 'jsonl' } });
    const p = await createPipeline(request, { name: `Clickstream ${id}`, sourceConnectionId: src.id, sourceStream: 'events', destConnectionId: dst.id, destTarget: 'events' });

    await page.goto('/pipelines');
    await page.getByRole('button', { name: `Run Clickstream ${id}` }).click();
    await expect(page).toHaveURL(/\/runs\/run_/);
    await expect(runStatus(page)).toHaveAttribute('data-status', 'running');

    // Progress advances while we watch, without reloading.
    await expect(page.getByTestId('rows-read')).not.toHaveText('0');
    const first = Number((await page.getByTestId('rows-read').innerText()).replace(/,/g, ''));
    await expect.poll(async () => Number((await page.getByTestId('rows-read').innerText()).replace(/,/g, ''))).toBeGreaterThan(first);
    await expect(page.getByTestId('run-percent')).toHaveText(/\d+%/);

    await page.getByRole('button', { name: 'Cancel run' }).click();
    await expect(runStatus(page)).toHaveAttribute('data-status', 'cancelled');
    await expect(page.getByTestId('run-logs')).toContainText('Run cancelled');
    const rowsRead = Number((await page.getByTestId('rows-read').innerText()).replace(/,/g, ''));
    expect(rowsRead).toBeLessThan(20000);

    // A cancelled overwrite never leaves a partial file behind.
    const files = await (await request.get(`/api/connections/${dst.id}/streams`)).json();
    expect(files).toEqual([]);
    expect(p.id).toBeTruthy();
  });

  test('the worker pool queues runs beyond its concurrency limit', async ({ page, request }) => {
    const id = uid();
    await setConcurrency(request, 1);
    const src = await createConnection(request, { name: `Slow ${id}`, type: 'sample', config: { rowsPerStream: 3000, latencyMs: 150 } });
    const dst = await createConnection(request, { name: `Out ${id}`, type: 'filesystem' });
    const a = await createPipeline(request, { name: `Queue A ${id}`, sourceConnectionId: src.id, sourceStream: 'orders', destConnectionId: dst.id, destTarget: 'a' });
    const b = await createPipeline(request, { name: `Queue B ${id}`, sourceConnectionId: src.id, sourceStream: 'events', destConnectionId: dst.id, destTarget: 'b' });

    await page.goto('/runs');
    await page.getByRole('tab', { name: 'Active' }).click();
    await request.post(`/api/pipelines/${a.id}/runs`);
    await request.post(`/api/pipelines/${b.id}/runs`);

    // Both appear live, one running and one waiting for a worker.
    const rowA = page.getByTestId('run-row').filter({ hasText: `Queue A ${id}` });
    const rowB = page.getByTestId('run-row').filter({ hasText: `Queue B ${id}` });
    await expect(rowA.getByTestId('run-status')).toHaveAttribute('data-status', 'running');
    await expect(rowB.getByTestId('run-status')).toHaveAttribute('data-status', 'queued');
    await expect(page.getByTestId('worker-status')).toContainText('1 of 1 busy');

    // When A finishes, B is picked up automatically and finishes too.
    await expect(rowB.getByTestId('run-status')).toHaveAttribute('data-status', 'running', { timeout: 30_000 });
    await page.getByRole('tab', { name: 'Succeeded' }).click();
    await expect(page.getByTestId('run-row').filter({ hasText: `Queue A ${id}` })).toBeVisible();
    await expect(page.getByTestId('run-row').filter({ hasText: `Queue B ${id}` }).getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 });
  });

  test('transient failures retry with backoff and recover', async ({ page, request }) => {
    const id = uid();
    const src = await createConnection(request, { name: `Flaky ${id}`, type: 'sample', config: { rowsPerStream: 400, latencyMs: 50, failAfterRows: 200, failAttempts: 1 } });
    const dst = await createConnection(request, { name: `Out ${id}`, type: 'filesystem' });
    const p = await createPipeline(request, { name: `Flaky sync ${id}`, sourceConnectionId: src.id, sourceStream: 'orders', destConnectionId: dst.id, destTarget: 'orders', maxRetries: 2 });

    const run = await (await request.post(`/api/pipelines/${p.id}/runs`)).json();
    await page.goto(`/runs/${run.id}`);
    await expect(runStatus(page)).toHaveAttribute('data-status', 'succeeded', { timeout: 30_000 });
    await expect(page.getByTestId('run-attempt')).toHaveText('2 / 3');
    const logs = page.getByTestId('run-logs');
    await expect(logs).toContainText('Simulated source failure after 200 rows (attempt 1)');
    await expect(logs).toContainText(/Retrying in 0\.4s \(attempt 2 of 3\)/);
    await expect(logs).toContainText('Attempt 2 of 3');
    await expect(page.getByTestId('rows-read')).toHaveText('400');
  });

  test('permanent failures surface the error and can be retried manually', async ({ page, request }) => {
    const id = uid();
    const src = await createConnection(request, { name: `Broken ${id}`, type: 'sample', config: { rowsPerStream: 300, failAfterRows: 100, failAttempts: 99 } });
    const dst = await createConnection(request, { name: `Out ${id}`, type: 'filesystem' });
    const p = await createPipeline(request, { name: `Broken sync ${id}`, sourceConnectionId: src.id, sourceStream: 'customers', destConnectionId: dst.id, destTarget: 'c', maxRetries: 1 });

    const run = await (await request.post(`/api/pipelines/${p.id}/runs`)).json();
    await page.goto(`/runs/${run.id}`);
    await expect(runStatus(page)).toHaveAttribute('data-status', 'failed', { timeout: 30_000 });
    await expect(page.getByTestId('run-error')).toContainText('Simulated source failure after 100 rows (attempt 2)');
    await expect(page.getByTestId('run-attempt')).toHaveText('2 / 2');

    await page.getByRole('button', { name: 'Retry' }).click();
    await expect(page).not.toHaveURL(new RegExp(run.id));
    await expect(page.getByText(/Triggered retry/)).toBeVisible();

    await page.goto('/runs');
    await page.getByRole('tab', { name: 'Failed' }).click();
    await expect(page.getByTestId('run-row').filter({ hasText: `Broken sync ${id}` }).first()).toBeVisible();
  });

  test('scheduled pipelines are enqueued automatically', async ({ page, request }) => {
    const id = uid();
    const src = await createConnection(request, { name: `Sched ${id}`, type: 'sample', config: { rowsPerStream: 50 } });
    const dst = await createConnection(request, { name: `Out ${id}`, type: 'filesystem' });
    const p = await createPipeline(request, { name: `Every 10s ${id}`, sourceConnectionId: src.id, sourceStream: 'orders', destConnectionId: dst.id, destTarget: 'o', scheduleIntervalSec: 10 });

    await page.goto(`/pipelines/${p.id}`);
    await expect(page.getByText('Every 10s', { exact: true })).toBeVisible();
    const row = page.getByTestId('run-row').first();
    await expect(row).toContainText('schedule', { timeout: 20_000 });
    await expect(row.getByTestId('run-status')).toHaveAttribute('data-status', 'succeeded');
    await request.patch(`/api/pipelines/${p.id}`, { data: { enabled: false } });
  });
});
