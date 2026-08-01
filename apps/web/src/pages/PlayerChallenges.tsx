import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { ChallengeListItem, PlayerProfile } from '@event-quest/shared';
import { Page } from '../components/Page';
import { api } from '../lib/api';
import './PlayerProfile.css';

export function PlayerChallenges() {
  const id = localStorage.getItem('event-quest-user');
  const [profile, setProfile] = useState<PlayerProfile>();
  const [challenges, setChallenges] = useState<ChallengeListItem[]>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getProfile(id), api.getChallenges()]).then(([profile, challenges]) => { setProfile(profile); setChallenges(challenges); }).catch(error => setError(error.message));
  }, [id]);

  if (!id) return <Navigate to="/juego" replace />;
  if (error) return <Page top={<Link className="game-back-link" to="/juego/perfil">← Mi perfil</Link>}><p className="notice">{error}</p></Page>;
  if (!profile || !challenges) return <Page top={<Link className="game-back-link" to="/juego/perfil">← Mi perfil</Link>}><p>Preparando tus retos…</p></Page>;

  const attempts = new Map(profile.history.map(item => [item.challengeId, item]));

  return <Page eyebrow="Retos" top={<Link className="game-back-link" to="/juego/perfil">← Mi perfil</Link>}><ul className="challenge-history profile-list">{challenges.map(challenge => { const attempt = attempts.get(challenge.challengeId); if (!attempt) return <li className="profile-challenge-locked" key={challenge.challengeId}><span>{challenge.title}</span><span className="challenge-lock" aria-label="Reto bloqueado">🔒</span></li>; const points = attempt.awardedPoints; const tone = points > 0 ? 'positive' : points < 0 ? 'negative' : 'zero'; return <li key={challenge.challengeId}><Link className="profile-challenge-link" state={{ fromChallenges: true }} to={`/juego/reto/${challenge.challengeId}`}><span>{challenge.title}</span><strong className={`challenge-points ${tone}`}>{points > 0 ? `+${points}` : points}</strong></Link></li>; })}</ul></Page>;
}
