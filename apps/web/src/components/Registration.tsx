import { FormEvent, useState } from 'react';
import { api } from '../lib/api';
import './Registration.css';

export function Registration() {
  const [name, setName] = useState('');
  const [team, setTeam] = useState('');
  const [group, setGroup] = useState('');
  const [message, setMessage] = useState(() => localStorage.getItem('event-quest-user') ? 'Ya estás registrado en este dispositivo.' : '');
  const [submitting, setSubmitting] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setMessage('');
    try {
      const user = await api.registerUser({ name, team, group });
      localStorage.setItem('event-quest-user', user.userId);
      setMessage(`¡Listo, ${user.name}! Ya puedes escanear y responder retos.`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo completar el registro.');
    } finally {
      setSubmitting(false);
    }
  };

  return <section className="registration" aria-labelledby="registration-title">
    <h2 id="registration-title">Antes de empezar</h2>
    <p>Elige cómo quieres aparecer en la clasificación.</p>
    <form className="registration-form" onSubmit={submit}>
      <label>Tu nombre<input required value={name} onChange={(event) => setName(event.target.value)} /></label>
      <label>Equipo <input value={team} onChange={(event) => setTeam(event.target.value)} placeholder="Opcional" /></label>
      <label>Grupo <input value={group} onChange={(event) => setGroup(event.target.value)} placeholder="Opcional" /></label>
      <button className="button" disabled={submitting}>{submitting ? 'Guardando…' : 'Empezar a jugar'}</button>
    </form>
    {message && <p className="notice">{message}</p>}
  </section>;
}
