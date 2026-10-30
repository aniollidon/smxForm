import { useCallback, useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from './api';

const POLL_MS = 500;
const EMPTY_PROGRESS = { total: 0, done: 0, ok: 0, failed: 0, skipped: 0, courses: 0, current: null, last: null };

// Exportació de notes a Classroom amb progrés: obre un job al servidor i en consulta l'estat.
export function useExportJob({ onFinished } = {}) {
  const [target, setTarget] = useState(null); // { quizId, jobId, body }
  const [open, setOpen] = useState(false);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const notified = useRef(null);
  const finished = useRef(onFinished);

  useEffect(() => { finished.current = onFinished; });

  const { data: job } = useQuery({
    queryKey: ['export-job', target?.quizId, target?.jobId],
    queryFn: () => api(`/api/teacher/quizzes/${target.quizId}/export/jobs/${target.jobId}`),
    enabled: !!target,
    refetchInterval: (query) => (query.state.data?.state === 'running' ? POLL_MS : false),
    staleTime: 0,
  });

  const state = job?.state || (target || starting ? 'running' : error ? 'error' : 'idle');
  const running = state === 'running';

  useEffect(() => {
    if (!job || job.state === 'running' || notified.current === job.id) return;
    notified.current = job.id;
    finished.current?.(job);
  }, [job]);

  const start = useCallback(async (quizId, body = {}) => {
    setOpen(true);
    setError('');
    setStarting(true);
    notified.current = null;
    try {
      const { jobId } = await api(`/api/teacher/quizzes/${quizId}/export/jobs`, { method: 'POST', body });
      setTarget({ quizId, jobId, body });
    } catch (e) {
      setTarget(null);
      setError(e.message);
    } finally {
      setStarting(false);
    }
  }, []);

  const cancel = useCallback(async () => {
    if (!target) return;
    try {
      await api(`/api/teacher/quizzes/${target.quizId}/export/jobs/${target.jobId}`, { method: 'DELETE' });
    } catch (e) {
      setError(e.message);
    }
  }, [target]);

  // Torna a provar només el que va fallar: els alumnes ja exportats se salten al servidor.
  const retry = useCallback(() => (target ? start(target.quizId, target.body) : undefined), [target, start]);

  const close = useCallback(() => setOpen(false), []);

  return {
    job,
    quizId: target?.quizId ?? null,
    progress: job?.progress || EMPTY_PROGRESS,
    state,
    error,
    running,
    open,
    start,
    cancel,
    retry,
    close,
  };
}
