import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import type { CommunityScanResponse } from '@event-quest/shared';
import { Page } from '../components/Page';
import { PageLoader } from '../components/PageLoader';
import { api } from '../lib/api';
import './CommunityChallenge.css';

const assetsUrl = (key: string) => `https://event-quest-production-assets-372212891039.s3.eu-west-1.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;

export function CommunityScan() {
  const { id } = useParams();
  const userId = localStorage.getItem('event-quest-user');
  const location = useLocation();
  const [result, setResult] = useState<CommunityScanResponse>();
  const [error, setError] = useState('');
  const requestedPlayerId = useRef<string>();

  useEffect(() => {
    if (!userId || !id || requestedPlayerId.current === id) return;
    requestedPlayerId.current = id;
    setResult(undefined);
    setError('');
    api.scanCommunity(userId, id).then(setResult).catch(error => setError(error.message));
  }, [id, userId]);

  if (!userId) return <Navigate to="/juego" replace state={{ returnTo: `${location.pathname}${location.search}` }} />;
  if (!result && !error) return <PageLoader label="registrando encuentro" />;
  if (error) return <Page eyebrow="encuentro" top={<Link className="game-back-link" to="/juego/comunidades">← retos</Link>}><p className="notice">{error}</p><Link className="button" to="/juego/perfil">ir a mi perfil</Link></Page>;
  if (!result) return null;
  const avatarUrl = result.player.avatarKey ? assetsUrl(result.player.avatarKey) : undefined;
  return <Page eyebrow={result.alreadyScanned ? 'comunidad encontrada' : 'encuentro registrado'} top={<Link className="game-back-link" to="/juego/comunidades">← retos</Link>}><section className="community-scan-result"><div className="community-scan-player">{avatarUrl ? <img src={avatarUrl} alt="" /> : result.player.name.slice(0, 1)}</div><p>{result.alreadyScanned ? `ya habías encontrado a alguien de ${result.community.name}.` : `has encontrado a ${result.player.name}, de ${result.community.name}.`}</p>{result.alreadyScanned ? <strong>comunidad ya registrada</strong> : <strong>+{result.awardedPoints} puntos</strong>}<small>{result.progress}/5 comunidades escaneadas</small></section><Link className="button" to="/juego/perfil">ir a mi perfil</Link></Page>;
}
