import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { formatGrade } from '../formatGrade.js';

const clock = (ms) => {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};

function useNow(active) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return undefined;
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [active]);
  return now;
}

function etaOf(events, done, total, now, startedAt) {
  if (!total || done >= total) return null;
  const measured = events.filter((e) => e.type === 'studentDone' && e.ms > 0).slice(-20);
  const elapsed = now - new Date(startedAt).getTime();
  const average = measured.length ? measured.reduce((sum, e) => sum + e.ms, 0) / measured.length : done ? elapsed / done : 0;
  return average ? average * (total - done) : null;
}

export default function ExportProgressDialog({ open, state, job, progress, error, quizTitle, onCancel, onClose, onRetry }) {
  const running = state === 'running';
  const now = useNow(open && running);
  const total = progress?.total ?? 0;
  const done = progress?.done ?? 0;
  const current = progress?.current;
  const last = progress?.last;
  const events = job?.events || [];
  const log = events.filter((event) => event.type === 'studentDone').slice().reverse();
  const courseNames = events.find((event) => event.type === 'start')?.courseNames || [];
  const percent = total ? Math.min(100, Math.round((done / total) * 100)) : 0;
  const elapsed = job?.startedAt ? (job.finishedAt ? new Date(job.finishedAt) : new Date(now)) - new Date(job.startedAt) : 0;
  const eta = job?.startedAt ? etaOf(events, done, total, now, job.startedAt) : null;

  useEffect(() => {
    if (!open || running) return undefined;
    const onKey = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, running, onClose]);

  if (!open) return null;

  let status;
  if (state === 'running') {
    status = current
      ? `Exportant ${current.index} de ${total} · ${current.name || current.email}`
      : last
        ? `Darrer alumne: ${last.name || last.email} (${last.index} de ${total})`
        : total
          ? `Preparant l’exportació (${done} de ${total})…`
          : 'Comprovant els intents i els cursos vinculats…';
  } else if (state === 'error') {
    status = error || job?.error || 'No s’han pogut exportar les notes.';
  } else if (state === 'cancelled') {
    status = `Exportació cancel·lada: ${progress?.ok ?? 0} notes actualitzades de ${total}.`;
  } else if (state === 'done') {
    status = `${progress?.ok ?? 0} notes actualitzades a Classroom de ${total} alumnes.`;
  } else {
    status = 'Preparant l’exportació…';
  }

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && !running && onClose()}>
      <section className="modal export-modal" role="dialog" aria-modal="true" aria-labelledby="export-dialog-title">
        <header className="export-header">
          <div>
            <span className="eyebrow">GOOGLE CLASSROOM</span>
            <h3 id="export-dialog-title">Exportació de notes</h3>
            {quizTitle && <p className="muted">{quizTitle}</p>}
          </div>
          {!running && <button className="secondary" onClick={onClose} aria-label="Tanca el progrés">✕</button>}
        </header>

        <div className="export-progress" role="progressbar" aria-valuemin={0} aria-valuemax={total || 1} aria-valuenow={done} aria-valuetext={`${done} de ${total} alumnes`}>
          <div className="export-progress-bar" style={{ width: `${percent}%` }} />
        </div>
        <div className="export-meter">
          <span>{total ? `${done} / ${total} · ${percent}%` : '—'}</span>
          <span className="muted">{state === 'running' ? `Temps ${clock(elapsed)}${eta ? ` · resten ~${clock(eta)}` : ''}` : `Temps total ${clock(elapsed)}`}</span>
        </div>

        <p className={state === 'error' ? 'error' : running ? 'export-current' : 'export-status'} aria-live="polite">
          {running && <span className="export-dot" aria-hidden="true" />}
          {status}
        </p>
        {courseNames.length > 0 && <p className="muted export-courses">Tasques a {courseNames.join(' · ')}</p>}

        <dl className="export-counters">
          <div><dt>Actualitzats</dt><dd className="ok">{progress?.ok ?? 0}</dd></div>
          <div><dt>Errors</dt><dd className={progress?.failed ? 'error' : ''}>{progress?.failed ?? 0}</dd></div>
          <div><dt>Ja al dia</dt><dd>{progress?.skipped ?? 0}</dd></div>
          {progress?.courses > 0 && <div><dt>Cursos</dt><dd>{progress.courses}</dd></div>}
        </dl>

        {log.length > 0 && (
          <>
            <span className="eyebrow">DETALL</span>
            <ul className="export-log">
              {log.map((event, index) => (
                <li key={`${event.email}-${event.index}-${index}`}>
                  <span>{event.name || event.email}</span>
                  {event.score != null && <span className="muted">{formatGrade(event.score)}</span>}
                  <span className={event.ok ? 'ok' : 'error'}>
                    {event.skipped ? 'Ja al dia' : event.ok ? 'Actualitzat' : event.error || 'Error'}
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}

        <div className="modal-actions export-actions">
          {running ? (
            <button className="secondary" onClick={onCancel}>Cancel·la l’exportació</button>
          ) : (
            <>
              {progress?.failed > 0 && <button onClick={onRetry}>Torna a provar els errors</button>}
              <button className="secondary" onClick={onClose}>Tanca</button>
            </>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
