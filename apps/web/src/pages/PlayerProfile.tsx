import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { PlayerProfile as PlayerProfileType, RankingResponse } from '@event-quest/shared';
import { api } from '../lib/api';
import { RankingAvatar } from './Ranking';
import './PlayerProfile.css';

export function PlayerProfile() {
  const id = localStorage.getItem('event-quest-user');
  const [profile, setProfile] = useState<PlayerProfileType>();
  const [ranking, setRanking] = useState<RankingResponse>();
  const [activeTab, setActiveTab] = useState<'challenges' | 'ranking'>('challenges');
  const [error, setError] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (id) api.getProfile(id).then(setProfile).catch(error => setError(error.message));
  }, [id]);

  useEffect(() => {
    if (activeTab !== 'ranking') return;
    const load = () => api.getRanking().then(setRanking).catch(error => setError(error.message));
    load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [activeTab]);

  if (!id) return <Navigate to="/juego" replace />;
  if (error) return <section className="game-panel"><p>{error}</p></section>;
  if (!profile) return <section className="game-panel"><p>Preparando tu perfil…</p></section>;

  const avatarUrl = profile.avatarKey ? `https://event-quest-production-assets-372212891039.s3.eu-west-1.amazonaws.com/${profile.avatarKey}` : undefined;

  return <section className="game-panel"><div className="profile-hero"><div className="profile-id"><div className="avatar">{avatarUrl && !avatarFailed ? <img src={avatarUrl} alt={`Foto de ${profile.name}`} onError={() => setAvatarFailed(true)} /> : profile.name.slice(0, 1).toUpperCase()}</div><div><h1>{profile.name}</h1><p>{profile.group} · {profile.team}</p></div></div><div><p className="game-kicker">PUNTOS</p><div className="score">{profile.score}</div></div></div><div className="tabs profile-tabs"><button className={activeTab === 'challenges' ? 'active' : ''} onClick={() => setActiveTab('challenges')}>Retos</button><button className={activeTab === 'ranking' ? 'active' : ''} onClick={() => setActiveTab('ranking')}>Clasificación</button></div>{activeTab === 'challenges' ? profile.history.length ? <ul className="challenge-history profile-list">{profile.history.map(item => { const points = item.awardedPoints; const tone = points > 0 ? 'positive' : points < 0 ? 'negative' : 'zero'; return <li key={item.challengeId}><Link className="profile-challenge-link" to={`/juego/reto/${item.challengeId}`}><span>{item.title}</span><strong className={`challenge-points ${tone}`}>{points > 0 ? `+${points}` : points}</strong></Link></li>; })}</ul> : <p>Aún no has jugado retos. El primer QR te está esperando.</p> : !ranking ? <p>Actualizando clasificación…</p> : <ol className="ranking profile-ranking">{ranking.entries.map(entry => <li className="profile-ranking-item" key={entry.userId}><b>{entry.rank}</b><RankingAvatar entry={entry} /><span>{entry.name}<small>{entry.group} · {entry.team}</small></span><strong>{entry.score}</strong></li>)}</ol>}</section>;
}
