import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { RankingEntry, RankingResponse, RankingScope } from '@event-quest/shared';
import { api } from '../lib/api';
import { Page } from '../components/Page';

const labels: Record<RankingScope, string> = { global: 'General', team: 'Equipos', group: 'Grupos' };
const assetsUrl = (key: string) => `https://event-quest-production-assets-372212891039.s3.eu-west-1.amazonaws.com/${key.split('/').map(encodeURIComponent).join('/')}`;

export function RankingAvatar({ entry }: { entry: RankingEntry }) {
  const [failed, setFailed] = useState(false);
  const avatarUrl = entry.avatarKey ? assetsUrl(entry.avatarKey) : undefined;
  return <div className="ranking-avatar">{avatarUrl && !failed ? <img src={avatarUrl} alt="" onError={() => setFailed(true)} /> : entry.name.slice(0, 1).toUpperCase()}</div>;
}

export function RankingAffiliationIcon({ name, iconKey, to }: { name: string; iconKey?: string; to?: string }) {
  const [failed, setFailed] = useState(false);
  const iconUrl = iconKey ? assetsUrl(iconKey) : undefined;
  const content = iconUrl && !failed ? <img src={iconUrl} alt="" onError={() => setFailed(true)} /> : <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 19 6v5.2c0 4.6-3 7.9-7 9.8-4-1.9-7-5.2-7-9.8V6l7-3Z" /><path d="m8.5 12 2.2 2.2 4.8-4.8" /></svg>;
  return to ? <Link className="ranking-affiliation-icon" to={to} title={name} aria-label={`Ver ${name}`}>{content}</Link> : <div className="ranking-affiliation-icon" title={name} aria-label={name}>{content}</div>;
}

export function Ranking() {
  const [data, setData] = useState<RankingResponse>();
  const [scope, setScope] = useState<RankingScope>('global');
  const [error, setError] = useState('');
  useEffect(() => { const load = () => api.getRanking(scope).then(setData).catch(error => setError(error.message)); load(); const id = setInterval(load, 10000); return () => clearInterval(id); }, [scope]);
  return <Page eyebrow="Clasificación en directo" title="La aventura continúa"><div className="tabs">{(['global', 'team', 'group'] as RankingScope[]).map(item => <button className={item === scope ? 'active' : ''} onClick={() => setScope(item)} key={item}>{labels[item]}</button>)}</div>{error ? <p className="notice">{error}</p> : !data ? <p>Reuniendo puntuaciones…</p> : <ol className="ranking">{data.entries.map(entry => { const affiliation = entry.parentAffiliation ?? entry.affiliation; return <li key={entry.userId}><b className="ranking-position">{entry.rank}</b><RankingAvatar entry={entry} /><span>{entry.name}</span>{affiliation && <RankingAffiliationIcon name={affiliation.name} iconKey={affiliation.avatarKey} to={`/juego/afiliacion/${affiliation.affiliationId}`} />}<strong>{entry.score}</strong></li>; })}</ol>}{data?.frozen && <p className="notice">La clasificación se ha congelado con cariño.</p>}</Page>;
}
