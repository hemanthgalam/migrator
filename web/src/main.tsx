import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import './index.css';
import { Layout } from './components/Layout';
import { ToastProvider } from './components/ui';
import { LiveProvider } from './lib/live';
import { MetaProvider } from './lib/meta';
import Dashboard from './pages/Dashboard';
import Pipelines from './pages/Pipelines';
import PipelineEditor from './pages/PipelineEditor';
import PipelineDetail from './pages/PipelineDetail';
import Runs from './pages/Runs';
import RunDetail from './pages/RunDetail';
import Connections from './pages/Connections';
import SettingsPage from './pages/Settings';
import NotFound from './pages/NotFound';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <ToastProvider>
        <LiveProvider>
          <MetaProvider>
            <Layout>
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/pipelines" element={<Pipelines />} />
                <Route path="/pipelines/new" element={<PipelineEditor />} />
                <Route path="/pipelines/:id" element={<PipelineDetail />} />
                <Route path="/pipelines/:id/edit" element={<PipelineEditor />} />
                <Route path="/runs" element={<Runs />} />
                <Route path="/runs/:id" element={<RunDetail />} />
                <Route path="/connections" element={<Connections />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Layout>
          </MetaProvider>
        </LiveProvider>
      </ToastProvider>
    </BrowserRouter>
  </StrictMode>,
);
