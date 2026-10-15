import React from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { api } from '../api';
import QuizPreview from './QuizPreview.jsx';
import { formatGrade } from '../formatGrade.js';

export default function QuizLanding() {
  const { slug } = useParams();
  const nav = useNavigate();
  const { data: user } = useQuery({ queryKey: ['me'], queryFn: () => api('/api/me') });
  const isTeacher = user?.role === 'TEACHER';
  const { data, error, isLoading } = useQuery({
    queryKey: ['quiz', slug],
    queryFn: () => api(`/api/student/quizzes/${slug}`),
    enabled: !!user && !isTeacher,
  });
  const start = useMutation({
    mutationFn: () => api(`/api/student/quizzes/${slug}/start`, { method: 'POST' }),
    onSuccess: (r) => nav(`/attempt/${r.attemptId}`),
  });
  if (!user) return <p>Carregant…</p>;
  if (isTeacher) return <QuizPreview slug={slug} />;
  if (isLoading) return <p>Carregant…</p>;
  if (error) return <div className="card"><p className="error">{error.message}</p><Link to="/s">Tornar</Link></div>;
  return (
    <div className="card stack">
      <h2>{data.title}</h2>
      <p style={{ whiteSpace: 'pre-wrap' }}>{data.description}</p>
      <p className="muted">Intents: {data.attemptsUsed} / {data.maxAttempts}</p>
      {data.attempts.filter((a) => a.status !== 'IN_PROGRESS').map((a) => (
        <div key={a.id}>
          <Link to={`/attempt/${a.id}`}>Intent del {new Date(a.submittedAt).toLocaleString()}</Link>
          {a.score != null && <> — nota {formatGrade(a.score)}</>}
          {a.status === 'NEEDS_REVIEW' && <> — pendent de correcció</>}
        </div>
      ))}
      {data.canStart ? (
        <button onClick={() => start.mutate()} disabled={start.isPending}>
          {data.inProgressAttemptId ? 'Continua' : 'Comença'}
        </button>
      ) : (
        <p>Has esgotat els intents.</p>
      )}
      {start.error && <p className="error">{start.error.message}</p>}
    </div>
  );
}
