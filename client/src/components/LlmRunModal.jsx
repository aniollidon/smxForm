import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { formatGrade } from '../formatGrade.js';

function pretty(text) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}

export default function LlmRunModal({ answer, question, onClose }) {
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run = answer.llmRun;
  if (!run) return null;
  // Nota i comentari tal com els va proposar el model, encara que el professor els hagi canviat després.
  const proposal = (() => {
    try {
      return JSON.parse(run.response)?.evaluations?.find((evaluation) => evaluation.answerId === answer.id) ?? null;
    } catch {
      return null;
    }
  })();
  const score = proposal?.score ?? answer.score;
  const feedback = proposal?.feedback ?? answer.feedback;
  return createPortal(
    <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="modal llm-run-modal" role="dialog" aria-modal="true" aria-labelledby="llm-run-title">
        <header className="llm-run-header">
          <div>
            <span className="eyebrow">CORRECCIÓ AUTOMÀTICA</span>
            <h3 id="llm-run-title">{answer.attempt.user.name || answer.attempt.user.email}</h3>
          </div>
          <button className="secondary" onClick={onClose} aria-label="Tanca el detall">✕</button>
        </header>
        <dl className="llm-run-facts">
          <div><dt>Nota del model</dt><dd>{score == null ? '—' : `${formatGrade(score)} / ${formatGrade(question.points)}`}</dd></div>
          <div><dt>Model</dt><dd>{run.model}</dd></div>
          <div><dt>Cerca web</dt><dd>{run.webSearch ? 'Activada' : 'Desactivada'}</dd></div>
          <div><dt>Data</dt><dd>{new Date(run.createdAt).toLocaleString()}</dd></div>
        </dl>
        <div className="llm-run-feedback">
          <span className="eyebrow">COMENTARI DEL MODEL</span>
          <p>{feedback || 'Sense comentari.'}</p>
        </div>
        <details className="llm-run-details">
          <summary>Prompt enviat</summary>
          <pre>{run.prompt}</pre>
        </details>
        <details className="llm-run-details">
          <summary>Resposta crua del model</summary>
          <pre>{pretty(run.response)}</pre>
        </details>
      </section>
    </div>,
    document.body,
  );
}
