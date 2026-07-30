import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { PlayerProfile as PlayerProfileType } from '@event-quest/shared';
import { api } from '../lib/api';

export function PlayerProfile() {
  const id = localStorage.getItem('event-quest-user'); const [profile, setProfile] = useState<PlayerProfileType>(); const [error, setError] = useState('');
  useEffect(() => { if (id) api.getProfile(id).then(setProfile).catch(error => setError(error.message)); }, [id]);
  if (!id) return <Navigate to="/juego" replace />;
  if (error) return <section className="game-panel"><p>{error}</p></section>;
  if (!profile) return <section className="game-panel"><p>Preparando tu perfil…</p></section>;
  return <section className="game-panel"><div className="profile-hero"><div className="profile-id"><div className="avatar">{profile.name.slice(0, 1).toUpperCase()}</div><div><p className="game-kicker">JUGADOR</p><h1>{profile.name}</h1><p>{profile.team} · {profile.group}</p></div></div><div><p className="game-kicker">PUNTOS</p><div className="score">{profile.score}</div></div></div><div className="profile-grid"><article className="profile-card"><h2>Retos jugados</h2>{profile.history.length ? <ul className="challenge-history">{profile.history.map(item => <li key={item.challengeId}><span>{item.title}<small>{item.correct ? 'Acertado' : 'Fallado'}</small></span><strong>{item.correct ? `+${item.awardedPoints}` : '0'}</strong></li>)}</ul> : <p>Aún no has jugado retos. El primer QR te está esperando.</p>}</article><article className="profile-card"><h2>Tu partida</h2><p><strong>{profile.history.length}</strong> retos jugados</p><p><Link to="/juego/reto/1">Ir al reto activo →</Link></p><p><Link to="/juego/clasificacion">Ver clasificación →</Link></p></article></div></section>;
}
