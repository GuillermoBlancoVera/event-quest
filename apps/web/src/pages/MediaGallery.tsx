import { ChangeEvent, FormEvent, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { EventMedia } from '@event-quest/shared';
import { api } from '../lib/api';
import { PageLoader } from '../components/PageLoader';
import './MediaGallery.css';

export function MediaGallery() {
  const userId = localStorage.getItem('event-quest-user');
  const [file, setFile] = useState<File>();
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const [media, setMedia] = useState<EventMedia[]>();
  const load = () => api.getMedia().then(setMedia).catch(error => setStatus(error.message));
  useEffect(() => { load(); }, []);

  const choose = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0];
    if (!selected) return;
    if (!selected.type.startsWith('image/') && !selected.type.startsWith('video/')) { setStatus('Elige una imagen o un vídeo.'); return; }
    setFile(selected); setStatus('');
  };
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!file || !userId) { setStatus('Inicia sesión y elige una foto o un vídeo.'); return; }
    setBusy(true); setStatus('Preparando la subida…');
    try {
      const upload = await api.createMediaUpload({ userId, fileName: file.name, contentType: file.type, message });
      const response = await fetch(upload.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
      if (!response.ok) throw new Error('No se ha podido subir el archivo.');
      await api.completeMediaUpload(upload.mediaId, userId);
      setFile(undefined); setMessage(''); setStatus('¡Recuerdo guardado!');
      const input = document.querySelector<HTMLInputElement>('#event-media-file'); if (input) input.value = '';
      load();
    } catch (error) { setStatus(error instanceof Error ? error.message : 'No se ha podido subir el archivo.'); }
    finally { setBusy(false); }
  };
  return <section className="page media-gallery"><p className="eyebrow">RECUERDOS DEL DÍA</p><h1>Sube tu momento favorito</h1><p className="lead">Fotos y vídeos para volver a vivirlo todo. Añade una nota para que no se nos olvide qué estaba pasando.</p>{userId ? <form className="media-form" onSubmit={submit}><label htmlFor="event-media-file">Foto o vídeo<input id="event-media-file" type="file" accept="image/*,video/*" onChange={choose} /></label>{file && <p className="media-file">{file.name}</p>}<label htmlFor="event-media-message">Mensaje opcional<textarea id="event-media-message" maxLength={500} value={message} onChange={event => setMessage(event.target.value)} placeholder="momento comida, cuando se cayó el tío…" /></label><button className="button" disabled={busy}>{busy ? 'Subiendo…' : 'Guardar recuerdo'}</button></form> : <p className="notice">Para subir un recuerdo y que aparezca tu nombre, <Link to="/juego">inicia sesión en el juego</Link>.</p>}{status && <p className="notice">{status}</p>}<h2>Galería</h2>{!media ? <PageLoader label="Cargando recuerdos" /> : <div className="media-grid">{media.map(item => <article key={item.mediaId}>{item.contentType.startsWith('video/') ? <video controls src={item.url} /> : <img src={item.url} alt={item.message || `Foto de ${item.authorName}`} />}<p>{item.message}</p><small>{item.authorName} · {new Date(item.createdAt).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'medium' })}</small></article>)}</div>}</section>;
}
