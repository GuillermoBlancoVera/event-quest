import { Link, Outlet, useNavigate } from 'react-router-dom';
import './GameLayout.css';

export function GameLayout() {
  const navigate = useNavigate();
  const logout = () => { localStorage.removeItem('event-quest-user'); navigate('/juego'); };
  return <div className="game-app"><header className="game-header"><Link to="/juego/perfil" className="game-brand"><span aria-hidden="true">🌿</span>Boda Sara &amp; Guille<span aria-hidden="true">🌿</span></Link><nav><Link to="/juego/perfil">Mi perfil</Link><Link to="/juego/clasificacion">Clasificación</Link><button onClick={logout}>Salir</button></nav></header><main className="game-main"><Outlet /></main></div>;
}
