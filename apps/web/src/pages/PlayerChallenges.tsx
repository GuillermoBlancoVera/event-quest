import { useEffect, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { ChallengeListItem, PlayerProfile, PorLaCaraChallengeListItem, Stats } from '@event-quest/shared';
import { Page } from '../components/Page';
import { PageLoader } from '../components/PageLoader';
import { api } from '../lib/api';
import './PlayerProfile.css';

export function PlayerChallenges() {
  const id = localStorage.getItem('event-quest-user');
  const [profile, setProfile] = useState<PlayerProfile>();
  const [challenges, setChallenges] = useState<ChallengeListItem[]>();
  const [porLaCaraChallenges, setPorLaCaraChallenges] = useState<PorLaCaraChallengeListItem[]>();
  const [stats, setStats] = useState<Stats>();
  const [error, setError] = useState('');
  const [lockedChallenge, setLockedChallenge] = useState<ChallengeListItem>();

  useEffect(() => {
    if (!id) return;
    Promise.all([api.getProfile(id), api.getChallenges(), api.getPorLaCaraChallenges(), api.getStats()]).then(([profile, challenges, porLaCaraChallenges, stats]) => { setProfile(profile); setChallenges(challenges); setPorLaCaraChallenges(porLaCaraChallenges); setStats(stats); }).catch(error => setError(error.message));
  }, [id]);

  if (!id) return <Navigate to="/juego" replace />;
  if (error) return <Page top={<Link className="game-back-link" to="/juego/perfil">← Mi perfil</Link>}><p className="notice">{error}</p></Page>;
  if (!profile || !challenges || !porLaCaraChallenges || !stats) return <PageLoader label="Cargando retos" />;

  const attempts = new Map(profile.history.map(item => [item.challengeId, item]));
  const scannedCommunities = new Set((profile.communityScans ?? []).map(scan => scan.communityId)).size;
  const scannedCommunityPoints = (profile.communityScans ?? []).reduce((total, scan) => total + scan.awardedPoints, 0);
  const porLaCaraAttempts = new Map((profile.porLaCaraAttempts ?? []).map(attempt => [attempt.porLaCaraId, attempt]));
  const discoveredPorLaCaraChallenges = porLaCaraChallenges.filter(challenge => porLaCaraAttempts.has(challenge.porLaCaraId));
  const completedChallenges = new Set(profile.history.map(item => item.challengeId)).size + new Set((profile.communityScans ?? []).map(scan => scan.communityId)).size;
  const progress = stats.challenges ? Math.min(completedChallenges / stats.challenges * 100, 100) : 0;

  return <><Page eyebrow="Retos" top={<Link className="game-back-link" to="/juego/perfil">← Mi perfil</Link>}><section className="challenge-list-progress"><div><span>progreso de retos</span><strong>{completedChallenges}/{stats.challenges}</strong></div><i><b style={{ width: `${progress}%` }} /></i></section><ul className="challenge-history profile-list"><li className="community-challenge-card"><Link className="profile-challenge-link" to="/juego/comunidades"><span>conoce otras comunidades<small>{scannedCommunities}/5 comunidades escaneadas</small><i><b style={{ width: `${scannedCommunities / 5 * 100}%` }} /></i></span><strong>{scannedCommunityPoints > 0 ? `+${scannedCommunityPoints}` : scannedCommunityPoints}</strong></Link></li>{challenges.map(challenge => { const attempt = attempts.get(challenge.challengeId); if (!attempt) return <li className="profile-challenge-locked" key={challenge.challengeId}><button onClick={() => setLockedChallenge(challenge)}><span>{challenge.title}</span><span className="challenge-lock" aria-label="Reto bloqueado">🔒</span></button></li>; const points = attempt.awardedPoints; const tone = points > 0 ? 'positive' : points < 0 ? 'negative' : 'zero'; return <li key={challenge.challengeId}><Link className="profile-challenge-link" state={{ fromChallenges: true }} to={`/juego/reto/${challenge.challengeId}`}><span>{challenge.title}</span><strong className={`challenge-points ${tone}`}>{points > 0 ? `+${points}` : points}</strong></Link></li>; })}{discoveredPorLaCaraChallenges.map(challenge => { const attempt = porLaCaraAttempts.get(challenge.porLaCaraId)!; return <li className="por-la-cara-card" key={challenge.porLaCaraId}><Link className="profile-challenge-link" state={{ fromChallenges: true }} to={`/juego/por-la-cara/${challenge.porLaCaraId}`}><span>por la cara · {challenge.title}</span><strong className={attempt.awardedPoints < 0 ? 'challenge-points negative' : 'challenge-points positive'}>{attempt.awardedPoints > 0 ? `+${attempt.awardedPoints}` : attempt.awardedPoints}</strong></Link></li>; })}</ul></Page>{lockedChallenge && <div className="locked-challenge-modal" role="dialog" aria-modal="true" aria-label="reto no encontrado"><div><button className="locked-challenge-close" onClick={() => setLockedChallenge(undefined)} aria-label="cerrar">×</button><p>aún no has encontrado el qr de este reto.</p><button className="button" onClick={() => setLockedChallenge(undefined)}>cerrar</button></div></div>}</>;
}
