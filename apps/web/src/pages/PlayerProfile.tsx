import { useEffect, useState, type CSSProperties } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import type { PlayerProfile as PlayerProfileType, RankingResponse, Stats } from '@event-quest/shared';
import { api } from '../lib/api';
import { RankingAffiliationIcon } from './Ranking';
import { PageLoader } from '../components/PageLoader';
import './PlayerProfile.css';

export function PlayerProfile() {
  const id = localStorage.getItem('event-quest-user');
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PlayerProfileType>();
  const [ranking, setRanking] = useState<RankingResponse>();
  const [stats, setStats] = useState<Stats>();
  const [error, setError] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getProfile(id), api.getRanking(), api.getStats()])
      .then(([loadedProfile, loadedRanking, loadedStats]) => {
        setProfile(loadedProfile);
        setRanking(loadedRanking);
        setStats(loadedStats);
      })
      .catch(error => setError(error.message));
  }, [id]);

  if (!id) return <Navigate to="/juego" replace />;
  if (error) return <section className="game-panel"><p>{error}</p></section>;
  if (!profile) return <PageLoader label="Cargando perfil" />;

  const avatarUrl = profile.avatarKey ? `https://event-quest-production-assets-372212891039.s3.eu-west-1.amazonaws.com/${profile.avatarKey}` : undefined;
  const playerRanking = ranking?.entries.find(entry => entry.userId === profile.userId);
  const attemptedChallenges = new Set(profile.history.map(item => item.challengeId)).size;
  const progressStyle = { '--progress': `${stats?.challenges ? attemptedChallenges / stats.challenges * 100 : 0}%` } as CSSProperties;

  const logout = () => { localStorage.removeItem('event-quest-user'); navigate('/'); };

  return <><section className="game-panel profile-summary"><div className="profile-hero"><div className="avatar profile-main-avatar">{avatarUrl && !avatarFailed ? <img src={avatarUrl} alt={`Foto de ${profile.name}`} onError={() => setAvatarFailed(true)} /> : profile.name.slice(0, 1).toUpperCase()}</div><h1 className="profile-name">{profile.name}</h1><div className="profile-summary-details"><Link className="profile-summary-column profile-summary-link" to="/juego/clasificacion"><p className="game-kicker">POSICIÓN</p><div className="profile-ranking-value">{playerRanking ? `${playerRanking.rank}${playerRanking.gender === 'female' ? 'ª' : 'º'}` : '—'}</div></Link><div className="profile-summary-column"><p className="game-kicker">COMUNIDAD</p><div className="profile-affiliations">{playerRanking?.parentAffiliation && <RankingAffiliationIcon name={playerRanking.parentAffiliation.name} iconKey={playerRanking.parentAffiliation.avatarKey} to={`/juego/afiliacion/${playerRanking.parentAffiliation.affiliationId}`} />}{playerRanking?.affiliation && <RankingAffiliationIcon name={playerRanking.affiliation.name} iconKey={playerRanking.affiliation.avatarKey} to={`/juego/afiliacion/${playerRanking.affiliation.affiliationId}`} />}</div></div><div className="profile-summary-column"><p className="game-kicker">PUNTOS</p><div className="score">{profile.score}</div></div><Link className="profile-summary-column profile-summary-link" to="/juego/retos"><p className="game-kicker">PROGRESO DE RETOS</p><div className="profile-progress-circle" style={progressStyle}><span>{attemptedChallenges} / {stats?.challenges ?? '—'}</span></div></Link></div></div></section><button className="profile-logout" onClick={logout}>Cerrar sesión</button></>;
}
