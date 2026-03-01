import { useEffect, useState } from 'react';
import { AppProvider, useAppState } from './context/AppContext';
import Header from './components/layout/Header';
import CalcPage from './components/calc/CalcPage';
import BoxPage from './components/box/BoxPage';
import { preloadAllData } from './data/loaders';

function AppInner() {
  const { state } = useAppState();

  return (
    <div className="app-root">
      <Header />
      <main className="app-main">
        {state.page === 'calc' ? <CalcPage /> : <BoxPage />}
      </main>
    </div>
  );
}

export default function App() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    preloadAllData()
      .then(() => setReady(true))
      .catch(e => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div className="splash-screen">
        <div className="splash-error">
          <h2>Failed to load game data</h2>
          <p>{error}</p>
          <p>Make sure the JSON files are in <code>public/data/</code>.</p>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="splash-screen">
        <div className="splash-content">
          <div className="splash-logo">&#x2694;</div>
          <h1 className="splash-title">PIF Damage Calc</h1>
          <p className="splash-sub">Loading game data&hellip;</p>
          <div className="splash-spinner" />
        </div>
      </div>
    );
  }

  return (
    <AppProvider>
      <AppInner />
    </AppProvider>
  );
}
