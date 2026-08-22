import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import type { EventMedia } from '@event-quest/shared';
import { api } from '../lib/api';
import { PageLoader } from '../components/PageLoader';
import './MediaGallery.css';

export function MediaGallery() {
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [media, setMedia] = useState<EventMedia[]>();
  const [showLogin, setShowLogin] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [editing, setEditing] = useState<EventMedia>();
  const [deleting, setDeleting] = useState<EventMedia>();
  const [editMessage, setEditMessage] = useState('');
  const [manageStatus, setManageStatus] = useState('');
  const [managing, setManaging] = useState(false);
  const hasSession = Boolean(localStorage.getItem('event-quest-session-token'));
  const load = () => api.getMedia().then(setMedia).catch(error => { setMedia([]); setStatus(error instanceof Error ? error.message : 'No se han podido cargar los recuerdos.'); });
  useEffect(() => { load(); }, []);

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = [...(event.target.files ?? [])];
    const accepted = selected.filter(isMediaFile);
    if (accepted.length !== selected.length) setStatus('Solo se pueden subir imágenes y vídeos.');
    setFiles(accepted);
  };
  const close = () => { if (!busy) { setOpen(false); setStatus(''); } };
  const login = async (event: FormEvent) => {
    event.preventDefault();
    setLoggingIn(true);
    setLoginStatus('');
    try {
      const user = await api.login({ name: loginName, password: loginPassword });
      localStorage.setItem('event-quest-user', user.userId);
      localStorage.setItem('event-quest-session-token', user.sessionToken);
      setLoginPassword('');
      setShowLogin(false);
    } catch (error) {
      setLoginStatus(error instanceof Error ? error.message : 'No se ha podido iniciar sesión.');
    } finally {
      setLoggingIn(false);
    }
  };
  const edit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editing) return;
    setManaging(true);
    setManageStatus('');
    try {
      await api.updateMedia(editing.mediaId, { message: editMessage });
      setEditing(undefined);
      load();
    } catch (error) {
      setManageStatus(error instanceof Error ? error.message : 'No se ha podido editar el recuerdo.');
    } finally {
      setManaging(false);
    }
  };
  const remove = async () => {
    if (!deleting) return;
    setManaging(true);
    setManageStatus('');
    try {
      await api.deleteMedia(deleting.mediaId);
      setDeleting(undefined);
      load();
    } catch (error) {
      setManageStatus(error instanceof Error ? error.message : 'No se ha podido borrar el recuerdo.');
    } finally {
      setManaging(false);
    }
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!files.length) { setStatus('Elige al menos una foto o vídeo.'); return; }
    setBusy(true); setStatus(`Subiendo 0 de ${files.length}…`);
    try {
      const batchId = createBatchId();
      for (const [index, file] of files.entries()) {
        setStatus(`Subiendo ${index + 1} de ${files.length}…`);
        const contentType = mediaType(file);
        const upload = await api.createMediaUpload({ batchId, fileName: file.name, contentType, message });
        const response = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'content-type': contentType }, body: file });
        if (!response.ok) throw new Error(`No se ha podido subir ${file.name}.`);
        await api.completeMediaUpload(upload.mediaId);
      }
      setFiles([]); setMessage(''); setOpen(false); setStatus('');
      load();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'No se han podido subir los archivos.'); }
    finally { setBusy(false); }
  };

  return <section className="page media-gallery">
    <header className="media-gallery-header"><p className="eyebrow">RECUERDOS DEL DÍA</p><h1>Galería</h1></header>
    {!media ? <PageLoader label="Cargando recuerdos" /> : media.length ? <div className="media-grid">{groupMedia(media).map(group => <MediaCard key={group.id} group={group} onEdit={item => { setEditing(item); setEditMessage(item.message || 'recuerditos'); setManageStatus(''); }} onDelete={item => { setDeleting(item); setManageStatus(''); }} />)}</div> : <div className="media-empty"><h2>Aún no hay recuerdos</h2><p>Estrena la galería con una foto o un vídeo.</p></div>}
    <button className="media-add-button" onClick={() => setOpen(true)} aria-label="Subir fotos o vídeos">+</button>
    {open && <div className="media-modal" role="dialog" aria-modal="true" aria-labelledby="media-upload-title"><div><button className="media-close" onClick={close} aria-label="Cerrar">×</button><p className="eyebrow">COMPARTE UN RECUERDO</p><h2 id="media-upload-title">Sube fotos o vídeos</h2><p>Puedes elegir varios archivos a la vez. {hasSession ? 'Las fotos y vídeos se subirán con tu nombre.' : 'La subida será anónima.'}</p>{!hasSession && (showLogin ? <form className="media-login-form" onSubmit={login}><label>Nombre<input required value={loginName} onChange={event => setLoginName(event.target.value)} /></label><label>Contraseña<input required type="password" value={loginPassword} onChange={event => setLoginPassword(event.target.value)} /></label>{loginStatus && <p className="notice">{loginStatus}</p>}<button className="button" disabled={loggingIn}>{loggingIn ? 'Entrando…' : 'Iniciar sesión'}</button><button className="media-login-cancel" type="button" onClick={() => setShowLogin(false)}>Seguir de forma anónima</button></form> : <p className="media-login">¿Quieres que aparezca tu nombre? <button type="button" onClick={() => setShowLogin(true)}>Inicia sesión</button>.</p>)}<form className="media-form" onSubmit={submit}><input id="event-media-file" type="file" accept="image/*,video/*" multiple onChange={choose} /><label className="button" htmlFor="event-media-file">Seleccionar archivos</label>{files.length > 0 && <p className="media-file">{files.length === 1 ? files[0].name : `${files.length} archivos seleccionados`}</p>}<label htmlFor="event-media-message">Mensaje opcional<textarea id="event-media-message" maxLength={500} value={message} onChange={event => setMessage(event.target.value)} placeholder="momento comida, cuando se cayó el tío…" /></label>{status && <p className="notice">{status}</p>}<button className="button" disabled={busy}>{busy ? 'Subiendo…' : `Subir ${files.length || ''} ${files.length === 1 ? 'archivo' : 'archivos'}`}</button></form></div></div>}
    {editing && <div className="media-modal" role="dialog" aria-modal="true" aria-labelledby="media-edit-title"><div><button className="media-close" onClick={() => !managing && setEditing(undefined)} aria-label="Cerrar">×</button><p className="eyebrow">EDITAR RECUERDO</p><h2 id="media-edit-title">Cambia la descripción</h2><p className="media-previous-message">Texto actual: “{editing.message || 'recuerditos'}”</p><form className="media-form" onSubmit={edit}><label htmlFor="event-media-edit-message">Nueva descripción<textarea id="event-media-edit-message" maxLength={500} value={editMessage} onChange={event => setEditMessage(event.target.value)} /></label>{manageStatus && <p className="notice">{manageStatus}</p>}<button className="button" disabled={managing}>{managing ? 'Guardando…' : 'Guardar cambios'}</button></form></div></div>}
    {deleting && <div className="media-modal" role="dialog" aria-modal="true" aria-labelledby="media-delete-title"><div><button className="media-close" onClick={() => !managing && setDeleting(undefined)} aria-label="Cerrar">×</button><p className="eyebrow">BORRAR RECUERDO</p><h2 id="media-delete-title">¿Quieres borrar {deleting.contentType.startsWith('video/') ? 'este vídeo' : 'esta foto'}?</h2><p>Dejará de aparecer en la galería.</p>{manageStatus && <p className="notice">{manageStatus}</p>}<div className="media-confirm-actions"><button className="button" onClick={remove} disabled={managing}>{managing ? 'Borrando…' : 'Sí, borrar'}</button><button type="button" onClick={() => setDeleting(undefined)} disabled={managing}>Cancelar</button></div></div></div>}
  </section>;
}

const imageExtensions = new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'webp']);
const videoExtensions = new Set(['3gp', 'avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'webm']);
const extension = (file: File) => file.name.toLocaleLowerCase().split('.').pop() ?? '';
const isMediaFile = (file: File) => file.type.startsWith('image/') || file.type.startsWith('video/') || imageExtensions.has(extension(file)) || videoExtensions.has(extension(file));
const mediaType = (file: File) => file.type || (videoExtensions.has(extension(file)) ? 'video/*' : 'image/*');
const createBatchId = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

type MediaGroup = { id: string; items: EventMedia[] };
const groupMedia = (media: EventMedia[]): MediaGroup[] => {
  const groups = new Map<string, EventMedia[]>();
  media.forEach(item => {
    const id = item.batchId ?? item.mediaId;
    groups.set(id, [...(groups.get(id) ?? []), item]);
  });
  return [...groups.entries()].map(([id, items]) => ({ id, items: items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }));
};

function MediaCard({ group, onEdit, onDelete }: { group: MediaGroup; onEdit: (item: EventMedia) => void; onDelete: (item: EventMedia) => void }) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const activeIndex = Math.min(index, group.items.length - 1);
  const item = group.items[activeIndex];
  const multiple = group.items.length > 1;
  const markReady = (slide: number) => {
    const mediaId = group.items[slide].mediaId;
    setLoaded(current => new Set(current).add(mediaId));
  };
  const change = (direction: number) => setIndex((activeIndex + direction + group.items.length) % group.items.length);

  return <article>{item.canManage && <div className="media-card-actions"><button type="button" onClick={() => onEdit(item)} aria-label="Editar descripción">✎</button><button type="button" onClick={() => onDelete(item)} aria-label="Borrar recuerdo">🗑</button></div>}{multiple && <><span className="media-card-count">{activeIndex + 1}/{group.items.length}</span><button className="media-card-arrow media-card-arrow-left" type="button" onClick={() => change(-1)} aria-label="Ver archivo anterior">‹</button><button className="media-card-arrow media-card-arrow-right" type="button" onClick={() => change(1)} aria-label="Ver archivo siguiente">›</button></>}<div className="media-carousel">{!loaded.has(item.mediaId) && <span className="media-card-loader" role="status" aria-label="Cargando" />}{group.items.map((entry, slide) => <div className={`media-slide${slide === activeIndex ? ' active' : ''}`} key={entry.mediaId}>{entry.contentType.startsWith('video/') ? <video controls={slide === activeIndex} preload="auto" src={entry.url} onCanPlay={() => markReady(slide)} /> : <img loading="eager" src={entry.url} alt={entry.message || 'Recuerdo de la boda'} onLoad={() => markReady(slide)} />}</div>)}</div><p>{item.message || 'recuerditos'}</p><small>{item.authorName === 'anónimo' ? '' : `${item.authorName} · `}{new Date(item.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' })}</small></article>;
}
