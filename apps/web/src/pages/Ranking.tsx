import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { Affiliation, RankingEntry, RankingResponse, RankingScope, Stats } from '@event-quest/shared';
import { api } from '../lib/api';
import { Page } from '../components/Page';
import { PageLoader } from '../components/PageLoader';

const labels: Record<RankingScope, string> = { global: 'Personas', team: 'Comunidades', group: 'Cabañas' };
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

export function RankingAffiliationIcons({ entry }: { entry: RankingEntry }) {
  const affiliations = [entry.parentAffiliation, entry.affiliation]
    .filter((affiliation): affiliation is NonNullable<typeof affiliation> => Boolean(affiliation))
    .filter((affiliation, index, items) => items.findIndex(item => item.affiliationId === affiliation.affiliationId) === index);
  return affiliations.length ? <div className="ranking-affiliations">{affiliations.map(affiliation => <RankingAffiliationIcon key={affiliation.affiliationId} name={affiliation.name} iconKey={affiliation.avatarKey} to={`/juego/afiliacion/${affiliation.affiliationId}`} />)}</div> : null;
}

type AffiliationRanking = { affiliation: Affiliation; score: number; participants: number };

function getAffiliationRanking(data: RankingResponse, level: 'community' | 'cabin'): AffiliationRanking[] {
  const rankings = new Map<string, AffiliationRanking>();
  for (const entry of data.entries) {
    const affiliation = level === 'community' ? entry.parentAffiliation ?? entry.affiliation : entry.affiliation?.parentAffiliationId ? entry.affiliation : undefined;
    if (!affiliation) continue;
    const current = rankings.get(affiliation.affiliationId);
    rankings.set(affiliation.affiliationId, current ? { ...current, participants: current.participants + 1 } : { affiliation, score: data.affiliationScores[affiliation.affiliationId] ?? 0, participants: 1 });
  }
  return [...rankings.values()].sort((a, b) => b.score - a.score || a.affiliation.name.localeCompare(b.affiliation.name));
}

export function Ranking() {
  const [data, setData] = useState<RankingResponse>();
  const [stats, setStats] = useState<Stats>();
  const [scope, setScope] = useState<RankingScope>('global');
  const [error, setError] = useState('');
  useEffect(() => { const load = () => Promise.all([api.getRanking(), api.getStats()]).then(([ranking, stats]) => { setData(ranking); setStats(stats); }).catch(error => setError(error.message)); load(); const id = setInterval(load, 10000); return () => clearInterval(id); }, []);
  const affiliationRanking = data && scope !== 'global' ? getAffiliationRanking(data, scope === 'team' ? 'community' : 'cabin') : [];
  if (error) return <Page top={<Link className="game-back-link" to="/juego/perfil">← Mi perfil</Link>}><p className="notice">{error}</p></Page>;
  if (!data) return <PageLoader label="Cargando clasificación" />;
  return <Page eyebrow="Clasificación en directo" top={<Link className="game-back-link" to="/juego/perfil">← Mi perfil</Link>}><div className="tabs">{(['global', 'team', 'group'] as RankingScope[]).map(item => <button className={item === scope ? 'active' : ''} onClick={() => setScope(item)} key={item}>{labels[item]}</button>)}</div>{scope === 'global' ? <ol className="ranking">{data.entries.map(entry => <li key={entry.userId}><b className="ranking-position">{entry.rank}{entry.gender === 'female' ? 'ª' : 'º'}</b><RankingAvatar entry={entry} /><span>{entry.name}<small>{entry.attempted}/{stats?.challenges ?? '—'} retos</small></span><RankingAffiliationIcons entry={entry} /><strong>{entry.score}</strong></li>)}</ol> : <ol className="ranking affiliation-ranking">{affiliationRanking.map(({ affiliation, score, participants }, index) => <li key={affiliation.affiliationId}><Link className="ranking-affiliation-card" to={`/juego/afiliacion/${affiliation.affiliationId}`} aria-label={`Ver ${affiliation.name}`}><b className="ranking-position">{index + 1}</b><RankingAffiliationIcon name={affiliation.name} iconKey={affiliation.avatarKey} /><span>{affiliation.name}<small>{participants} {participants === 1 ? 'participante' : 'participantes'}</small></span><strong>{score}</strong></Link></li>)}</ol>}{data.frozen && <p className="notice">La clasificación se ha congelado con cariño.</p>}</Page>;
}
