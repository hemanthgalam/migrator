import { Cable, FolderOpen, Pencil, Plus, Trash2, Upload, Zap } from 'lucide-react';
import { useRef, useState } from 'react';
import { ConnectionForm } from '../components/ConnectionForm';
import { DataTable } from '../components/DataTable';
import { Badge, Button, Card, ConnectorIcon, EmptyState, ErrorBanner, Loading, Modal, PageHeader, Spinner, useToast } from '../components/ui';
import { api } from '../lib/api';
import { fmtRelative } from '../lib/format';
import { useApi } from '../lib/hooks';
import { useMeta } from '../lib/meta';
import type { Connection, Preview, Stream } from '../lib/types';

function Browser({ conn, onClose }: { conn: Connection; onClose: () => void }) {
  const streams = useApi<Stream[]>(`/connections/${conn.id}/streams`);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const toast = useToast();
  const meta = useMeta();
  const readable = meta.connectors.find((c) => c.type === conn.type)?.roles.includes('source');

  async function open(name: string) {
    setSelected(name);
    setPreview(null);
    setPreviewError(null);
    try { setPreview(await api.get<Preview>(`/connections/${conn.id}/preview?stream=${encodeURIComponent(name)}&limit=25`)); } catch (e) { setPreviewError((e as Error).message); }
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      await api.post(`/connections/${conn.id}/files?name=${encodeURIComponent(file.name)}`, await file.text(), { 'content-type': 'text/plain' });
      toast({ tone: 'success', title: 'File uploaded', description: file.name });
      await streams.reload();
      open(file.name);
    } catch (e) {
      toast({ tone: 'error', title: 'Upload failed', description: (e as Error).message });
    }
    setUploading(false);
  }

  return (
    <Modal open onClose={onClose} wide title={conn.name} description="Browse streams and preview data">
      {conn.type === 'filesystem' && (
        <div className="mb-4 flex items-center justify-between rounded-lg border border-dashed border-default p-3">
          <p className="text-sm text-2">Upload a .csv or .jsonl file to use it as a pipeline source.</p>
          <input ref={fileInput} type="file" accept=".csv,.jsonl" hidden data-testid="file-upload" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
          <Button size="sm" icon={<Upload className="size-3.5" />} loading={uploading} onClick={() => fileInput.current?.click()}>Upload file</Button>
        </div>
      )}
      <ErrorBanner error={streams.error} />
      {streams.loading ? <Loading /> : (
        <div className="flex flex-wrap gap-2" data-testid="stream-list">
          {(streams.data || []).length === 0 && <p className="text-sm text-3">No streams found.</p>}
          {(streams.data || []).map((s) => (
            <button
              key={s.name}
              disabled={!readable}
              onClick={() => open(s.name)}
              className={`rounded-lg border px-3 py-1.5 font-mono text-xs transition-colors ${selected === s.name ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-600/15 dark:text-indigo-300' : 'border-default text-1 hover:border-brand-500'}`}
              title={s.description}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      {selected && (
        <div className="mt-4">
          {previewError ? <ErrorBanner error={previewError} /> : preview ? <DataTable data={preview} testId="stream-preview" /> : <div className="py-6 text-center"><Spinner /></div>}
        </div>
      )}
    </Modal>
  );
}

export default function Connections() {
  const connections = useApi<Connection[]>('/connections');
  const meta = useMeta();
  const toast = useToast();
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<Connection | undefined>();
  const [browsing, setBrowsing] = useState<Connection | null>(null);
  const [testing, setTesting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<Connection | null>(null);

  async function test(c: Connection) {
    setTesting(c.id);
    const r = await api.post<{ ok: boolean; message: string }>(`/connections/${c.id}/test`).catch((e) => ({ ok: false, message: e.message }));
    toast({ tone: r.ok ? 'success' : 'error', title: r.ok ? `${c.name} is reachable` : `${c.name} failed`, description: r.message });
    setTesting(null);
  }

  async function remove(c: Connection) {
    try {
      await api.del(`/connections/${c.id}`);
      connections.setData((list) => list?.filter((x) => x.id !== c.id));
      toast({ tone: 'success', title: 'Connection deleted' });
    } catch (e) {
      toast({ tone: 'error', title: 'Cannot delete connection', description: (e as Error).message });
    }
    setDeleting(null);
  }

  return (
    <>
      <PageHeader
        title="Connections"
        description="Credentials and settings for your sources and destinations. Secrets are never sent back to the browser."
        actions={<Button variant="primary" icon={<Plus className="size-4" />} onClick={() => { setEditing(undefined); setFormOpen(true); }}>Add connection</Button>}
      />
      {!connections.data ? <Loading /> : connections.data.length === 0 ? (
        <Card>
          <EmptyState icon={<Cable className="size-5" />} title="No connections yet" description="Connect a database, an API, or file storage. Try Sample data to explore without credentials." action={<Button variant="primary" onClick={() => setFormOpen(true)}>Add connection</Button>} />
        </Card>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {connections.data.map((c) => {
            const cm = meta.connectors.find((x) => x.type === c.type);
            return (
              <Card key={c.id} className="flex flex-col p-5" data-testid="connection-card">
                <div className="flex items-start gap-3">
                  <ConnectorIcon type={c.type} className="size-4.5" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-1">{c.name}</p>
                    <p className="text-xs text-2">{cm?.label ?? c.type}</p>
                  </div>
                  <div className="flex gap-1">{cm?.roles.map((r) => <Badge key={r}>{r === 'source' ? 'src' : 'dest'}</Badge>)}</div>
                </div>
                <p className="mt-3 text-xs text-3">Updated {fmtRelative(c.updatedAt)}</p>
                <div className="mt-4 flex flex-wrap gap-1.5 border-t border-default pt-4">
                  <Button size="sm" icon={<FolderOpen className="size-3.5" />} onClick={() => setBrowsing(c)}>Browse</Button>
                  <Button size="sm" variant="ghost" icon={<Zap className="size-3.5" />} loading={testing === c.id} onClick={() => test(c)}>Test</Button>
                  <Button size="sm" variant="ghost" icon={<Pencil className="size-3.5" />} onClick={() => { setEditing(c); setFormOpen(true); }} aria-label={`Edit ${c.name}`} />
                  <Button size="sm" variant="ghost" className="ml-auto" icon={<Trash2 className="size-3.5" />} onClick={() => setDeleting(c)} aria-label={`Delete ${c.name}`} />
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConnectionForm
        open={formOpen}
        existing={editing}
        onClose={() => setFormOpen(false)}
        onSaved={(c) => {
          setFormOpen(false);
          connections.reload();
          toast({ tone: 'success', title: editing ? 'Connection updated' : 'Connection created', description: c.name });
        }}
      />
      {browsing && <Browser conn={browsing} onClose={() => setBrowsing(null)} />}
      <Modal
        open={!!deleting}
        onClose={() => setDeleting(null)}
        title="Delete connection?"
        description={deleting ? `"${deleting.name}" will be removed. Pipelines that use it must be deleted first.` : ''}
        footer={<><Button onClick={() => setDeleting(null)}>Cancel</Button><Button variant="danger" onClick={() => deleting && remove(deleting)}>Delete</Button></>}
      >
        <p className="text-sm text-2">Data already written by pipelines is not affected.</p>
      </Modal>
    </>
  );
}
