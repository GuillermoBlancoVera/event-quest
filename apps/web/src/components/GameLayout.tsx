import { Link, Outlet } from 'react-router-dom';
import { LeafSprig } from './Botanicals';
import './GameLayout.css';

export function GameLayout() {
  return <div className="game-app"><header className="game-header"><Link to="/juego/perfil" className="game-brand"><LeafSprig />la boda de Sara y Guille<LeafSprig flip /></Link></header><main className="game-main"><Outlet /></main></div>;
}
