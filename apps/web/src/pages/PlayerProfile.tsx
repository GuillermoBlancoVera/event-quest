import { useEffect, useState, type CSSProperties } from 'react';
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';
import qrCodeIcon from '../assets/qr-code.svg';
import type { PlayerProfile as PlayerProfileType, PublicProfile, RankingResponse, Stats } from '@event-quest/shared';
import { appUrl, assetsUrl } from '../lib/assets';
import { clearSession, useSession } from '../lib/session';
import { api } from '../lib/api';
import { RankingAffiliationIcon } from './Ranking';
import { PageLoader } from '../components/PageLoader';
import './PlayerProfile.css';

export function PlayerProfile() {
  const id = useSession()?.userId;
  const requestedId = useParams().id;
  // Without an id in the URL (or with the player's own) this is "my profile"; otherwise it is someone else's public card.
  const own = !requestedId || requestedId === id;
  const navigate = useNavigate();
  const [profile, setProfile] = useState<PlayerProfileType | PublicProfile>();
  const [ranking, setRanking] = useState<RankingResponse>();
  const [stats, setStats] = useState<Stats>();
  const [error, setError] = useState('');
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    if (!id) return;
    setProfile(undefined);
    setError('');
    setAvatarFailed(false);
    Promise.all([own ? api.getProfile() : api.getPlayerProfile(requestedId), api.getRanking(), api.getStats()])
      .then(([loadedProfile, loadedRanking, loadedStats]) => {
        setProfile(loadedProfile);
        setRanking(loadedRanking);
        setStats(loadedStats);
      })
      .catch(error => setError(error.message));
  }, [id, own, requestedId]);

  if (!id) return <Navigate to="/juego" replace />;
  if (error) return <>{!own && <button className="profile-back-link" onClick={() => navigate(-1)}>← Volver</button>}<section className="game-panel"><p>{error}</p></section></>;
  if (!profile) return <PageLoader label="Cargando perfil" />;

  const avatarUrl = assetsUrl(profile.avatarKey);
  const playerRanking = ranking?.entries.find(entry => entry.userId === profile.userId);
  // Only the owner receives the answer history; for anyone else the ranking already says how many challenges they tried.
  const attemptedChallenges = 'history' in profile
    ? new Set(profile.history.map(item => item.challengeId)).size + new Set((profile.communityScans ?? []).map(scan => scan.communityId)).size
    : playerRanking?.attempted ?? 0;
  const score = 'score' in profile ? profile.score : playerRanking?.score ?? '—';
  const progressStyle = { '--progress': `${stats?.challenges ? attemptedChallenges / stats.challenges * 100 : 0}%` } as CSSProperties;
  const qrValue = 'scanCode' in profile ? appUrl(`/juego/encuentro/${profile.scanCode ?? profile.userId}`) : '';

  const logout = () => { clearSession(); navigate('/'); };

  const affiliations = <div className="profile-affiliations">
    {playerRanking?.parentAffiliation && <RankingAffiliationIcon name={playerRanking.parentAffiliation.name} iconKey={playerRanking.parentAffiliation.avatarKey} to={`/juego/afiliacion/${playerRanking.parentAffiliation.affiliationId}`} />}
    {playerRanking?.parentAffiliation && playerRanking?.affiliation && <span className="profile-affiliation-separator" aria-hidden="true">/</span>}
    {playerRanking?.affiliation && <RankingAffiliationIcon name={playerRanking.affiliation.name} iconKey={playerRanking.affiliation.avatarKey} to={`/juego/afiliacion/${playerRanking.affiliation.affiliationId}`} />}
  </div>;
  const position = <><p className="game-kicker">POSICIÓN</p><div className="profile-ranking-value">{playerRanking ? `${playerRanking.rank}${playerRanking.gender === 'female' ? 'ª' : 'º'}` : '—'}</div></>;
  const progress = <><p className="game-kicker">PROGRESO DE RETOS</p><div className="profile-progress-circle" style={progressStyle}><span>{attemptedChallenges} / {stats?.challenges ?? '—'}</span></div></>;

  return <>
    {!own && <button className="profile-back-link" onClick={() => navigate(-1)}>← Volver</button>}
    <section className="game-panel profile-summary">
      {own && <button className="profile-qr-button" onClick={() => setShowQr(true)} aria-label="mostrar qr del perfil"><img src={qrCodeIcon} alt="" /></button>}
      <div className="profile-hero">
        <div className="avatar profile-main-avatar">{avatarUrl && !avatarFailed ? <img src={avatarUrl} alt={`Foto de ${profile.name}`} onError={() => setAvatarFailed(true)} /> : profile.name.slice(0, 1).toUpperCase()}</div>
        <h1 className="profile-name">{profile.name}</h1>
        {/* Rendered as text, never as HTML: whatever is stored cannot inject markup. */}
        {profile.description && <p className="profile-description">{profile.description}</p>}
        <div className="profile-summary-details">
          {own ? <Link className="profile-summary-column profile-summary-link" to="/juego/clasificacion">{position}</Link> : <div className="profile-summary-column">{position}</div>}
          <div className="profile-summary-column"><p className="game-kicker">COMUNIDAD/CABAÑA</p>{affiliations}</div>
          <div className="profile-summary-column"><p className="game-kicker">PUNTOS</p><div className="score">{score}</div></div>
          {own ? <Link className="profile-summary-column profile-summary-link" to="/juego/retos">{progress}</Link> : <div className="profile-summary-column">{progress}</div>}
        </div>
      </div>
    </section>
    {own && <button className="profile-logout" onClick={logout}>Cerrar sesión</button>}
    {own && showQr && <div className="profile-qr-modal" role="dialog" aria-modal="true" aria-label="qr del perfil"><div><button className="profile-qr-close" onClick={() => setShowQr(false)} aria-label="cerrar">×</button><p>qr de {profile.name}</p><QRCodeSVG value={qrValue} size={240} level="M" includeMargin /><button className="button" onClick={() => setShowQr(false)}>cerrar</button></div></div>}
  </>;
}
