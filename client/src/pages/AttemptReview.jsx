import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl } from '../api';
import { ImageWithPoints } from '../components/QuestionInput.jsx';
import { formatGrade } from '../formatGrade.js';

const optText = (q, list, id) => q.config[list].find((x) => x.id === id)?.text ?? id;

function Value({ a }) {
  const { question: q, value } = a;
  if (q.type === 'IMAGE_UPLOAD') return a.fileUrl ? <img src={fileUrl(a.fileUrl)} alt="" style={{ maxWidth: 400 }} /> : <i>Sense resposta</i>;
  if (value == null || value === '') return <i>Sense resposta</i>;
  switch (q.type) {
    case 'MCQ': return <>{value.map((v) => optText(q, 'options', v)).join(', ')}</>;
    case 'TRUE_FALSE': return <>{value ? 'Cert' : 'Fals'}</>;
    case 'MATCHING': return <ul>{Object.entries(value).map(([l, r]) => <li key={l}>{optText(q, 'left', l)} → {optText(q, 'right', r)}</li>)}</ul>;
    case 'ORDERING': return <ol>{value.map((id) => <li key={id}>{q.config.items.find((item) => item.id === id)?.text ?? id}</li>)}</ol>;
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
  const [saving, setSaving] = useState(false);
  const save = async () => {
    try {
      setSaving(true);
      await api(`/api/teacher/answers/${a.id}/review`, { method: 'PUT', body: { score: Number(score), feedback } });
      onDone();
    } catch (e) {
      setErr(e.message);
    } finally {
      setSaving(false);
    }
  };
  return (
    <div className="review-manual-form">
      <label>Puntuació <input type="number" min="0" max={a.question.points} step="0.25" value={score} onChange={(e) => setScore(e.target.value)} /></label>
      <label className="review-feedback-field">Comentari <input type="text" placeholder="Comentari per a aquest alumne" value={feedback} onChange={(e) => setFeedback(e.target.value)} /></label>
      <button onClick={save} disabled={saving}>{saving ? 'Desant…' : 'Desa correcció'}</button>
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
  const manual = (a) => ['SHORT_TEXT', 'LONG_TEXT', 'IMAGE_UPLOAD'].includes(a.question.type);
  const pendingCount = answers.filter((a) => manual(a) && a.needsReview).length;
  const status = { NEEDS_REVIEW: 'Pendent de correcció', GRADED: 'Corregit', SUBMITTED: 'Enviat' }[data.status] || data.status;
  const refresh = () => qc.invalidateQueries({ queryKey: ['attempt-review', id] });
  return (
    <div className="attempt-review">
      <p className="review-breadcrumb"><Link to={`/t/quiz/${data.quizId}/attempts`}>← Tots els intents</Link><span>/</span>{data.quiz.title}</p>
      <header className="review-summary">
        <div className="review-student">
          <span className="eyebrow">REVISIÓ D'INTENT</span>
          <h1>{data.user.name || data.user.email}</h1>
          {data.user.name && <p>{data.user.email}</p>}
        </div>
        <div className="review-metrics">
          <div className="review-metric"><span>ESTAT</span><b>{status}</b></div>
          <div className="review-metric review-total-score"><span>NOTA</span><b>{formatGrade(data.score)} <i>/ {formatGrade(data.quiz.maxScore)}</i></b></div>
          <div className="review-metric"><span>PREGUNTES</span><b>{answers.length}</b></div>
        </div>
        {pendingCount > 0 && <p className="review-pending-note">{pendingCount} respostes manuals pendents en aquest intent</p>}
      </header>
      <div className="review-section-heading">
        <div><span className="eyebrow">RESPOSTES</span><h2>Revisió de l'intent</h2></div>
        <span className="panel-index">{answers.length} PREGUNTES</span>
      </div>
      {answers.map((a, index) => (
        <article className="card review-question" key={a.id}>
          <div className="review-question-heading">
            <div className="review-question-title"><span className="review-question-number">{String(index + 1).padStart(2, '0')}</span><h3>{a.question.text}</h3></div>
            <span className={`review-score${a.needsReview ? ' is-pending' : ''}`}>{a.score == null ? 'Pendent' : formatGrade(a.score)} <i>/ {formatGrade(a.question.points)}</i></span>
          </div>
          <div className="review-answer"><Value a={a} /></div>
          {manual(a) && a.question.answerKey.reference && <p className="review-reference"><span>REFERÈNCIA</span>{a.question.answerKey.reference}</p>}
          {manual(a) && (
            <div className="review-grading">
              <div className="review-grading-heading"><span className="eyebrow">{a.question.type === 'SHORT_TEXT' ? 'REVISIÓ DOCENT OPCIONAL' : "CORRECCIÓ D'AQUEST ALUMNE"}</span><Link to={`/t/quiz/${data.quizId}/question/${a.question.id}/answers`}>Totes les respostes d'aquesta pregunta →</Link></div>
              <ReviewForm a={a} onDone={refresh} />
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
