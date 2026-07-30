import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export function GameAccess() {
  const existing = localStorage.getItem('event-quest-user');
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [name, setName] = useState(''); const [password, setPassword] = useState(''); const [team, setTeam] = useState(''); const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false); const navigate = useNavigate();
  if (existing) return <Navigate to="/juego/perfil" replace />;
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); setMessage(''); try { const user = mode === 'login' ? await api.login({ name, password }) : await api.registerUser({ name, password, team }); localStorage.setItem('event-quest-user', user.userId); navigate('/juego/perfil'); } catch (error) { setMessage(error instanceof Error ? error.message : 'No se pudo completar el acceso.'); } finally { setBusy(false); } };
  return <main className="game-app"><section className="game-main"><div className="game-panel"><p className="game-kicker">LA BODA DE SARA &amp; GUILLE</p><h1>Tu aventura empieza aquí.</h1><p>Identifícate para guardar tus puntos y volver a tu perfil cuando quieras.</p><div className="auth-tabs"><button className={mode === 'login' ? 'active' : ''} onClick={() => setMode('login')}>Entrar</button><button className={mode === 'register' ? 'active' : ''} onClick={() => setMode('register')}>Crear jugador</button></div><form className="auth-form" onSubmit={submit}><label>Nombre<input required value={name} onChange={e => setName(e.target.value)} /></label><label>Contraseña<input required type="password" value={password} onChange={e => setPassword(e.target.value)} /></label>{mode === 'register' && <label>Equipo <input value={team} placeholder="Opcional" onChange={e => setTeam(e.target.value)} /></label>}<button className="game-button" disabled={busy}>{busy ? 'Comprobando…' : mode === 'login' ? 'Entrar a mi perfil' : 'Crear mi perfil'}</button></form>{message && <p className="notice">{message}</p>}</div></section></main>;
}
