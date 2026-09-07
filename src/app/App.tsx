// ---------------------------------------------------------------------------
// App root — waits for config to load, then shows the setup wizard (first run)
// or the main shell.
// ---------------------------------------------------------------------------
import { useEffect } from 'react';
import { useAppStore } from '../store/appStore';
import { ToastHost } from '../components/ui';
import { SetupWizard } from './pages/setup/SetupWizard';
import { Shell } from './Shell';
import { LoadingCenter } from '../components/ui';

export function App() {
  const ready = useAppStore((s) => s.ready);
  const setupComplete = useAppStore((s) => s.setupComplete);
  const init = useAppStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  if (!ready) return <LoadingCenter label="Opening Order Label Manager…" />;

  return (
    <>
      {setupComplete ? <Shell /> : <SetupWizard />}
      <ToastHost />
    </>
  );
}
