import { useEffect, useMemo, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import type { Affiliation, PlayerProfile, RankingResponse } from '@event-quest/shared';
import { Page } from '../components/Page';
import { PageLoader } from '../components/PageLoader';
import { api } from '../lib/api';
import { RankingAffiliationIcon } from './Ranking';
import './CommunityChallenge.css';

const target = 5;

export function CommunityChallenge() {
  const userId = localStorage.getItem('event-quest-user');
  const [profile, setProfile] = useState<PlayerProfile>();
  const [ranking, setRanking] = useState<RankingResponse>();
  const [error, setError] = useState('');

  useEffect(() => {
    if (!userId) return;
    Promise.all([api.getProfile(userId), api.getRanking()]).then(([profile, ranking]) => { setProfile(profile); setRanking(ranking); }).catch(error => setError(error.message));
  }, [userId]);

  const communities = useMemo(() => {
    const items = ranking?.entries.flatMap(entry => [entry.parentAffiliation ?? entry.affiliation]).filter((item): item is Affiliation => Boolean(item)) ?? [];
    return items.filter((item, index) => items.findIndex(other => other.affiliationId === item.affiliationId) === index);
  }, [ranking]);

  if (!userId) return <Navigate to="/juego" replace state={{ returnTo: '/juego/comunidades' }} />;
  if (error) return <Page top={<Link className="game-back-link" to="/juego/retos">← retos</Link>}><p className="notice">{error}</p></Page>;
  if (!profile || !ranking) return <PageLoader label="cargando reto de comunidades" />;

  const scans = profile.communityScans ?? [];
  const communityById = new Map(communities.map(community => [community.affiliationId, community]));
  return <Page eyebrow="conoce otras comunidades" top={<Link className="game-back-link" to="/juego/retos">← retos</Link>}><p className="lead">escanea el qr de jugadores de cinco comunidades distintas a la tuya. cada encuentro suma 50 puntos.</p><p className="community-challenge-progress">{scans.length}/{target} comunidades escaneadas</p><section className="community-scan-list"><h2>comunidades encontradas</h2>{scans.length ? scans.map(scan => { const community = communityById.get(scan.communityId); return <article key={scan.communityId}>{community ? <RankingAffiliationIcon name={community.name} iconKey={community.avatarKey} to={`/juego/afiliacion/${community.affiliationId}`} /> : <span className="community-scan-placeholder">?</span>}<div><strong>{community?.name ?? 'comunidad encontrada'}</strong><small>+{scan.awardedPoints} puntos</small></div></article>; }) : <p>aún no has escaneado ninguna comunidad.</p>}</section><section className="community-scan-list community-scan-missing"><h2>por encontrar</h2>{Array.from({ length: Math.max(0, target - scans.length) }, (_, index) => <article key={index}><span className="community-scan-placeholder">?</span><div><strong>comunidad por descubrir</strong><small>escanea otro qr</small></div></article>)}</section></Page>;
}
