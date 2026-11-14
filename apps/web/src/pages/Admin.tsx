import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import type { AdminAffiliationInput, AdminChallenge, AdminChallengeInput, AdminPlayer, AdminPlayerInput, AdminPorLaCara, AdminPorLaCaraInput, AdminSettings, Affiliation } from '@event-quest/shared';
import { adminApi, api } from '../lib/api';
import { appUrl, assetsUrl, uploadFile } from '../lib/assets';
import { clearSession, setSession, useSession } from '../lib/session';
import './Admin.css';

const sections = { players: 'Jugadores', challenges: 'Preguntas', porLaCara: 'Por la cara', affiliations: 'Comunidades', settings: 'Ajustes' } as const;
type Section = keyof typeof sections;
const messageOf = (error: unknown) => error instanceof Error ? error.message : 'No se ha podido completar la acción.';

export function Admin() {
  const session = useSession();
  const [section, setSection] = useState<Section>('players');
  if (session?.role !== 'admin') return <AdminLogin signedInAsPlayer={Boolean(session?.userId)} />;
  return <section className="page admin">
    <header className="admin-header"><h1>Administración</h1><button className="admin-link" onClick={clearSession}>Cerrar sesión</button></header>
    <div className="tabs admin-tabs">{(Object.keys(sections) as Section[]).map(key => <button key={key} className={key === section ? 'active' : ''} onClick={() => setSection(key)}>{sections[key]}</button>)}</div>
    {section === 'players' && <Players />}
    {section === 'challenges' && <Challenges />}
    {section === 'porLaCara' && <PorLaCaraAdmin />}
    {section === 'affiliations' && <Affiliations />}
    {section === 'settings' && <Settings />}
  </section>;
}

function AdminLogin({ signedInAsPlayer }: { signedInAsPlayer: boolean }) {
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [status, setStatus] = useState(signedInAsPlayer ? 'Tu cuenta actual no es de administración. Entra con una que lo sea.' : '');
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true); setStatus('');
    try {
      const user = await api.login({ name, password });
      if (user.role !== 'admin') { setStatus('Esta cuenta no tiene permisos de administración.'); return; }
      setSession(user.sessionToken, user.userId);
    } catch (error) { setStatus(messageOf(error)); } finally { setBusy(false); }
  };
  return <section className="page admin"><h1>Administración</h1><form className="admin-form admin-login" onSubmit={submit}><label>Nombre<input required value={name} onChange={event => setName(event.target.value)} /></label><label>Contraseña<input required type="password" value={password} onChange={event => setPassword(event.target.value)} /></label>{status && <p className="notice">{status}</p>}<button className="button" disabled={busy}>{busy ? 'Comprobando…' : 'Entrar'}</button></form></section>;
}

// ---------------------------------------------------------------- shared pieces

/** Loads a list and exposes helpers to run an action and refresh, with one shared error message. */
function useList<T>(loader: () => Promise<T[]>) {
  const [items, setItems] = useState<T[]>();
  const [error, setError] = useState('');
  const reload = useCallback(() => loader().then(setItems).catch(reason => { setItems([]); setError(messageOf(reason)); }), [loader]);
  useEffect(() => { void reload(); }, [reload]);
  const run = async (action: () => Promise<unknown>) => {
    setError('');
    try { await action(); await reload(); return true; } catch (reason) { setError(messageOf(reason)); return false; }
  };
  return { items, error, run };
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return <div className="admin-modal" role="dialog" aria-modal="true" aria-label={title}><div><button className="admin-modal-close" type="button" onClick={onClose} aria-label="Cerrar">×</button><h2>{title}</h2>{children}</div></div>;
}

function EditorForm({ onSubmit, onCancel, error, children }: { onSubmit: () => Promise<boolean>; onCancel: () => void; error: string; children: ReactNode }) {
  const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setBusy(true); try { await onSubmit(); } finally { setBusy(false); } };
  return <form className="admin-form" onSubmit={submit}>{children}{error && <p className="notice">{error}</p>}<div className="admin-actions"><button className="button" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button><button type="button" className="admin-link" onClick={onCancel}>Cancelar</button></div></form>;
}

function ConfirmDelete({ what, onConfirm, onCancel }: { what: string; onConfirm: () => Promise<unknown>; onCancel: () => void }) {
  const [busy, setBusy] = useState(false);
  return <Modal title={`¿Borrar ${what}?`} onClose={onCancel}><p>Esta acción no se puede deshacer.</p><div className="admin-actions"><button className="button admin-danger" disabled={busy} onClick={async () => { setBusy(true); await onConfirm(); setBusy(false); }}>{busy ? 'Borrando…' : 'Sí, borrar'}</button><button type="button" className="admin-link" onClick={onCancel}>Cancelar</button></div></Modal>;
}

function QrModal({ title, path, onClose }: { title: string; path: string; onClose: () => void }) {
  const url = appUrl(path);
  return <Modal title={title} onClose={onClose}><div className="admin-qr"><QRCodeSVG value={url} size={260} level="M" includeMargin /><code>{url}</code><button className="button" type="button" onClick={() => window.print()}>Imprimir</button></div></Modal>;
}

function ImageField({ kind, value, onChange }: { kind: 'avatar' | 'affiliation'; value?: string | null; onChange: (key: string | null) => void }) {
  const [status, setStatus] = useState('');
  const choose = async (file: File | undefined) => {
    if (!file) return;
    setStatus('Subiendo imagen…');
    try {
      const { key, upload } = await adminApi.createAssetUpload({ kind, fileName: file.name, contentType: file.type, size: file.size });
      await uploadFile(upload, file);
      onChange(key); setStatus('');
    } catch (error) { setStatus(messageOf(error)); }
  };
  const preview = assetsUrl(value ?? undefined);
  return <div className="admin-image"><span>Imagen</span><div>{preview && <img src={preview} alt="" />}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => void choose(event.target.files?.[0])} />{value && <button type="button" className="admin-link" onClick={() => onChange(null)}>Quitar imagen</button>}</div>{status && <small>{status}</small>}</div>;
}

function Table({ head, children, empty }: { head: string[]; children: ReactNode[]; empty: string }) {
  if (!children.length) return <p className="admin-empty">{empty}</p>;
  return <div className="admin-table"><table><thead><tr>{head.map(label => <th key={label}>{label}</th>)}<th aria-label="Acciones" /></tr></thead><tbody>{children}</tbody></table></div>;
}

const loadAffiliations = () => adminApi.listAffiliations();

// ---------------------------------------------------------------- players

type PlayerDraft = AdminPlayerInput & { userId?: string };
const loadPlayers = () => adminApi.listPlayers();

function Players() {
  const { items, error, run } = useList<AdminPlayer>(loadPlayers);
  const affiliations = useList<Affiliation>(loadAffiliations).items ?? [];
  const [draft, setDraft] = useState<PlayerDraft>();
  const [deleting, setDeleting] = useState<AdminPlayer>();
  const set = (changes: Partial<PlayerDraft>) => setDraft(current => current && { ...current, ...changes });
  const save = async () => {
    if (!draft) return false;
    const { userId, ...input } = draft;
    const saved = await run(() => userId ? adminApi.updatePlayer(userId, input) : adminApi.createPlayer(input));
    if (saved) setDraft(undefined);
    return saved;
  };
  const affiliationName = (id?: string) => affiliations.find(item => item.affiliationId === id)?.name ?? '—';
  if (!items) return <p className="admin-empty">Cargando jugadores…</p>;
  return <>
    <div className="admin-toolbar"><p>{items.length} cuentas. Las de administración no aparecen en la clasificación.</p><button className="button" onClick={() => setDraft({ name: '', password: '', role: 'player' })}>Nuevo jugador</button></div>
    {error && !draft && <p className="notice">{error}</p>}
    <Table head={['Nombre', 'Rol', 'Comunidad', 'Puntos']} empty="Todavía no hay jugadores.">{items.map(player => <tr key={player.userId}><td>{player.name}</td><td>{player.role === 'admin' ? 'Admin' : 'Jugador'}</td><td>{affiliationName(player.affiliationId)}</td><td>{player.score}</td><td className="admin-row-actions"><button onClick={() => setDraft({ userId: player.userId, name: player.name, password: '', role: player.role ?? 'player', gender: player.gender ?? null, affiliationId: player.affiliationId ?? null, avatarKey: player.avatarKey ?? null })}>Editar</button><button onClick={() => setDeleting(player)}>Borrar</button></td></tr>)}</Table>
    {draft && <Modal title={draft.userId ? 'Editar jugador' : 'Nuevo jugador'} onClose={() => setDraft(undefined)}><EditorForm onSubmit={save} onCancel={() => setDraft(undefined)} error={error}>
      <label>Nombre<input required maxLength={80} value={draft.name} onChange={event => set({ name: event.target.value })} /></label>
      <label>{draft.userId ? 'Nueva contraseña (déjala vacía para no cambiarla)' : 'Contraseña'}<input required={!draft.userId} minLength={4} autoComplete="new-password" value={draft.password ?? ''} onChange={event => set({ password: event.target.value })} /></label>
      <label>Rol<select value={draft.role} onChange={event => set({ role: event.target.value as PlayerDraft['role'] })}><option value="player">Jugador</option><option value="admin">Administración</option></select></label>
      <label>Género (para «1º» o «1ª» en la clasificación)<select value={draft.gender ?? ''} onChange={event => set({ gender: (event.target.value || null) as PlayerDraft['gender'] })}><option value="">Sin indicar</option><option value="female">Femenino</option><option value="male">Masculino</option></select></label>
      <label>Comunidad o cabaña<select value={draft.affiliationId ?? ''} onChange={event => set({ affiliationId: event.target.value || null })}><option value="">Ninguna</option>{affiliations.map(item => <option key={item.affiliationId} value={item.affiliationId}>{item.parentAffiliationId ? `${affiliationName(item.parentAffiliationId)} › ` : ''}{item.name}</option>)}</select></label>
      <ImageField kind="avatar" value={draft.avatarKey} onChange={avatarKey => set({ avatarKey })} />
      {draft.userId && <label className="admin-check"><input type="checkbox" checked={Boolean(draft.resetProgress)} onChange={event => set({ resetProgress: event.target.checked })} />Borrar sus respuestas y puntos</label>}
    </EditorForm></Modal>}
    {deleting && <ConfirmDelete what={`a ${deleting.name}`} onCancel={() => setDeleting(undefined)} onConfirm={async () => { await run(() => adminApi.deletePlayer(deleting.userId)); setDeleting(undefined); }} />}
  </>;
}

// ---------------------------------------------------------------- challenges

type ChallengeDraft = { challengeId?: number; title: string; question: string; answers: string; correctAnswer: string; points: number; enabled: boolean; qrProtected: boolean };
const loadChallenges = () => adminApi.listChallenges();
const answersOf = (value: string) => [...new Set(value.split('\n').map(line => line.trim()).filter(Boolean))];

function Challenges() {
  const { items, error, run } = useList<AdminChallenge>(loadChallenges);
  const [draft, setDraft] = useState<ChallengeDraft>();
  const [deleting, setDeleting] = useState<AdminChallenge>();
  const [qr, setQr] = useState<AdminChallenge>();
  const set = (changes: Partial<ChallengeDraft>) => setDraft(current => current && { ...current, ...changes });
  const save = async () => {
    if (!draft) return false;
    const input: AdminChallengeInput = { title: draft.title, question: draft.question, answers: answersOf(draft.answers), correctAnswer: draft.correctAnswer, points: draft.points, enabled: draft.enabled, qrProtected: draft.qrProtected };
    const saved = await run(() => draft.challengeId === undefined ? adminApi.createChallenge(input) : adminApi.updateChallenge(draft.challengeId, input));
    if (saved) setDraft(undefined);
    return saved;
  };
  if (!items) return <p className="admin-empty">Cargando preguntas…</p>;
  const options = draft ? answersOf(draft.answers) : [];
  return <>
    <div className="admin-toolbar"><p>Cada pregunta se juega una sola vez. Con «solo con QR» nadie puede abrirla sin escanear su código.</p><button className="button" onClick={() => setDraft({ title: '', question: '', answers: '', correctAnswer: '', points: 100, enabled: true, qrProtected: true })}>Nueva pregunta</button></div>
    {error && !draft && <p className="notice">{error}</p>}
    <Table head={['Nº', 'Título', 'Puntos', 'Estado']} empty="Todavía no hay preguntas.">{items.map(challenge => <tr key={challenge.challengeId}><td>{challenge.challengeId}</td><td>{challenge.title}</td><td>{challenge.points}</td><td>{challenge.enabled ? 'Activa' : 'Oculta'}{challenge.qrProtected ? ' · solo con QR' : ''}</td><td className="admin-row-actions"><button onClick={() => setQr(challenge)}>QR</button><button onClick={() => setDraft({ challengeId: challenge.challengeId, title: challenge.title, question: challenge.question, answers: challenge.answers.join('\n'), correctAnswer: challenge.correctAnswer, points: challenge.points, enabled: challenge.enabled, qrProtected: Boolean(challenge.qrProtected) })}>Editar</button><button onClick={() => setDeleting(challenge)}>Borrar</button></td></tr>)}</Table>
    {draft && <Modal title={draft.challengeId === undefined ? 'Nueva pregunta' : `Editar pregunta ${draft.challengeId}`} onClose={() => setDraft(undefined)}><EditorForm onSubmit={save} onCancel={() => setDraft(undefined)} error={error}>
      <label>Título<input required maxLength={120} value={draft.title} onChange={event => set({ title: event.target.value })} /></label>
      <label>Pregunta<textarea required maxLength={1000} rows={3} value={draft.question} onChange={event => set({ question: event.target.value })} /></label>
      <label>Respuestas (una por línea)<textarea required rows={4} value={draft.answers} onChange={event => set({ answers: event.target.value })} /></label>
      <label>Respuesta correcta<select required value={options.includes(draft.correctAnswer) ? draft.correctAnswer : ''} onChange={event => set({ correctAnswer: event.target.value })}><option value="" disabled>Elige una</option>{options.map(option => <option key={option} value={option}>{option}</option>)}</select></label>
      <label>Puntos<input required type="number" step={1} value={draft.points} onChange={event => set({ points: Number(event.target.value) })} /></label>
      <label className="admin-check"><input type="checkbox" checked={draft.enabled} onChange={event => set({ enabled: event.target.checked })} />Activa (visible para los jugadores)</label>
      <label className="admin-check"><input type="checkbox" checked={draft.qrProtected} onChange={event => set({ qrProtected: event.target.checked })} />Solo se puede jugar escaneando su QR</label>
    </EditorForm></Modal>}
    {qr && <QrModal title={`QR de «${qr.title}»`} path={qr.qrPath} onClose={() => setQr(undefined)} />}
    {deleting && <ConfirmDelete what={`la pregunta «${deleting.title}»`} onCancel={() => setDeleting(undefined)} onConfirm={async () => { await run(() => adminApi.deleteChallenge(deleting.challengeId)); setDeleting(undefined); }} />}
  </>;
}

// ---------------------------------------------------------------- por la cara

type PorLaCaraDraft = AdminPorLaCaraInput & { porLaCaraId?: string };
const loadPorLaCara = () => adminApi.listPorLaCara();

function PorLaCaraAdmin() {
  const { items, error, run } = useList<AdminPorLaCara>(loadPorLaCara);
  const [draft, setDraft] = useState<PorLaCaraDraft>();
  const [deleting, setDeleting] = useState<AdminPorLaCara>();
  const [qr, setQr] = useState<AdminPorLaCara>();
  const set = (changes: Partial<PorLaCaraDraft>) => setDraft(current => current && { ...current, ...changes });
  const save = async () => {
    if (!draft) return false;
    const { porLaCaraId, ...input } = draft;
    const saved = await run(() => porLaCaraId ? adminApi.updatePorLaCara(porLaCaraId, input) : adminApi.createPorLaCara(input));
    if (saved) setDraft(undefined);
    return saved;
  };
  if (!items) return <p className="admin-empty">Cargando retos por la cara…</p>;
  return <>
    <div className="admin-toolbar"><p>Puntos que se ganan (o se pierden) solo por encontrar un QR escondido.</p><button className="button" onClick={() => setDraft({ title: '', description: '', points: 50, enabled: true })}>Nuevo por la cara</button></div>
    {error && !draft && <p className="notice">{error}</p>}
    <Table head={['Título', 'Puntos', 'Estado']} empty="Todavía no hay retos por la cara.">{items.map(item => <tr key={item.porLaCaraId}><td>{item.title}</td><td>{item.points}</td><td>{item.enabled ? 'Activo' : 'Oculto'}</td><td className="admin-row-actions"><button onClick={() => setQr(item)}>QR</button><button onClick={() => setDraft({ porLaCaraId: item.porLaCaraId, title: item.title, description: item.description, points: item.points, enabled: item.enabled })}>Editar</button><button onClick={() => setDeleting(item)}>Borrar</button></td></tr>)}</Table>
    {draft && <Modal title={draft.porLaCaraId ? 'Editar por la cara' : 'Nuevo por la cara'} onClose={() => setDraft(undefined)}><EditorForm onSubmit={save} onCancel={() => setDraft(undefined)} error={error}>
      <label>Título<input required maxLength={120} value={draft.title} onChange={event => set({ title: event.target.value })} /></label>
      <label>Descripción<textarea required maxLength={1000} rows={3} value={draft.description} onChange={event => set({ description: event.target.value })} /></label>
      <label>Puntos (negativo para restar)<input required type="number" step={1} value={draft.points} onChange={event => set({ points: Number(event.target.value) })} /></label>
      <label className="admin-check"><input type="checkbox" checked={draft.enabled} onChange={event => set({ enabled: event.target.checked })} />Activo</label>
    </EditorForm></Modal>}
    {qr && <QrModal title={`QR de «${qr.title}»`} path={qr.qrPath} onClose={() => setQr(undefined)} />}
    {deleting && <ConfirmDelete what={`«${deleting.title}»`} onCancel={() => setDeleting(undefined)} onConfirm={async () => { await run(() => adminApi.deletePorLaCara(deleting.porLaCaraId)); setDeleting(undefined); }} />}
  </>;
}

// ---------------------------------------------------------------- affiliations

type AffiliationDraft = AdminAffiliationInput & { existingId?: string };

function Affiliations() {
  const { items, error, run } = useList<Affiliation>(loadAffiliations);
  const [draft, setDraft] = useState<AffiliationDraft>();
  const [deleting, setDeleting] = useState<Affiliation>();
  const set = (changes: Partial<AffiliationDraft>) => setDraft(current => current && { ...current, ...changes });
  const save = async () => {
    if (!draft) return false;
    const { existingId, affiliationId, ...input } = draft;
    const saved = await run(() => existingId ? adminApi.updateAffiliation(existingId, input) : adminApi.createAffiliation({ ...input, affiliationId: affiliationId || undefined }));
    if (saved) setDraft(undefined);
    return saved;
  };
  if (!items) return <p className="admin-empty">Cargando comunidades…</p>;
  const communities = items.filter(item => !item.parentAffiliationId);
  const nameOf = (id?: string) => items.find(item => item.affiliationId === id)?.name;
  return <>
    <div className="admin-toolbar"><p>Las comunidades agrupan cabañas; los jugadores se asignan a una u otra.</p><button className="button" onClick={() => setDraft({ name: '', affiliationId: '', parentAffiliationId: null, story: '', avatarKey: null })}>Nueva comunidad</button></div>
    {error && !draft && <p className="notice">{error}</p>}
    <Table head={['Nombre', 'Pertenece a', 'Identificador']} empty="Todavía no hay comunidades.">{items.map(item => <tr key={item.affiliationId}><td>{item.name}</td><td>{nameOf(item.parentAffiliationId) ?? '—'}</td><td><code>{item.affiliationId}</code></td><td className="admin-row-actions"><button onClick={() => setDraft({ existingId: item.affiliationId, name: item.name, parentAffiliationId: item.parentAffiliationId ?? null, story: item.story ?? '', avatarKey: item.avatarKey ?? null })}>Editar</button><button onClick={() => setDeleting(item)}>Borrar</button></td></tr>)}</Table>
    {draft && <Modal title={draft.existingId ? 'Editar comunidad' : 'Nueva comunidad'} onClose={() => setDraft(undefined)}><EditorForm onSubmit={save} onCancel={() => setDraft(undefined)} error={error}>
      <label>Nombre<input required maxLength={80} value={draft.name} onChange={event => set({ name: event.target.value })} /></label>
      {!draft.existingId && <label>Identificador para la URL (opcional, sin espacios)<input pattern="[A-Za-z0-9][A-Za-z0-9_\-]*" maxLength={64} value={draft.affiliationId ?? ''} onChange={event => set({ affiliationId: event.target.value })} /></label>}
      <label>Es una cabaña de<select value={draft.parentAffiliationId ?? ''} onChange={event => set({ parentAffiliationId: event.target.value || null })}><option value="">Ninguna (es una comunidad)</option>{communities.filter(item => item.affiliationId !== draft.existingId).map(item => <option key={item.affiliationId} value={item.affiliationId}>{item.name}</option>)}</select></label>
      <label>Historia<textarea maxLength={2000} rows={4} value={draft.story ?? ''} onChange={event => set({ story: event.target.value })} /></label>
      <ImageField kind="affiliation" value={draft.avatarKey} onChange={avatarKey => set({ avatarKey })} />
    </EditorForm></Modal>}
    {deleting && <ConfirmDelete what={`«${deleting.name}»`} onCancel={() => setDeleting(undefined)} onConfirm={async () => { await run(() => adminApi.deleteAffiliation(deleting.affiliationId)); setDeleting(undefined); }} />}
  </>;
}

// ---------------------------------------------------------------- settings

const randomCode = () => Array.from(crypto.getRandomValues(new Uint8Array(10)), byte => 'abcdefghjkmnpqrstuvwxyz23456789'[byte % 31]).join('');

function Settings() {
  const [settings, setSettings] = useState<AdminSettings>();
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [showQr, setShowQr] = useState(false);
  useEffect(() => { adminApi.getSettings().then(setSettings).catch(error => setStatus(messageOf(error))); }, []);
  const set = (changes: Partial<AdminSettings>) => setSettings(current => current && { ...current, ...changes });
  const save = async (event: FormEvent) => {
    event.preventDefault();
    if (!settings) return;
    setBusy(true); setStatus('');
    try { setSettings(await adminApi.updateSettings(settings)); setStatus('Ajustes guardados.'); } catch (error) { setStatus(messageOf(error)); } finally { setBusy(false); }
  };
  if (!settings) return <p className="admin-empty">{status || 'Cargando ajustes…'}</p>;
  return <form className="admin-form admin-settings" onSubmit={save}>
    <h2>Juego</h2>
    <label className="admin-check"><input type="checkbox" checked={settings.gameEnabled} onChange={event => set({ gameEnabled: event.target.checked })} />Juego abierto (se pueden responder retos y escanear QR)</label>
    <label className="admin-check"><input type="checkbox" checked={settings.maintenanceMode} onChange={event => set({ maintenanceMode: event.target.checked })} />Modo mantenimiento</label>
    <label className="admin-check"><input type="checkbox" checked={settings.rankingFrozen} onChange={event => set({ rankingFrozen: event.target.checked })} />Congelar la clasificación (los puntos nuevos no se muestran hasta descongelarla)</label>
    <h2>Galería</h2>
    <label>Código de la boda<input minLength={6} maxLength={100} autoComplete="off" value={settings.eventCode} onChange={event => set({ eventCode: event.target.value })} /></label>
    <p className="admin-hint">Quien tenga este código puede ver y subir fotos. Si lo cambias, todos los invitados tendrán que volver a introducirlo. Sin código, solo entran los jugadores con cuenta.</p>
    <div className="admin-actions"><button type="button" className="admin-link" onClick={() => set({ eventCode: randomCode() })}>Generar uno aleatorio</button>{settings.eventCode.length >= 6 && <button type="button" className="admin-link" onClick={() => setShowQr(true)}>Ver QR para las mesas</button>}</div>
    {status && <p className="notice">{status}</p>}
    <div className="admin-actions"><button className="button" disabled={busy}>{busy ? 'Guardando…' : 'Guardar ajustes'}</button></div>
    {showQr && <QrModal title="QR de la galería (guarda los ajustes antes de imprimirlo)" path={`/galeria?codigo=${encodeURIComponent(settings.eventCode)}`} onClose={() => setShowQr(false)} />}
  </form>;
}
