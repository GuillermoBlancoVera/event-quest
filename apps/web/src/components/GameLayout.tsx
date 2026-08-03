import { Link, Outlet } from 'react-router-dom';
import './GameLayout.css';

export function GameLayout() {
  return <div className="game-app"><header className="game-header"><Link to="/juego/perfil" className="game-brand"><span aria-hidden="true">🌿</span>la boda de Sara y Guille<span aria-hidden="true">🌿</span></Link></header><main className="game-main"><Outlet /></main></div>;
}
