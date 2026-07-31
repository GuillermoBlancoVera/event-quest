import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import type { Affiliation as AffiliationType, RankingResponse } from '@event-quest/shared';
import { api } from '../lib/api';
import { Page } from '../components/Page';
import { RankingAvatar } from './Ranking';
import './Affiliation.css';

const assetsUrl = (key: string) => `https://event-quest-production-assets-372212891039.s3.eu-west-1.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;

export function Affiliation() {
  const { id } = useParams();
  const [ranking, setRanking] = useState<RankingResponse>();
  const [error, setError] = useState('');
  useEffect(() => { api.getRanking().then(setRanking).catch(error => setError(error.message)); }, []);
  const affiliation = useMemo<AffiliationType | undefined>(() => ranking?.entries.flatMap(entry => [entry.parentAffiliation, entry.affiliation]).find(item => item?.affiliationId === id), [id, ranking]);
  const participants = useMemo(() => ranking?.entries.filter(entry => (entry.parentAffiliation ?? entry.affiliation)?.affiliationId === id) ?? [], [id, ranking]);
  if (error) return <Page title="Comunidad"><p className="notice">{error}</p></Page>;
  if (!ranking) return <Page title="Comunidad"><p>Reuniendo a sus participantes…</p></Page>;
  if (!affiliation) return <Page title="Comunidad"><p className="notice">No hemos encontrado esta comunidad.</p><Link className="text-link" to="/juego/clasificacion">Volver a la clasificación</Link></Page>;
  const score = ranking.affiliationScores[affiliation.affiliationId] ?? 0;
  return <Page eyebrow="Comunidad" title={affiliation.name}><section className="affiliation-card">{affiliation.avatarKey && <img className="affiliation-avatar" src={assetsUrl(affiliation.avatarKey)} alt="" />}<div><p className="game-kicker">PARTICIPANTES · {participants.length}</p><p className="affiliation-story">{affiliation.story || 'Esta comunidad todavía está escribiendo su historia.'}</p><p className="affiliation-score">{score} puntos</p></div></section><h2>Participantes</h2>{participants.length ? <ol className="affiliation-participants">{participants.map(entry => <li key={entry.userId}><RankingAvatar entry={entry} /><span>{entry.name}</span><strong>{entry.score}</strong></li>)}</ol> : <p>Aún no hay participantes en esta comunidad.</p>}<Link className="text-link" to="/juego/clasificacion">Volver a la clasificación</Link></Page>;
}
