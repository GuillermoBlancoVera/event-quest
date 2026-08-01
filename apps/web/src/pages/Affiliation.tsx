import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Affiliation as AffiliationType, RankingResponse, Stats } from '@event-quest/shared';
import { api } from '../lib/api';
import { Page } from '../components/Page';
import { RankingAffiliationIcon, RankingAvatar } from './Ranking';
import './Affiliation.css';

const assetsUrl = (key: string) => `https://event-quest-production-assets-372212891039.s3.eu-west-1.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;

export function Affiliation() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ranking, setRanking] = useState<RankingResponse>();
  const [stats, setStats] = useState<Stats>();
  const [error, setError] = useState('');
  useEffect(() => { Promise.all([api.getRanking(), api.getStats()]).then(([ranking, stats]) => { setRanking(ranking); setStats(stats); }).catch(error => setError(error.message)); }, []);
  const affiliation = useMemo<AffiliationType | undefined>(() => ranking?.entries.flatMap(entry => [entry.parentAffiliation, entry.affiliation]).find(item => item?.affiliationId === id), [id, ranking]);
  const participants = useMemo(() => ranking?.entries.filter(entry => entry.affiliation?.affiliationId === id || entry.parentAffiliation?.affiliationId === id) ?? [], [id, ranking]);
  const cabins = useMemo(() => {
    const affiliations = ranking?.entries.map(entry => entry.affiliation).filter((affiliation): affiliation is AffiliationType => Boolean(affiliation?.parentAffiliationId === id)) ?? [];
    return affiliations.filter((affiliation, index) => affiliations.findIndex(item => item.affiliationId === affiliation.affiliationId) === index);
  }, [id, ranking]);
  if (error) return <Page title="Comunidad"><p className="notice">{error}</p></Page>;
  if (!ranking) return <Page title="Comunidad"><p>Reuniendo a sus participantes…</p></Page>;
  if (!affiliation) return <Page title="Comunidad"><p className="notice">No hemos encontrado esta comunidad.</p><Link className="text-link" to="/juego/clasificacion">Volver a la clasificación</Link></Page>;
  const score = ranking.affiliationScores[affiliation.affiliationId] ?? 0;
  return <Page eyebrow={affiliation.name} top={<button className="affiliation-back-link" onClick={() => navigate(-1)}>← Volver</button>}><section className="affiliation-card">{affiliation.avatarKey && <img className="affiliation-avatar" src={assetsUrl(affiliation.avatarKey)} alt="" />}<div><p className="affiliation-story">{affiliation.story || 'Esta comunidad todavía está escribiendo su historia.'}</p><p className="affiliation-score">{score} puntos</p></div></section>{cabins.length > 0 && <section className="affiliation-cabins"><h2>Cabañas</h2><div>{cabins.map(cabin => <RankingAffiliationIcon key={cabin.affiliationId} name={cabin.name} iconKey={cabin.avatarKey} to={`/juego/afiliacion/${cabin.affiliationId}`} />)}</div></section>}<h2>{participants.length} {participants.length === 1 ? 'participante' : 'participantes'}</h2>{participants.length ? <ol className="affiliation-participants">{participants.map(entry => <li key={entry.userId}><div className="affiliation-participant-identity"><RankingAvatar entry={entry} /><div><span>{entry.name}</span><small>{entry.attempted}/{stats?.challenges ?? '—'} retos</small></div></div><div className="affiliation-participant-summary">{entry.affiliation?.parentAffiliationId && <RankingAffiliationIcon name={entry.affiliation.name} iconKey={entry.affiliation.avatarKey} to={`/juego/afiliacion/${entry.affiliation.affiliationId}`} />}<strong>{entry.score}</strong></div></li>)}</ol> : <p>Aún no hay participantes en esta comunidad.</p>}</Page>;
}
