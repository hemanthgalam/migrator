import { Cpu } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, Card, CardHeader, Field, Input, Loading, PageHeader, useToast } from '../components/ui';
import { api } from '../lib/api';
import { useApi } from '../lib/hooks';

export default function SettingsPage() {
  const settings = useApi<{ concurrency: number }>('/settings');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);
  const toast = useToast();
  useEffect(() => { if (settings.data) setValue(String(settings.data.concurrency)); }, [settings.data]);

  async function save() {
    setSaving(true);
    try {
      const s = await api.put<{ concurrency: number }>('/settings', { concurrency: Number(value) });
      settings.setData(s);
      toast({ tone: 'success', title: 'Worker pool updated', description: `${s.concurrency} concurrent runs` });
    } catch (e) {
      toast({ tone: 'error', title: 'Could not save', description: (e as Error).message });
    }
    setSaving(false);
  }

  return (
    <>
      <PageHeader title="Settings" description="Workspace-wide execution settings." />
      <Card className="max-w-2xl">
        <CardHeader title={<span className="inline-flex items-center gap-2"><Cpu className="size-4" />Worker pool</span>} description="How many pipeline runs may execute at the same time. Extra runs wait in the queue." />
        {!settings.data ? <Loading /> : (
          <form className="flex items-end gap-3 p-5" onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="w-40">
              <Field label="Concurrent runs" htmlFor="concurrency" help="Between 1 and 16">
                <Input id="concurrency" type="number" min={1} max={16} value={value} onChange={(e) => setValue(e.target.value)} />
              </Field>
            </div>
            <Button variant="primary" type="submit" loading={saving} className="mb-[22px]">Save</Button>
          </form>
        )}
      </Card>
    </>
  );
}
