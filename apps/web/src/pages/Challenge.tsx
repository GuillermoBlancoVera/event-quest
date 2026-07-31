import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import type { ChallengeAttempt, QuestionResponse } from '@event-quest/shared';
import { api } from '../lib/api';
import { Page } from '../components/Page';
import './Challenge.css';

export function Challenge() {
  const { id } = useParams();
  const challengeId = Number(id);
  const userId = localStorage.getItem('event-quest-user');
  const navigate = useNavigate();
  const [question, setQuestion] = useState<QuestionResponse>();
  const [answer, setAnswer] = useState('');
  const [attempt, setAttempt] = useState<ChallengeAttempt>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!userId || !Number.isInteger(challengeId)) return;
    Promise.all([api.getQuestion(challengeId, userId), api.getProfile(userId)])
      .then(([loadedQuestion, profile]) => {
        setQuestion(loadedQuestion);
        const recordedAttempt = profile.history.find(item => item.challengeId === challengeId);
        setAttempt(recordedAttempt);
        setAnswer(recordedAttempt?.answer ?? '');
      })
      .catch(error => setMessage(error instanceof Error ? error.message : 'No se ha podido cargar el reto.'));
  }, [challengeId, userId]);

  if (!userId) return <Navigate to="/juego" replace />;

  const resultMessage = attempt && (attempt.correct
    ? `Ya has jugado a este reto y has acertado. Has conseguido ${attempt.awardedPoints} puntos.`
    : 'Ya has jugado a este reto, pero esta vez no acertaste. Has conseguido 0 puntos.');
  const answered = Boolean(attempt || question?.correctAnswer);

  const submit = async () => {
    if (answered) {
      navigate('/juego/perfil');
      return;
    }
    if (!answer) return;
    setBusy(true);
    setMessage('');
    try {
      const result = await api.submitAnswer(challengeId, { userId, answer });
      setAttempt(result.attempt);
      setQuestion(await api.getQuestion(challengeId, userId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se ha podido enviar la respuesta.');
    } finally {
      setBusy(false);
    }
  };

  return <Page eyebrow="Reto con código QR" title={question?.title ?? 'Un pequeño misterio'}>{!question ? <p>{message || 'Desvelando la pista…'}</p> : <><p className="lead">{question.question}</p>{(resultMessage || message) && <p className="notice">{resultMessage || message}</p>}<div className="answers">{question.answers.map(item => { const correct = Boolean(answered && question.correctAnswer === item); const incorrect = Boolean(answered && !attempt?.correct && attempt?.answer === item); const state = correct ? 'selected answer-correct' : incorrect ? 'selected answer-incorrect' : answer === item && !answered ? 'selected' : ''; return <button className={state} disabled={answered} onClick={() => setAnswer(item)} key={item}>{item}</button>; })}</div><button className="button" disabled={(!answer && !answered) || busy} onClick={submit}>{busy ? 'Enviando…' : answered ? 'Volver a mi perfil' : 'Enviar respuesta'}</button></>}</Page>;
}
