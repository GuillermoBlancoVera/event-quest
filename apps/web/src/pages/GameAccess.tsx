import { FormEvent, useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';

export function GameAccess() {
  const existing = localStorage.getItem('event-quest-user');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  if (existing) return <Navigate to="/juego/perfil" replace />;

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const user = await api.login({ name, password });
      localStorage.setItem('event-quest-user', user.userId);
      navigate('/juego/perfil');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se ha podido iniciar sesión.');
    } finally {
      setBusy(false);
    }
  };

  return <main className="game-app"><section className="game-main"><div className="game-panel"><p className="game-kicker">LA BODA DE SARA &amp; GUILLE</p><h1>Tu aventura empieza aquí.</h1><p>Inicia sesión para guardar tus puntos y volver a tu perfil cuando quieras.</p><form className="auth-form" onSubmit={submit}><label>Nombre<input required value={name} onChange={event => setName(event.target.value)} /></label><label>Contraseña<input required type="password" value={password} onChange={event => setPassword(event.target.value)} /></label><button className="game-button" disabled={busy}>{busy ? 'Comprobando…' : 'Entrar a mi perfil'}</button></form>{message && <p className="notice">{message}</p>}</div></section></main>;
}
