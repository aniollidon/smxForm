import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl } from '../api';
import { formatGrade } from '../formatGrade.js';

function AnswerReviewForm({ answer, question, onDone }) {
  const [score, setScore] = useState(answer.score ?? 0);
  const [feedback, setFeedback] = useState(answer.feedback ?? '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    try {
      setSaving(true);
      setError('');
      await api(`/api/teacher/answers/${answer.id}/review`, {
        method: 'PUT',
        body: { score: Number(score), feedback },
      });
      onDone();
    } catch (e) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="question-answer-form">
      <div className="question-answer-meta">
        <span className={`question-answer-state${!answer.needsReview ? ' is-reviewed' : ''}`}>
          {answer.needsReview ? 'Pendent de correcció' : 'Puntuada'}
        </span>
        {answer.feedback && <span className="muted">Comentari desat</span>}
      </div>
      <div className="review-manual-form">
        <label>Puntuació <input type="number" min="0" max={question.points} step="0.25" value={score} onChange={(e) => setScore(e.target.value)} /></label>
        <label className="review-feedback-field">Comentari per a aquest alumne <input type="text" placeholder="Opcional" value={feedback} onChange={(e) => setFeedback(e.target.value)} /></label>
        <button onClick={save} disabled={saving}>{saving ? 'Desant…' : 'Desa correcció'}</button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}

function AnswerValue({ answer, question }) {
  if (question.type === 'IMAGE_UPLOAD') {
    return answer.fileUrl
      ? <img src={fileUrl(answer.fileUrl)} alt={`Resposta de ${answer.attempt.user.name || answer.attempt.user.email}`} />
      : <i>Sense resposta</i>;
  }
  if (answer.value == null || String(answer.value).trim() === '') return <i>Sense resposta</i>;
  return <>{String(answer.value)}</>;
}

export default function QuestionReview() {
  const { id, qid } = useParams();
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ['question-answers', qid],
    queryFn: () => api(`/api/teacher/questions/${qid}/answers`),
  });

  if (isLoading) return <p>Carregant respostes…</p>;
  if (error) return <p className="error">No s'han pogut carregar les respostes: {error.message}</p>;

  const answers = [...data.answers].sort((a, b) => new Date(b.attempt.submittedAt) - new Date(a.attempt.submittedAt));
  const pending = answers.filter((answer) => answer.needsReview).length;
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['question-answers', qid] }),
    queryClient.invalidateQueries({ queryKey: ['attempt-review'] }),
    queryClient.invalidateQueries({ queryKey: ['attempts'] }),
  ]);

  return (
    <div className="question-review">
      <p className="review-breadcrumb"><Link to={`/t/quiz/${id}/attempts`}>← Tots els intents</Link><span>/</span>Revisió per pregunta</p>
      <header className="question-review-header">
        <div className="question-review-title">
          <span className="eyebrow">PREGUNTA {String(data.question.order + 1).padStart(2, '0')} · {data.question.type}</span>
          <h1>{data.question.text}</h1>
          <p>{formatGrade(data.question.points)} punts · Respostes de tots els intents enviats</p>
        </div>
        <div className="question-review-count"><span>PENDENTS</span><b>{pending}</b></div>
      </header>
      {answers.length === 0 ? (
        <p className="empty-state">Encara no hi ha respostes lliurades per a aquesta pregunta.</p>
      ) : (
        <div className="question-answer-list">
          {answers.map((answer) => (
            <article className="card question-answer" key={answer.id}>
              <header className="question-answer-header">
                <div className="question-answer-student">
                  <b>{answer.attempt.user.name || answer.attempt.user.email}</b>
                  <span>{new Date(answer.attempt.submittedAt).toLocaleString()}</span>
                </div>
                <Link to={`/t/attempt/${answer.attemptId}`}>Obre l'intent ↗</Link>
              </header>
              <div className="question-answer-content"><AnswerValue answer={answer} question={data.question} /></div>
              <AnswerReviewForm answer={answer} question={data.question} onDone={refresh} />
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
