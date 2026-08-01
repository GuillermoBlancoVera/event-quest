import { useEffect, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { ChallengeAttempt, QuestionResponse } from '@event-quest/shared';
import { api } from '../lib/api';
import { Page } from '../components/Page';
import { PageLoader } from '../components/PageLoader';
import './Challenge.css';

export function Challenge() {
  const { id } = useParams();
  const challengeId = Number(id);
  const userId = localStorage.getItem('event-quest-user');
  const location = useLocation();
  const navigate = useNavigate();
  const [question, setQuestion] = useState<QuestionResponse>();
  const [answer, setAnswer] = useState('');
  const [attempt, setAttempt] = useState<ChallengeAttempt>();
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [submission, setSubmission] = useState<ChallengeAttempt>();
  const [showResult, setShowResult] = useState(false);
  const fromChallenges = Boolean(location.state?.fromChallenges);

  useEffect(() => {
    if (!userId || !Number.isInteger(challengeId)) return;
    Promise.all([api.getQuestion(challengeId, userId), api.getProfile(userId)])
      .then(([loadedQuestion, profile]) => {
        setQuestion(loadedQuestion);
        const recordedAttempt = profile.history.find(item => item.challengeId === challengeId);
        setAttempt(recordedAttempt);
        setAnswer(recordedAttempt?.answer ?? '');
        if (recordedAttempt && !fromChallenges) {
          setSubmission(recordedAttempt);
        }
      })
      .catch(error => setMessage(error instanceof Error ? error.message : 'No se ha podido cargar el reto.'));
  }, [challengeId, fromChallenges, userId]);

  if (!userId) return <Navigate to="/juego" replace state={{ returnTo: `${location.pathname}${location.search}` }} />;
  if (!question && !message) return <PageLoader label="Cargando reto" />;

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
      setSubmission(result.attempt);
      setShowResult(true);
      setQuestion(await api.getQuestion(challengeId, userId));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se ha podido enviar la respuesta.');
    } finally {
      setBusy(false);
    }
  };

  return <Page eyebrow={question?.title ?? 'Reto'} top={fromChallenges ? <Link className="game-back-link" to="/juego/retos">← Retos</Link> : undefined}>{!question ? <p className="notice">{message}</p> : <><p className="lead">{question.question}</p>{(message || resultMessage) && <p className="notice">{message || resultMessage}</p>}<div className="answers">{question.answers.map(item => { const correct = Boolean(answered && question.correctAnswer === item); const incorrect = Boolean(answered && !attempt?.correct && attempt?.answer === item); const state = correct ? 'selected answer-correct' : incorrect ? 'selected answer-incorrect' : answer === item && !answered ? 'selected' : ''; return <button className={state} disabled={answered} onClick={() => setAnswer(item)} key={item}>{item}</button>; })}</div>{(!answered || submission) && <button className="button" disabled={(!answer && !answered) || busy} onClick={submit}>{busy ? 'Enviando…' : answered ? 'Ir a mi perfil' : 'Enviar respuesta'}</button>}{showResult && submission && <div className={`challenge-result-modal ${submission.correct ? 'correct' : 'incorrect'}`} role="dialog" aria-modal="true" aria-label="Resultado del reto"><div className="challenge-result-content"><button className="challenge-result-close" onClick={() => setShowResult(false)} aria-label="Cerrar resultado">×</button><p>{submission.correct ? '¡Has acertado!' : 'Esta vez no era la respuesta correcta.'}</p><strong>{submission.correct ? `+${submission.awardedPoints} puntos` : '0 puntos'}</strong><button className="button" onClick={() => setShowResult(false)}>Ver reto</button></div></div>}</>}</Page>;
}
