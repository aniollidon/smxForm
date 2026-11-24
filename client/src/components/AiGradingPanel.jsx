import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { usePrompt } from './PromptProvider.jsx';

export default function AiGradingPanel({ quizId, pendingReview }) {
  const qc = useQueryClient();
  const { confirm } = usePrompt();
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const completed = useRef(null);
  const key = ['ai-grading-job', quizId];
  const { data: job, isLoading, error } = useQuery({
    queryKey: key,
    queryFn: () => api(`/api/teacher/quizzes/${quizId}/ai-grade/job`),
    refetchInterval: (query) => query.state.data?.state === 'running' ? 1000 : false,
  });

  useEffect(() => {
    if (!job || job.state === 'running' || completed.current === job) return;
    completed.current = job;
    qc.invalidateQueries({ queryKey: ['quiz-edit', quizId] });
    qc.invalidateQueries({ queryKey: ['quizzes'] });
    qc.invalidateQueries({ queryKey: ['attempts', quizId] });
    qc.invalidateQueries({ queryKey: ['question-answers'] });
  }, [job, qc, quizId]);

  const start = async () => {
    const accepted = await confirm(
      'S’enviaran les respostes pendents compatibles al model LLM per corregir-les i desar-ne les notes. S’utilitzaran els criteris i l’opció de cerca web desats per a cada pregunta, amb el model per defecte. Les respostes buides i els tipus no compatibles continuaran pendents.',
      { title: 'Avaluar les respostes pendents?', confirmLabel: 'Avalua amb LLM' },
    );
    if (!accepted) return;
    setStarting(true);
    setStartError('');
    try {
      const next = await api(`/api/teacher/quizzes/${quizId}/ai-grade/job`, { method: 'POST' });
      qc.setQueryData(key, next);
    } catch (e) {
      setStartError(e.message);
    } finally {
      setStarting(false);
    }
  };

  if (!pendingReview && !job && !error && !startError) return null;
  const running = starting || job?.state === 'running';
  return (
    <section className="card ai-grading-panel" aria-labelledby="ai-grading-title">
      <div className="row between">
        <div>
          <h3 id="ai-grading-title">Avaluació de pendents amb LLM</h3>
          <p className="muted">Cada pregunta utilitza els seus criteris i l’opció de cerca web desats. Model per defecte.</p>
        </div>
        <button onClick={start} disabled={isLoading || running || !pendingReview}>
          {running ? 'Avaluant…' : 'Avalua totes les pendents'}
        </button>
      </div>
      {(startError || error) && <p className="error">No s’ha pogut {startError ? 'iniciar' : 'consultar'} l’avaluació: {startError || error.message}</p>}
      {job && (
        <div aria-live="polite">
          <p>{job.state === 'running' ? 'Avaluació en curs' : job.state === 'error' ? 'Avaluació interrompuda' : 'Avaluació finalitzada'} · {job.done} / {job.total} respostes tractades</p>
          <progress max={job.total || 1} value={job.done} aria-label="Progrés de l’avaluació" />
          <p className="muted">{job.graded} avaluades · {job.skipped} omeses · {job.failed} amb error</p>
          {job.error && <p className="error">{job.error}</p>}
          {job.questions.length > 0 && <ul className="ai-grading-results">
            {job.questions.map((question) => (
              <li key={question.id}>
                <Link to={`/t/quiz/${quizId}/question/${question.id}/answers`}>Pregunta {question.number}: {question.text.slice(0, 100)}</Link>
                <span>{question.state === 'waiting' ? 'Pendent' : question.state === 'running' ? 'Avaluant' : `${question.graded} avaluades · ${question.skipped} omeses · ${question.failed} amb error`}</span>
                {question.detail && <span className={question.state === 'error' ? 'error' : 'muted'}>{question.detail}</span>}
              </li>
            ))}
          </ul>}
        </div>
      )}
    </section>
  );
}
