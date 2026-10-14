import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl } from '../api';
import { ImageWithPoints } from '../components/QuestionInput.jsx';

const optText = (q, list, id) => q.config[list].find((x) => x.id === id)?.text ?? id;

function Value({ a }) {
  const { question: q, value } = a;
  if (q.type === 'IMAGE_UPLOAD') return a.fileUrl ? <img src={fileUrl(a.fileUrl)} alt="" style={{ maxWidth: 400 }} /> : <i>Sense resposta</i>;
  if (value == null || value === '') return <i>Sense resposta</i>;
  switch (q.type) {
    case 'MCQ': return <>{value.map((v) => optText(q, 'options', v)).join(', ')}</>;
    case 'TRUE_FALSE': return <>{value ? 'Cert' : 'Fals'}</>;
    case 'MATCHING': return <ul>{Object.entries(value).map(([l, r]) => <li key={l}>{optText(q, 'left', l)} → {optText(q, 'right', r)}</li>)}</ul>;
    case 'IMAGE_LABEL':
      return (
        <div>
          <ImageWithPoints src={fileUrl(q.imageUrl)} points={q.config.points} />
          <ul>{q.config.points.map((p, i) => <li key={p.id}>{i + 1}: {value[p.id] || '—'} <span className="muted">(correcte: {q.answerKey.labels[p.id]})</span></li>)}</ul>
        </div>
      );
    default: return <p style={{ whiteSpace: 'pre-wrap' }}>{String(value)}</p>;
  }
}

function ReviewForm({ a, onDone }) {
  const [score, setScore] = useState(a.score ?? 0);
  const [feedback, setFeedback] = useState(a.feedback ?? '');
  const [err, setErr] = useState('');
  const save = async () => {
    try {
      await api(`/api/teacher/answers/${a.id}/review`, { method: 'PUT', body: { score: Number(score), feedback } });
      onDone();
    } catch (e) {
      setErr(e.message);
    }
  };
  return (
    <div className="row">
      <label>Punts (0–{a.question.points}) <input type="number" min="0" max={a.question.points} step="0.25" value={score} onChange={(e) => setScore(e.target.value)} /></label>
      <input type="text" style={{ flex: 1, width: 'auto' }} placeholder="Comentari" value={feedback} onChange={(e) => setFeedback(e.target.value)} />
      <button onClick={save}>Desa</button>
      {err && <span className="error">{err}</span>}
    </div>
  );
}

export default function AttemptReview() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({ queryKey: ['attempt-review', id], queryFn: () => api(`/api/teacher/attempts/${id}`) });
  if (isLoading) return <p>Carregant…</p>;
  const answers = [...data.answers].sort((a, b) => a.question.order - b.question.order);
  const manual = (a) => ['LONG_TEXT', 'IMAGE_UPLOAD'].includes(a.question.type);
  return (
    <div>
      <p><Link to={`/t/quiz/${data.quizId}/attempts`}>← Intents</Link></p>
      <div className="card">
        <h2>{data.user.name || data.user.email}</h2>
        <p>Estat: {data.status} · Nota: <b>{data.score ?? 'pendent'}</b> / {data.quiz.maxScore}</p>
      </div>
      {answers.map((a) => (
        <div className="card stack" key={a.id}>
          <b>{a.question.text}</b> <span className="badge">{a.score ?? '?'} / {a.question.points}</span>
          <Value a={a} />
          {manual(a) && a.question.answerKey.reference && <p className="muted">Referència: {a.question.answerKey.reference}</p>}
          {manual(a) && (
            <ReviewForm a={a} onDone={() => qc.invalidateQueries({ queryKey: ['attempt-review', id] })} />
          )}
        </div>
      ))}
    </div>
  );
}
