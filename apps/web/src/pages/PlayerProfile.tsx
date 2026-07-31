import { useEffect, useState, type CSSProperties } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { PlayerProfile as PlayerProfileType, RankingResponse, Stats } from '@event-quest/shared';
import { api } from '../lib/api';
import { RankingAffiliationIcon, RankingAffiliationIcons, RankingAvatar } from './Ranking';
import './PlayerProfile.css';

export function PlayerProfile() {
  const id = localStorage.getItem('event-quest-user');
  const [profile, setProfile] = useState<PlayerProfileType>();
  const [ranking, setRanking] = useState<RankingResponse>();
  const [stats, setStats] = useState<Stats>();
  const [activeTab, setActiveTab] = useState<'challenges' | 'ranking'>('challenges');
  const [error, setError] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getProfile(id), api.getRanking(), api.getStats()]).then(([profile, ranking, stats]) => { setProfile(profile); setRanking(ranking); setStats(stats); }).catch(error => setError(error.message));
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
  const playerRanking = ranking?.entries.find(entry => entry.userId === profile.userId);

  const attemptedChallenges = new Set(profile.history.map(item => item.challengeId)).size;

  return <><section className="game-panel profile-summary"><div className="profile-hero"><div className="avatar profile-main-avatar">{avatarUrl && !avatarFailed ? <img src={avatarUrl} alt={`Foto de ${profile.name}`} onError={() => setAvatarFailed(true)} /> : profile.name.slice(0, 1).toUpperCase()}</div><h1 className="profile-name">{profile.name}</h1><div className="profile-summary-details"><div className="profile-summary-column"><p className="game-kicker">PUNTOS</p><div className="score">{profile.score}</div></div><div className="profile-summary-column"><p className="game-kicker">COMUNIDAD</p><div className="profile-affiliations">{playerRanking?.parentAffiliation && <RankingAffiliationIcon name={playerRanking.parentAffiliation.name} iconKey={playerRanking.parentAffiliation.avatarKey} to={`/juego/afiliacion/${playerRanking.parentAffiliation.affiliationId}`} />}{playerRanking?.affiliation && <RankingAffiliationIcon name={playerRanking.affiliation.name} iconKey={playerRanking.affiliation.avatarKey} to={`/juego/afiliacion/${playerRanking.affiliation.affiliationId}`} />}</div></div><div className="profile-summary-column"><p className="game-kicker">POSICIÓN</p><div className="profile-ranking-value">{playerRanking ? `${playerRanking.rank}º` : '—'}</div></div><div className="profile-summary-column"><p className="game-kicker">PROGRESO DE RETOS</p><div className="profile-progress-circle" style={{ '--progress': `${stats?.challenges ? attemptedChallenges / stats.challenges * 100 : 0}%` } as CSSProperties}><span>{attemptedChallenges} / {stats?.challenges ?? '—'}</span></div></div></div></div></section><section className="profile-content"><div className="tabs profile-tabs"><button className={activeTab === 'challenges' ? 'active' : ''} onClick={() => setActiveTab('challenges')}>Retos</button><button className={activeTab === 'ranking' ? 'active' : ''} onClick={() => setActiveTab('ranking')}>Clasificación</button></div>{activeTab === 'challenges' ? profile.history.length ? <ul className="challenge-history profile-list">{profile.history.map(item => { const points = item.awardedPoints; const tone = points > 0 ? 'positive' : points < 0 ? 'negative' : 'zero'; return <li key={item.challengeId}><Link className="profile-challenge-link" to={`/juego/reto/${item.challengeId}`}><span>{item.title}</span><strong className={`challenge-points ${tone}`}>{points > 0 ? `+${points}` : points}</strong></Link></li>; })}</ul> : <p>Aún no has jugado retos. El primer QR te está esperando.</p> : !ranking ? <p>Actualizando clasificación…</p> : <ol className="ranking profile-ranking">{ranking.entries.map(entry => <li className="profile-ranking-item" key={entry.userId}><b className="ranking-position">{entry.rank}</b><RankingAvatar entry={entry} /><span>{entry.name}</span><RankingAffiliationIcons entry={entry} /><strong>{entry.score}</strong></li>)}</ol>}</section></>;
}
