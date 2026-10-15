import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl } from '../api';
import { formatGrade } from '../formatGrade.js';

const defaultCriteria = 'Avalua l’exactitud, la pertinència i la completesa de la resposta respecte de l’enunciat i la resposta esperada. Assigna una puntuació proporcional als punts assolits i justifica-la breument.';

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
        {answer.feedback && <span className="muted">Comentari desat</span>}
      </div>
      <div className="review-manual-form">
        <label className="review-score-field">Puntuació <input type="number" min="0" max={question.points} step="0.25" value={score} onChange={(e) => setScore(e.target.value)} /></label>
        <label className="review-feedback-field">Comentari per a aquest alumne <textarea rows="2" maxLength={2000} placeholder="Opcional" value={feedback} onChange={(e) => setFeedback(e.target.value)} /></label>
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
  const [criteria, setCriteria] = useState(defaultCriteria);
  const [savedCriteria, setSavedCriteria] = useState(defaultCriteria);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [gradingMode, setGradingMode] = useState('llm');
  const [selectedAnswerIds, setSelectedAnswerIds] = useState([]);
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [gradingWithAi, setGradingWithAi] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['question-answers', qid],
    queryFn: () => api(`/api/teacher/questions/${qid}/answers`),
  });

  useEffect(() => {
    if (!data?.question) return;
    const currentCriteria = data.question.gradingCriteria || defaultCriteria;
    setCriteria(currentCriteria);
    setSavedCriteria(currentCriteria);
  }, [data?.question?.id, data?.question?.gradingCriteria]);

  useEffect(() => {
    if (!data?.question) return;
    setSelectedAnswerIds(data.answers
      .filter((answer) => answer.needsReview && typeof answer.value === 'string' && answer.value.trim())
      .map((answer) => answer.id));
  }, [data?.question?.id]);

  if (isLoading) return <p>Carregant respostes…</p>;
  if (error) return <p className="error">No s'han pogut carregar les respostes: {error.message}</p>;

  const answers = [...data.answers].sort((a, b) => new Date(b.attempt.submittedAt) - new Date(a.attempt.submittedAt));
  const pending = answers.filter((answer) => answer.needsReview).length;
  const selectableAnswers = answers.filter((answer) => typeof answer.value === 'string' && answer.value.trim());
  const visibleAnswers = pendingOnly ? answers.filter((answer) => answer.needsReview) : answers;
  const selectedAnswers = selectableAnswers.filter((answer) => selectedAnswerIds.includes(answer.id));
  const selectionLimitExceeded = selectedAnswers.length > 100;
  const supportsAiGrading = ['SHORT_TEXT', 'LONG_TEXT'].includes(data.question.type);
  const criteriaChanged = criteria.trim() !== savedCriteria;
  const refresh = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['question-answers', qid] }),
    queryClient.invalidateQueries({ queryKey: ['attempt-review'] }),
    queryClient.invalidateQueries({ queryKey: ['attempts'] }),
  ]);
  const saveCriteria = async () => {
    setSavingCriteria(true);
    setActionError('');
    setActionMessage('');
    try {
      const result = await api(`/api/teacher/questions/${qid}/grading-criteria`, {
        method: 'PUT',
        body: { criteria },
      });
      const next = result.gradingCriteria || defaultCriteria;
      setCriteria(next);
      setSavedCriteria(next);
      await queryClient.invalidateQueries({ queryKey: ['question-answers', qid] });
      setActionMessage('Criteris desats.');
    } catch (e) {
      setActionError(e.message);
    } finally {
      setSavingCriteria(false);
    }
  };
  const evaluateSelectedWithLlm = async () => {
    setGradingWithAi(true);
    setActionError('');
    setActionMessage('');
    try {
      if (criteriaChanged) {
        const saved = await api(`/api/teacher/questions/${qid}/grading-criteria`, {
          method: 'PUT',
          body: { criteria },
        });
        const next = saved.gradingCriteria || defaultCriteria;
        setCriteria(next);
        setSavedCriteria(next);
      }
      const result = await api(`/api/teacher/questions/${qid}/ai-grade`, {
        method: 'POST',
        body: { answerIds: selectedAnswers.map((answer) => answer.id) },
      });
      setSelectedAnswerIds([]);
      await refresh();
      setActionMessage(result.evaluations.length
        ? `Avaluades ${result.evaluations.length} respostes amb la LLM.`
        : 'La LLM no ha avaluat cap resposta.');
    } catch (e) {
      setActionError(e.message);
    } finally {
      setGradingWithAi(false);
    }
  };

  const expectedAnswer = data.question.type === 'LONG_TEXT'
    ? data.question.answerKey?.reference
    : [
      ...(data.question.answerKey?.accepted || []),
      ...(data.question.answerKey?.regex ? [`Expressió regular: ${data.question.answerKey.regex}`] : []),
    ].join('\n');
  const answerSaved = (answerId) => {
    setSelectedAnswerIds((current) => current.filter((selectedId) => selectedId !== answerId));
    return refresh();
  };
  const setPendingSelection = () => setSelectedAnswerIds(selectableAnswers.filter((answer) => answer.needsReview).map((answer) => answer.id));
  const setLlmSelection = () => setSelectedAnswerIds(selectableAnswers.filter((answer) => answer.llmReviewed).map((answer) => answer.id));
  const toggleAnswerSelection = (answerId) => {
    setSelectedAnswerIds((current) => current.includes(answerId)
      ? current.filter((selectedId) => selectedId !== answerId)
      : [...current, answerId]);
  };
  const toggleCardSelection = (event, answerId) => {
    if (event.target.closest('a, button, input, textarea, select, label')) return;
    if (gradingWithAi) return;
    toggleAnswerSelection(answerId);
  };
  return (
    <div className="question-review">
      <p className="review-breadcrumb"><Link to={`/t/quiz/${id}/attempts`}>← Tots els intents</Link><span>/</span>Revisió per pregunta</p>
      <header className="question-review-header">
        <div className="question-review-title">
          <span className="eyebrow">PREGUNTA {String(data.question.order + 1).padStart(2, '0')} · {data.question.type}</span>
          <h1>{data.question.text}</h1>
          <p>{formatGrade(data.question.points)} punts · Respostes de tots els intents enviats</p>
          {expectedAnswer && <div className="review-reference question-review-reference"><span>RESPOSTA ESPERADA</span>{expectedAnswer}</div>}
        </div>
        <div className="question-review-count"><span>PENDENTS</span><b>{pending}</b></div>
      </header>
      <div className="question-review-toolbar">
        <div className="question-review-controls">
          {supportsAiGrading && <div className="question-review-mode" role="group" aria-label="Mode de correcció">
            <button type="button" className={gradingMode === 'llm' ? 'is-active' : ''} aria-pressed={gradingMode === 'llm'} onClick={() => { setGradingMode('llm'); setSelectedAnswerIds([]); }}>Avaluació amb LLM</button>
            <button type="button" className={gradingMode === 'manual' ? 'is-active' : ''} aria-pressed={gradingMode === 'manual'} onClick={() => { setGradingMode('manual'); setSelectedAnswerIds([]); }}>Avaluació manual</button>
          </div>}
          <button className={`question-review-filter${pendingOnly ? ' is-active' : ''}`} aria-pressed={pendingOnly} onClick={() => setPendingOnly((current) => !current)}>
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3 4h14l-5.4 6.2v4.2l-3.2 1.7v-5.9L3 4Z" /></svg>
            Pendents <span>{pending}</span>
          </button>
          {supportsAiGrading && <div className="question-review-selection-actions" aria-label="Selecció de respostes">
            <button onClick={setPendingSelection} disabled={gradingWithAi}>Pendents</button>
            <button onClick={setLlmSelection} disabled={gradingWithAi}>Avaluades amb LLM</button>
            <button onClick={() => setSelectedAnswerIds(selectableAnswers.map((answer) => answer.id))} disabled={gradingWithAi}>Totes</button>
            <button onClick={() => setSelectedAnswerIds([])} disabled={!selectedAnswerIds.length || gradingWithAi}>Cap</button>
          </div>}
        </div>
        <span className="question-review-result-count">{visibleAnswers.length} de {answers.length} respostes</span>
      </div>
      {supportsAiGrading && gradingMode === 'llm' && (
        <section className="question-ai-grading">
          <label className="question-ai-criteria">Criteris de correcció
            <textarea maxLength={5000} value={criteria} onChange={(event) => setCriteria(event.target.value)} />
          </label>
          <div className="question-ai-selection" aria-live="polite">
            <strong>Respostes que s’enviaran ({selectedAnswers.length})</strong>
            {selectedAnswers.length ? (
              <ul>{selectedAnswers.map((answer) => (
                <li key={answer.id}>
                  <b>{answer.attempt.user.name || answer.attempt.user.email}</b>
                  <span>{answer.needsReview ? 'Pendent' : 'Ja corregida; reavaluació sol·licitada'}</span>
                  <p>{String(answer.value)}</p>
                </li>
              ))}</ul>
            ) : <p>Cap resposta seleccionada.</p>}
          </div>
          <div className="question-ai-actions">
            <button className="secondary" onClick={saveCriteria} disabled={!criteriaChanged || savingCriteria || gradingWithAi}>
              {savingCriteria ? 'Desant criteris…' : 'Desa criteris'}
            </button>
            <button onClick={evaluateSelectedWithLlm} disabled={!selectedAnswers.length || selectionLimitExceeded || savingCriteria || gradingWithAi}>
              {gradingWithAi ? 'Avaluant selecció…' : `Avalua ${selectedAnswers.length} seleccionades`}
            </button>
            <span className="muted">{gradingWithAi ? 'S’està enviant aquesta selecció; no es pot modificar durant la crida.' : selectionLimitExceeded ? 'Màxim de 100 respostes per crida. Redueix la selecció per continuar.' : 'Les propostes no es desen fins que les revisis.'}</span>
          </div>
          {actionError && <p className="error">{actionError}</p>}
          {actionMessage && <p className="muted">{actionMessage}</p>}
        </section>
      )}
      {answers.length === 0 ? (
        <p className="empty-state">Encara no hi ha respostes lliurades per a aquesta pregunta.</p>
      ) : visibleAnswers.length === 0 ? (
        <p className="empty-state">No hi ha respostes pendents de correcció.</p>
      ) : (
        <div className="question-answer-list">
          {visibleAnswers.map((answer) => (
            <article
              className={`card question-answer${selectedAnswerIds.includes(answer.id) ? ' is-selected' : ''}`}
              key={answer.id}
              onClick={(event) => toggleCardSelection(event, answer.id)}
            >
              <header className="question-answer-header">
                <div className="question-answer-student">
                  {supportsAiGrading && (
                    <input
                      className="question-answer-select"
                      type="checkbox"
                      checked={selectedAnswerIds.includes(answer.id)}
                      disabled={gradingWithAi || !(typeof answer.value === 'string' && answer.value.trim())}
                      aria-label={`Selecciona la resposta de ${answer.attempt.user.name || answer.attempt.user.email} per a l’avaluació assistida`}
                      title={typeof answer.value === 'string' && answer.value.trim() ? 'Selecciona resposta' : 'La resposta és buida'}
                      onChange={() => toggleAnswerSelection(answer.id)}
                    />
                  )}
                  <b>{answer.attempt.user.name || answer.attempt.user.email}</b>
                  <span>{new Date(answer.attempt.submittedAt).toLocaleString()}</span>
                </div>
                <div className="question-answer-header-actions">
                  <span className={`question-answer-state${!answer.needsReview ? ' is-reviewed' : ''}`}>
                    {answer.llmReviewed ? 'Avaluada amb LLM' : answer.needsReview ? 'Pendent de correcció' : answer.manuallyReviewed ? 'Revisada pel professor' : 'Puntuada'}
                  </span>
                  <Link to={`/t/attempt/${answer.attemptId}`}>Obre l'intent ↗</Link>
                </div>
              </header>
              <div className="question-answer-content"><AnswerValue answer={answer} question={data.question} /></div>
              {gradingMode === 'manual' && selectedAnswerIds.includes(answer.id) && (
                <AnswerReviewForm answer={answer} question={data.question} onDone={() => answerSaved(answer.id)} />
              )}
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
