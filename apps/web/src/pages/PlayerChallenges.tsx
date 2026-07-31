import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { PlayerProfile } from '@event-quest/shared';
import { Page } from '../components/Page';
import { api } from '../lib/api';
import './PlayerProfile.css';

export function PlayerChallenges() {
  const id = localStorage.getItem('event-quest-user');
  const [profile, setProfile] = useState<PlayerProfile>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    api.getProfile(id).then(setProfile).catch(error => setError(error.message));
  }, [id]);

  if (!id) return <Navigate to="/juego" replace />;
  if (error) return <Page title="Retos"><p className="notice">{error}</p></Page>;
  if (!profile) return <Page title="Retos"><p>Preparando tus retos…</p></Page>;

  return <Page eyebrow="Tu aventura" title="Retos">{profile.history.length ? <ul className="challenge-history profile-list">{profile.history.map(item => { const points = item.awardedPoints; const tone = points > 0 ? 'positive' : points < 0 ? 'negative' : 'zero'; return <li key={item.challengeId}><Link className="profile-challenge-link" to={`/juego/reto/${item.challengeId}`}><span>{item.title}</span><strong className={`challenge-points ${tone}`}>{points > 0 ? `+${points}` : points}</strong></Link></li>; })}</ul> : <p>Aún no has jugado retos. El primer QR te está esperando.</p>}</Page>;
}
