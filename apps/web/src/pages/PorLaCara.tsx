import { useEffect, useRef, useState } from 'react';
import { Link, Navigate, useLocation, useParams } from 'react-router-dom';
import type { PorLaCaraAttempt, PorLaCaraChallenge } from '@event-quest/shared';
import { Page } from '../components/Page';
import { PageLoader } from '../components/PageLoader';
import { api } from '../lib/api';
import './PorLaCara.css';

export function PorLaCara() {
  const { id } = useParams();
  const userId = localStorage.getItem('event-quest-user');
  const location = useLocation();
  const [challenge, setChallenge] = useState<PorLaCaraChallenge>();
  const [attempt, setAttempt] = useState<PorLaCaraAttempt>();
  const [message, setMessage] = useState('');
  const requestedId = useRef<string | undefined>(undefined);
  const fromChallenges = Boolean(location.state?.fromChallenges);

  useEffect(() => {
    if (!id || !userId) return;
    Promise.all([api.getPorLaCaraChallenge(id), api.getProfile(userId)])
      .then(async ([loadedChallenge, profile]) => {
        setChallenge(loadedChallenge);
        const recordedAttempt = profile.porLaCaraAttempts?.find(item => item.porLaCaraId === id);
        if (recordedAttempt) {
          setAttempt(recordedAttempt);
          return;
        }
        if (requestedId.current === id) return;
        requestedId.current = id;
        const result = await api.claimPorLaCara(id, userId);
        setAttempt(result.attempt);
      })
      .catch(error => setMessage(error instanceof Error ? error.message : 'no se ha podido cargar el reto.'));
  }, [id, userId]);

  if (!userId) return <Navigate to="/juego" replace state={{ returnTo: `${location.pathname}${location.search}` }} />;
  if (!challenge && !message) return <PageLoader label="cargando por la cara" />;
  if (!challenge) return <Page eyebrow="por la cara" top={fromChallenges ? <Link className="game-back-link" to="/juego/retos">← retos</Link> : undefined}><p className="notice">{message}</p></Page>;

  const points = attempt?.awardedPoints ?? challenge.points;
  const pointsClass = points < 0 ? 'negative' : 'positive';

  return <Page eyebrow={`por la cara · ${challenge.title}`} top={fromChallenges ? <Link className="game-back-link" to="/juego/retos">← retos</Link> : undefined}><section className="por-la-cara-detail"><p>{challenge.description}</p><strong className={pointsClass}>{points > 0 ? `+${points}` : points} puntos</strong>{message && <p className="notice">{message}</p>}{attempt && !fromChallenges && <Link className="button" to="/juego/perfil">ir a mi perfil</Link>}</section></Page>;
}
