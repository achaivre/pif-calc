import { useAppState } from '../../context/AppContext';

export default function Header() {
  const { state, dispatch } = useAppState();

  return (
    <header className="app-header">
      <div className="header-brand">
        <span className="header-logo">⚔️</span>
        <span className="header-title">PIF Damage Calc</span>
        <span className="header-subtitle">Hard Mode</span>
      </div>
      <nav className="header-nav">
        <button
          className={`nav-btn ${state.page === 'calc' ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'SET_PAGE', page: 'calc' })}
        >
          Calculator
        </button>
        <button
          className={`nav-btn ${state.page === 'box' ? 'active' : ''}`}
          onClick={() => dispatch({ type: 'SET_PAGE', page: 'box' })}
        >
          My Box
        </button>
      </nav>
    </header>
  );
}
