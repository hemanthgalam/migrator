export class ApiError extends Error {
  status: number;
  details?: string[];
  constructor(status: number, message: string, details?: string[]) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

/** True in the static GitHub Pages build, where the API runs inside the browser. */
export const IS_DEMO = import.meta.env.VITE_DEMO === 'true';

async function demoRequest<T>(method: string, path: string, body?: unknown): Promise<T> {
  const { handle, DemoError } = await import('../demo/server');
  try {
    const data = await handle(method, path, body);
    return (data === undefined ? undefined : structuredClone(data)) as T;
  } catch (e) {
    if (e instanceof DemoError) throw new ApiError(e.status, e.message, e.details);
    throw e;
  }
}

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  if (IS_DEMO) return demoRequest<T>(method, path, body);
  const isText = typeof body === 'string';
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? headers : { 'content-type': isText ? 'text/plain' : 'application/json', ...headers },
    body: body === undefined ? undefined : isText ? body : JSON.stringify(body),
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || res.statusText, data.details);
  return data as T;
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: unknown, headers?: Record<string, string>) => request<T>('POST', path, body ?? {}, headers),
  put: <T>(path: string, body: unknown) => request<T>('PUT', path, body),
  patch: <T>(path: string, body: unknown) => request<T>('PATCH', path, body),
  del: (path: string) => request<void>('DELETE', path),
};

/** Download a file written to a file storage connection. */
export async function downloadFile(connectionId: string, name: string) {
  if (!IS_DEMO) {
    window.location.href = `/api/connections/${connectionId}/files/${encodeURIComponent(name)}`;
    return;
  }
  const { fileText } = await import('../demo/server');
  const text = fileText(connectionId, name);
  if (text === undefined) throw new ApiError(404, 'File not found');
  const url = URL.createObjectURL(new Blob([text], { type: name.endsWith('.csv') ? 'text/csv' : 'application/x-ndjson' }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
