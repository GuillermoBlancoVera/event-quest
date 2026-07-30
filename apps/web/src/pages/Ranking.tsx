import { useEffect, useState } from 'react';
import type { RankingEntry, RankingResponse, RankingScope } from '@event-quest/shared';
import { api } from '../lib/api';
import { Page } from '../components/Page';

const labels: Record<RankingScope, string> = { global: 'General', team: 'Equipos', group: 'Grupos' };

export function RankingAvatar({ entry }: { entry: RankingEntry }) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = entry.avatarKey ? `https://event-quest-production-assets-372212891039.s3.eu-west-1.amazonaws.com/${entry.avatarKey}` : undefined;
  return <div className="ranking-avatar">{avatarUrl && !failed ? <img src={avatarUrl} alt="" onError={() => setFailed(true)} /> : entry.name.slice(0, 1).toUpperCase()}</div>;
}

export function Ranking() {
  const [data, setData] = useState<RankingResponse>();
  const [scope, setScope] = useState<RankingScope>('global');
  const [error, setError] = useState('');
  useEffect(() => { const load = () => api.getRanking(scope).then(setData).catch(error => setError(error.message)); load(); const id = setInterval(load, 10000); return () => clearInterval(id); }, [scope]);
  return <Page eyebrow="Clasificación en directo" title="La aventura continúa"><div className="tabs">{(['global', 'team', 'group'] as RankingScope[]).map(item => <button className={item === scope ? 'active' : ''} onClick={() => setScope(item)} key={item}>{labels[item]}</button>)}</div>{error ? <p className="notice">{error}</p> : !data ? <p>Reuniendo puntuaciones…</p> : <ol className="ranking">{data.entries.map(entry => <li key={entry.userId}><b>{entry.rank}</b><RankingAvatar entry={entry} /><span>{entry.name}<small>{entry.group} · {entry.team}</small></span><strong>{entry.score}</strong></li>)}</ol>}{data?.frozen && <p className="notice">La clasificación se ha congelado con cariño.</p>}</Page>;
}
