import { ChangeEvent, FormEvent, useEffect, useRef, useState } from 'react';
import type { EventMedia } from '@event-quest/shared';
import Lightbox, { type Slide } from 'yet-another-react-lightbox';
import Share from 'yet-another-react-lightbox/plugins/share';
import Video from 'yet-another-react-lightbox/plugins/video';
import 'yet-another-react-lightbox/styles.css';
import { api } from '../lib/api';
import { PageLoader } from '../components/PageLoader';
import './MediaGallery.css';

export function MediaGallery() {
  const [files, setFiles] = useState<File[]>([]);
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [confirmWithoutMessage, setConfirmWithoutMessage] = useState(false);
  const [open, setOpen] = useState(false);
  const [androidPickerOpen, setAndroidPickerOpen] = useState(false);
  const [media, setMedia] = useState<EventMedia[]>();
  const [showLogin, setShowLogin] = useState(false);
  const [loginName, setLoginName] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginStatus, setLoginStatus] = useState('');
  const [loggingIn, setLoggingIn] = useState(false);
  const [editing, setEditing] = useState<EventMedia>();
  const [deleting, setDeleting] = useState<EventMedia>();
  const [previewing, setPreviewing] = useState<{ items: EventMedia[]; index: number }>();
  const thumbnailRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const [sharing, setSharing] = useState(false);
  const [editMessage, setEditMessage] = useState('');
  const [manageStatus, setManageStatus] = useState('');
  const [managing, setManaging] = useState(false);
  const hasSession = Boolean(localStorage.getItem('event-quest-session-token'));
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(navigator.userAgent);
  const load = () => api.getMedia().then(setMedia).catch(error => { setMedia([]); setStatus(error instanceof Error ? error.message : 'No se han podido cargar los recuerdos.'); });
  useEffect(() => { load(); }, []);
  useEffect(() => { previewing && thumbnailRefs.current[previewing.index]?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }, [previewing?.index]);

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
  const uploadFiles = async () => {
    if (!files.length) { setStatus('Elige al menos una foto o vídeo.'); return; }
    setBusy(true); setUploadProgress(0); setStatus(`Subiendo 0 de ${files.length}…`);
    try {
      const batchId = createBatchId();
      for (const [index, file] of files.entries()) {
        setStatus(`Subiendo ${index + 1} de ${files.length}…`);
        setUploadProgress(0);
        const contentType = mediaType(file);
        const thumbnail = contentType.startsWith('video/') ? await createVideoThumbnail(file) : undefined;
        const display = await createDisplayImage(file, contentType);
        const upload = await api.createMediaUpload({ batchId, fileName: file.name, contentType, message, thumbnailContentType: thumbnail ? 'image/jpeg' : undefined, displayContentType: display ? 'image/jpeg' : undefined });
        await uploadWithProgress(upload.uploadUrl, contentType, file, loaded => setUploadProgress(Math.round(loaded / file.size * 100)));
        if (display && upload.displayUploadUrl) {
          await uploadWithProgress(upload.displayUploadUrl, 'image/jpeg', display);
        }
        if (thumbnail && upload.thumbnailUploadUrl) {
          await uploadWithProgress(upload.thumbnailUploadUrl, 'image/jpeg', thumbnail);
        }
        await api.completeMediaUpload(upload.mediaId);
      }
      setFiles([]); setMessage(''); setOpen(false); setStatus('');
      load();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'No se han podido subir los archivos.'); }
    finally { setBusy(false); setUploadProgress(0); }
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!files.length) { setStatus('Elige al menos una foto o vídeo.'); return; }
    if (!message.trim()) { setConfirmWithoutMessage(true); return; }
    void uploadFiles();
  };

  return <section className="page media-gallery">
    <header className="media-gallery-header"><h1>Galería</h1></header>
    {!media ? <PageLoader label="Cargando recuerdos" /> : media.length ? <div className="media-grid">{groupMedia(media).map(group => <MediaCard key={group.id} group={group} onEdit={item => { setEditing(item); setEditMessage(item.message || 'recuerditos'); setManageStatus(''); }} onDelete={item => { setDeleting(item); setManageStatus(''); }} onPreview={(items, index) => setPreviewing({ items, index })} />)}</div> : <div className="media-empty"><h2>Aún no hay recuerdos</h2><p>Estrena la galería con una foto o un vídeo.</p></div>}
    <button className="media-add-button" onClick={() => setOpen(true)} aria-label="Subir fotos o vídeos">+</button>
    {open && <div className="media-modal" role="dialog" aria-modal="true" aria-labelledby="media-upload-title"><div>{busy ? <div className="media-upload-progress" role="status"><span aria-hidden="true" /><p id="media-upload-title">Subiendo archivos</p><strong>{status}</strong><div className="media-upload-progress-bar" aria-label={`${uploadProgress}% completado`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadProgress} role="progressbar"><span style={{ width: `${uploadProgress}%` }} /><b>{uploadProgress}%</b></div></div> : <><button className="media-close" onClick={close} aria-label="Cerrar">×</button><h2 id="media-upload-title">Sube fotos o vídeos</h2><p>Puedes elegir varios archivos a la vez. {hasSession ? 'Las fotos y vídeos se subirán con tu nombre.' : 'La subida será anónima.'}</p>{!hasSession && (showLogin ? <form className="media-login-form" onSubmit={login}><label>Nombre<input required value={loginName} onChange={event => setLoginName(event.target.value)} /></label><label>Contraseña<input required type="password" value={loginPassword} onChange={event => setLoginPassword(event.target.value)} /></label>{loginStatus && <p className="notice">{loginStatus}</p>}<button className="button" disabled={loggingIn}>{loggingIn ? 'Entrando…' : 'Iniciar sesión'}</button><button className="media-login-cancel" type="button" onClick={() => setShowLogin(false)}>Seguir de forma anónima</button></form> : <p className="media-login">¿Quieres que aparezca tu nombre? <button type="button" onClick={() => setShowLogin(true)}>Inicia sesión</button>.</p>)}<form className="media-form" onSubmit={submit}><input id="event-media-file" type="file" accept="image/*,video/*" multiple onChange={choose} /><input id="event-media-camera" type="file" accept="image/*" capture="environment" onChange={choose} /><input id="event-media-video-camera" type="file" accept="video/*" capture="environment" onChange={choose} />{isAndroid ? <button className="button" type="button" onClick={() => setAndroidPickerOpen(true)}>Seleccionar archivos</button> : <label className="button" htmlFor="event-media-file">Seleccionar archivos</label>}{files.length > 0 && <p className="media-file">{files.length === 1 ? files[0].name : `${files.length} archivos seleccionados`}</p>}<label htmlFor="event-media-message">Mensaje opcional<textarea id="event-media-message" maxLength={500} value={message} onChange={event => setMessage(event.target.value)} placeholder="momento comida, cuando se cayó el tío…" /></label>{status && <p className="notice">{status}</p>}<button className="button" disabled={busy}>{`Subir ${files.length || ''} ${files.length === 1 ? 'archivo' : 'archivos'}`}</button></form>{isAndroid && androidPickerOpen && <div className="media-choice-modal" role="dialog" aria-modal="true" aria-label="Elegir archivo"><div><button className="media-close" type="button" onClick={() => setAndroidPickerOpen(false)} aria-label="Cerrar">×</button><h2>¿Qué quieres subir?</h2><button className="button" type="button" onClick={() => { setAndroidPickerOpen(false); document.getElementById('event-media-file')?.click(); }}>Elegir del carrete</button><button className="button" type="button" onClick={() => { setAndroidPickerOpen(false); document.getElementById('event-media-camera')?.click(); }}>Hacer foto</button><button className="button" type="button" onClick={() => { setAndroidPickerOpen(false); document.getElementById('event-media-video-camera')?.click(); }}>Grabar vídeo</button></div></div>}</>}</div></div>}
    {confirmWithoutMessage && <div className="media-modal" role="dialog" aria-modal="true" aria-labelledby="media-empty-message-title"><div><button className="media-close" type="button" onClick={() => setConfirmWithoutMessage(false)} aria-label="Cerrar">×</button><h2 id="media-empty-message-title">¿Subir sin descripción?</h2><p>Se publicará como “recuerditos”.</p><div className="media-confirm-actions"><button className="button" type="button" onClick={() => { setConfirmWithoutMessage(false); void uploadFiles(); }}>Sí, subir</button><button type="button" onClick={() => setConfirmWithoutMessage(false)}>Volver a editar</button></div></div></div>}
    {editing && <div className="media-modal" role="dialog" aria-modal="true" aria-labelledby="media-edit-title"><div><button className="media-close" onClick={() => !managing && setEditing(undefined)} aria-label="Cerrar">×</button><p className="eyebrow">EDITAR RECUERDO</p><h2 id="media-edit-title">Cambia la descripción</h2><p className="media-previous-message">Texto actual: “{editing.message || 'recuerditos'}”</p><form className="media-form" onSubmit={edit}><label htmlFor="event-media-edit-message">Nueva descripción<textarea id="event-media-edit-message" maxLength={500} value={editMessage} onChange={event => setEditMessage(event.target.value)} /></label>{manageStatus && <p className="notice">{manageStatus}</p>}<button className="button" disabled={managing}>{managing ? 'Guardando…' : 'Guardar cambios'}</button></form></div></div>}
    {deleting && <div className="media-modal" role="dialog" aria-modal="true" aria-labelledby="media-delete-title"><div><button className="media-close" onClick={() => !managing && setDeleting(undefined)} aria-label="Cerrar">×</button><p className="eyebrow">BORRAR RECUERDO</p><h2 id="media-delete-title">¿Quieres borrar {deleting.contentType.startsWith('video/') ? 'este vídeo' : 'esta foto'}?</h2><p>Dejará de aparecer en la galería.</p>{manageStatus && <p className="notice">{manageStatus}</p>}<div className="media-confirm-actions"><button className="button" onClick={remove} disabled={managing}>{managing ? 'Borrando…' : 'Sí, borrar'}</button><button type="button" onClick={() => setDeleting(undefined)} disabled={managing}>Cancelar</button></div></div></div>}
    {previewing && <Lightbox open close={() => setPreviewing(undefined)} index={previewing.index} on={{ view: ({ index }) => setPreviewing(current => current?.index === index ? current : current ? { ...current, index } : current) }} className={previewing.items.length < 2 ? 'media-lightbox-single' : undefined} plugins={[Video, Share]} labels={{ Share: 'Compartir' }} styles={{ root: { '--yarl__color_backdrop': 'var(--color-olive)', '--yarl__color_button': 'var(--color-sun)', '--yarl__color_button_active': 'var(--color-peach)', '--yarl__slide_icon_loading_color': 'var(--color-sun)', '--yarl__button_filter': 'none' }, slide: { paddingTop: '4.5rem', paddingBottom: '6.5rem' } }} render={{ controls: () => <>{sharing && <span className="media-share-loader" role="status" aria-label="Preparando archivo para compartir" />}{previewing.items.length > 1 && <div className="media-lightbox-thumbnails" aria-label="Archivos de esta subida">{previewing.items.map((item, index) => <button ref={element => { thumbnailRefs.current[index] = element; }} className={index === previewing.index ? 'active' : ''} type="button" key={item.mediaId} onClick={() => setPreviewing(current => current ? { ...current, index } : current)} aria-label={`Ver archivo ${index + 1}`} aria-current={index === previewing.index ? true : undefined}>{item.contentType.startsWith('video/') ? <>{item.thumbnailUrl && <img src={item.thumbnailUrl} alt="" />}<span aria-hidden="true" /></> : <img src={item.displayUrl ?? item.url} alt="" />}</button>)}</div>}</> }} share={{ share: ({ slide }) => { setSharing(true); void shareMedia(slide).catch(() => undefined).finally(() => setSharing(false)); } }} controller={{ closeOnPullDown: true, disableSwipeNavigation: isIos }} carousel={{ imageFit: 'contain', preload: 1, finite: previewing.items.length < 2 }} slides={previewing.items.map(item => item.contentType.startsWith('video/') ? { type: 'video' as const, poster: item.thumbnailUrl, sources: [{ src: item.url, type: item.contentType }], controls: true, playsInline: true, share: item.url } : { src: item.displayUrl ?? item.url, alt: item.message || 'Recuerdo de la boda', share: item.url })} />}
  </section>;
}

const imageExtensions = new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'webp']);
const videoExtensions = new Set(['3gp', 'avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'webm']);
const extension = (file: File) => file.name.toLocaleLowerCase().split('.').pop() ?? '';
const isMediaFile = (file: File) => file.type.startsWith('image/') || file.type.startsWith('video/') || imageExtensions.has(extension(file)) || videoExtensions.has(extension(file));
const mediaType = (file: File) => file.type || (videoExtensions.has(extension(file)) ? 'video/*' : 'image/*');
const createBatchId = () => typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
const uploadWithProgress = (url: string, contentType: string, body: Blob, onProgress?: (loaded: number) => void) => new Promise<void>((resolve, reject) => {
  const request = new XMLHttpRequest();
  request.open('PUT', url);
  request.setRequestHeader('content-type', contentType);
  request.upload.onprogress = event => { if (event.lengthComputable) onProgress?.(event.loaded); };
  request.onload = () => request.status >= 200 && request.status < 300 ? resolve() : reject(new Error('No se ha podido subir el archivo.'));
  request.onerror = () => reject(new Error('No se ha podido subir el archivo.'));
  request.send(body);
});
const createDisplayImage = (file: File, contentType: string): Promise<Blob | undefined> => new Promise(resolve => {
  if (!contentType.startsWith('image/') || contentType === 'image/gif') { resolve(undefined); return; }
  const image = new Image();
  const source = URL.createObjectURL(file);
  const finish = (display?: Blob) => { URL.revokeObjectURL(source); resolve(display); };
  image.onload = () => {
    const longestSide = Math.max(image.naturalWidth, image.naturalHeight);
    if (!longestSide || longestSide <= 2048) { finish(); return; }
    const scale = 2048 / longestSide;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(image.naturalWidth * scale); canvas.height = Math.round(image.naturalHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) { finish(); return; }
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    canvas.toBlob(display => finish(display ?? undefined), 'image/jpeg', 0.86);
  };
  image.onerror = () => finish();
  image.src = source;
});
const mediaSource = (slide: Slide) => typeof slide.share === 'string' ? slide.share : 'src' in slide ? slide.src : slide.sources[0]?.src;
const extensionFor = (contentType: string) => ({ 'image/jpeg': 'jpg', 'image/heic': 'heic', 'image/heif': 'heif', 'video/quicktime': 'mov', 'video/x-matroska': 'mkv' }[contentType] ?? contentType.split('/')[1]?.split('+')[0] ?? 'archivo');
const getMediaFile = async (slide: Slide) => {
  const source = mediaSource(slide);
  if (!source) throw new Error('No se ha encontrado el archivo.');
  const response = await fetch(source);
  if (!response.ok) throw new Error('No se ha podido descargar el archivo.');
  const blob = await response.blob();
  const contentType = blob.type || ('sources' in slide ? slide.sources[0]?.type : '') || 'application/octet-stream';
  return new File([blob], `recuerdo-${Date.now()}.${extensionFor(contentType)}`, { type: contentType });
};
const shareMedia = async (slide: Slide) => {
  const file = await getMediaFile(slide);
  if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: 'Recuerdo de la boda' }); return; }
  const link = document.createElement('a');
  link.href = URL.createObjectURL(file); link.download = file.name; link.click();
  window.setTimeout(() => URL.revokeObjectURL(link.href), 30_000);
};
const createVideoThumbnail = (file: File): Promise<Blob | undefined> => new Promise(resolve => {
  const video = document.createElement('video');
  const url = URL.createObjectURL(file);
  const finish = (thumbnail?: Blob) => { URL.revokeObjectURL(url); resolve(thumbnail); };
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.onloadedmetadata = () => { video.currentTime = Math.min(1, Math.max(0, video.duration / 2)); };
  video.onseeked = () => { const canvas = document.createElement('canvas'); const scale = Math.min(1, 960 / video.videoWidth); canvas.width = Math.round(video.videoWidth * scale); canvas.height = Math.round(video.videoHeight * scale); canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height); canvas.toBlob(blob => finish(blob ?? undefined), 'image/jpeg', 0.82); };
  video.onerror = () => finish();
  video.src = url;
});

type MediaGroup = { id: string; items: EventMedia[] };
const EditIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16v4Z" /><path d="m13 7 4 4" /></svg>;
const DeleteIcon = () => <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5m4-5v5" /></svg>;
const groupMedia = (media: EventMedia[]): MediaGroup[] => {
  const groups = new Map<string, EventMedia[]>();
  media.forEach(item => {
    const id = item.batchId ?? item.mediaId;
    groups.set(id, [...(groups.get(id) ?? []), item]);
  });
  return [...groups.entries()].map(([id, items]) => ({ id, items: items.sort((a, b) => a.createdAt.localeCompare(b.createdAt)) }));
};

function MediaCard({ group, onEdit, onDelete, onPreview }: { group: MediaGroup; onEdit: (item: EventMedia) => void; onDelete: (item: EventMedia) => void; onPreview: (items: EventMedia[], index: number) => void }) {
  const [index, setIndex] = useState(0);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [playingVideo, setPlayingVideo] = useState<string>();
  const activeIndex = Math.min(index, group.items.length - 1);
  const item = group.items[activeIndex];
  const multiple = group.items.length > 1;
  const markReady = (slide: number) => {
    const mediaId = group.items[slide].mediaId;
    setLoaded(current => new Set(current).add(mediaId));
  };
  const change = (direction: number) => { setPlayingVideo(undefined); setIndex((activeIndex + direction + group.items.length) % group.items.length); };

  return <article>{item.canManage && <div className="media-card-actions"><button type="button" onClick={() => onEdit(item)} aria-label="Editar descripción"><EditIcon /></button><button type="button" onClick={() => onDelete(item)} aria-label="Borrar recuerdo"><DeleteIcon /></button></div>}{multiple && <span className="media-card-count">{activeIndex + 1}/{group.items.length}</span>}<div className="media-carousel">{multiple && <><button className="media-card-arrow media-card-arrow-left" type="button" onClick={() => change(-1)} aria-label="Ver archivo anterior">‹</button><button className="media-card-arrow media-card-arrow-right" type="button" onClick={() => change(1)} aria-label="Ver archivo siguiente">›</button></>}{!item.contentType.startsWith('video/') && !loaded.has(item.mediaId) && <span className="media-card-loader" role="status" aria-label="Cargando" />}{group.items.map((entry, slide) => <div className={`media-slide${slide === activeIndex ? ' active' : ''}`} key={entry.mediaId}>{entry.contentType.startsWith('video/') ? playingVideo === entry.mediaId ? <video controls autoPlay preload="auto" src={entry.url} /> : <button className="media-video-preview" type="button" onClick={() => setPlayingVideo(entry.mediaId)}>{entry.thumbnailUrl && <img loading="eager" src={entry.thumbnailUrl} alt="Vista previa del vídeo" onLoad={() => markReady(slide)} />}<span aria-hidden="true" /></button> : <button className="media-image-preview" type="button" onClick={() => onPreview(group.items, slide)}><img loading="eager" src={entry.displayUrl ?? entry.url} alt={entry.message || 'Recuerdo de la boda'} onLoad={() => markReady(slide)} /></button>}</div>)}</div><p>{item.message || 'recuerditos'}</p><small>{item.authorName === 'anónimo' ? '' : `${item.authorName} · `}{new Date(item.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' })}</small></article>;
}
