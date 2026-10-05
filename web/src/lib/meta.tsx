import { createContext, useContext, type ReactNode } from 'react';
import { Loading, ErrorBanner } from '../components/ui';
import { useApi } from './hooks';
import type { Meta } from './types';

const MetaContext = createContext<Meta | null>(null);

export function MetaProvider({ children }: { children: ReactNode }) {
  const { data, error } = useApi<Meta>('/meta');
  if (error) return <div className="p-8"><ErrorBanner error={error} /></div>;
  if (!data) return <Loading />;
  return <MetaContext.Provider value={data}>{children}</MetaContext.Provider>;
}

export function useMeta() {
  const meta = useContext(MetaContext);
  if (!meta) throw new Error('useMeta must be used inside MetaProvider');
  return meta;
}

export function useConnector(type: string | undefined) {
  return useMeta().connectors.find((c) => c.type === type);
}
