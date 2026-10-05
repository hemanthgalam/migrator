import { expect, type APIRequestContext, type Page } from '@playwright/test';

export const uid = () => Math.random().toString(36).slice(2, 7);

export async function createConnection(request: APIRequestContext, body: { name: string; type: string; config?: Record<string, unknown> }) {
  const res = await request.post('/api/connections', { data: body });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

export async function createPipeline(request: APIRequestContext, body: Record<string, unknown>) {
  const res = await request.post('/api/pipelines', { data: { writeMode: 'overwrite', batchSize: 100, maxRetries: 0, ...body } });
  expect(res.status(), await res.text()).toBe(201);
  return res.json();
}

export async function setConcurrency(request: APIRequestContext, concurrency: number) {
  const res = await request.put('/api/settings', { data: { concurrency } });
  expect(res.ok()).toBeTruthy();
}

export async function cancelActiveRuns(request: APIRequestContext) {
  const runs = await (await request.get('/api/runs?status=queued,retrying,running&limit=200')).json();
  for (const r of runs) await request.post(`/api/runs/${r.id}/cancel`);
}

export const runStatus = (page: Page) => page.getByTestId('run-status').first();
