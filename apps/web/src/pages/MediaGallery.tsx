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
  const load = () => api.getMedia().then(setMedia).catch(error => { setMedia([]); setStatus(error instanceof Error ? error.message : 'No se han podido cargar los recuerdos.'); });
  useEffect(() => { load(); }, []);

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = [...(event.target.files ?? [])];
    const accepted = selected.filter(isMediaFile);
    if (accepted.length !== selected.length) setStatus('Solo se pueden subir imágenes y vídeos.');
    setFiles(accepted);
  };
  const close = () => { if (!busy) { setOpen(false); setStatus(''); } };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!files.length) { setStatus('Elige al menos una foto o vídeo.'); return; }
    setBusy(true); setStatus(`Subiendo 0 de ${files.length}…`);
    try {
      for (const [index, file] of files.entries()) {
        setStatus(`Subiendo ${index + 1} de ${files.length}…`);
        const contentType = mediaType(file);
        const upload = await api.createMediaUpload({ fileName: file.name, contentType, message });
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
    {!media ? <PageLoader label="Cargando recuerdos" /> : media.length ? <div className="media-grid">{media.map(item => <article key={item.mediaId}>{item.contentType.startsWith('video/') ? <video controls src={item.url} /> : <img src={item.url} alt={item.message || 'Recuerdo de la boda'} />}{item.message && <p>{item.message}</p>}<small>{new Date(item.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' })}</small></article>)}</div> : <div className="media-empty"><p className="eyebrow">EL ÁLBUM DE LA BODA</p><h1>Aún no hay recuerdos</h1><p>Estrena la galería con una foto o un vídeo.</p></div>}
    <button className="media-add-button" onClick={() => setOpen(true)} aria-label="Subir fotos o vídeos">+</button>
    {open && <div className="media-modal" role="dialog" aria-modal="true" aria-labelledby="media-upload-title"><div><button className="media-close" onClick={close} aria-label="Cerrar">×</button><p className="eyebrow">COMPARTE UN RECUERDO</p><h2 id="media-upload-title">Sube fotos o vídeos</h2><p>Puedes elegir varios archivos a la vez. La subida es anónima.</p><form className="media-form" onSubmit={submit}><input id="event-media-file" type="file" accept="image/*,video/*" multiple onChange={choose} /><label className="button" htmlFor="event-media-file">Seleccionar archivos</label>{files.length > 0 && <p className="media-file">{files.length === 1 ? files[0].name : `${files.length} archivos seleccionados`}</p>}<label htmlFor="event-media-message">Mensaje opcional<textarea id="event-media-message" maxLength={500} value={message} onChange={event => setMessage(event.target.value)} placeholder="momento comida, cuando se cayó el tío…" /></label>{status && <p className="notice">{status}</p>}<button className="button" disabled={busy}>{busy ? 'Subiendo…' : `Subir ${files.length || ''} ${files.length === 1 ? 'archivo' : 'archivos'}`}</button></form></div></div>}
  </section>;
}

const imageExtensions = new Set(['avif', 'bmp', 'gif', 'heic', 'heif', 'jpeg', 'jpg', 'png', 'webp']);
const videoExtensions = new Set(['3gp', 'avi', 'm4v', 'mkv', 'mov', 'mp4', 'mpeg', 'mpg', 'webm']);
const extension = (file: File) => file.name.toLocaleLowerCase().split('.').pop() ?? '';
const isMediaFile = (file: File) => file.type.startsWith('image/') || file.type.startsWith('video/') || imageExtensions.has(extension(file)) || videoExtensions.has(extension(file));
const mediaType = (file: File) => file.type || (videoExtensions.has(extension(file)) ? 'video/*' : 'image/*');
