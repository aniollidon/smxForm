import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl } from '../api';
import { formatGrade } from '../formatGrade.js';
import DrawingBoard from '../components/DrawingBoard.jsx';
import MarkdownText from '../components/MarkdownText.jsx';
import LlmRunModal from '../components/LlmRunModal.jsx';
import AutoGrowTextarea from '../components/AutoGrowTextarea.jsx';

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
      <div className="review-manual-form">
        <label className="review-score-field">Puntuació <input type="number" min="0" max={question.points} step="0.25" value={score} onChange={(e) => setScore(e.target.value)} /></label>
        <label className="review-feedback-field">Comentari per a aquest alumne <AutoGrowTextarea minRows={2} maxLength={2000} placeholder="Opcional" value={feedback} onChange={(e) => setFeedback(e.target.value)} /></label>
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
  const tableHasAnswer = question.type === 'TABLE' && Array.isArray(answer.value)
    && answer.value.some((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim()));
  if (answer.value == null || (question.type === 'TABLE' ? !tableHasAnswer : String(answer.value).trim() === '')) return <i>Sense resposta</i>;
  if (question.type === 'DRAWING') {
    return answer.value.strokes?.length
      ? <DrawingBoard src={fileUrl(question.imageUrl)} color={question.config.color} width={question.config.width} value={answer.value} readOnly />
      : <i>Sense resposta</i>;
  }
  const value = answer.value;
  switch (question.type) {
    case 'MCQ':
      return <>{(Array.isArray(value) ? value : []).map((id) => question.config.options.find((option) => option.id === id)?.text ?? id).join(', ') || 'Sense resposta'}</>;
    case 'TRUE_FALSE':
      return <>{value ? 'Cert' : 'Fals'}</>;
    case 'MATCHING':
      return <ul>{Object.entries(value || {}).map(([leftId, rightId]) => (
        <li key={leftId}>{question.config.left.find((item) => item.id === leftId)?.text ?? leftId} → {question.config.right.find((item) => item.id === rightId)?.text ?? rightId}</li>
      ))}</ul>;
    case 'ORDERING':
      return <ol>{(Array.isArray(value) ? value : []).map((id, index) => (
        <li key={`${id}-${index}`}>{question.config.items.find((item) => item.id === id)?.text ?? id}</li>
      ))}</ol>;
    case 'IMAGE_LABEL':
      return <ul>{question.config.points.map((point, index) => <li key={point.id}>{index + 1}: {value?.[point.id] || '—'}</li>)}</ul>;
    case 'FILL_BLANKS':
      return <ol>{(Array.isArray(value) ? value : []).map((entry, index) => <li key={index}>{entry || '—'}</li>)}</ol>;
    case 'TABLE':
      return (
        <div className="table-scroll"><table className="table-answer">
          <thead><tr><th scope="col"></th>{(question.config.columns || []).map((column, index) => <th scope="col" key={index}>{column}</th>)}</tr></thead>
          <tbody>{(question.config.rows || []).map((row, rowIndex) => <tr key={rowIndex}><th scope="row">{row}</th>{(question.config.columns || []).map((column, columnIndex) => <td key={columnIndex}>{value?.[rowIndex]?.[columnIndex] || '—'}</td>)}</tr>)}</tbody>
        </table></div>
      );
    default:
      return <>{Array.isArray(value) ? value.map((entry) => entry || '—').join(' · ') : String(value)}</>;
  }
}

function getReferenceAnswer(question) {
  const { answerKey, config, type } = question;
  switch (type) {
    case 'MCQ':
      return (answerKey.correct || []).map((id) => config.options.find((option) => String(option.id) === String(id))?.text ?? id).join(', ');
    case 'TRUE_FALSE':
      return answerKey.correct === undefined ? '' : answerKey.correct ? 'Cert' : 'Fals';
    case 'MATCHING':
      return Object.entries(answerKey.pairs || {}).map(([leftId, rightId]) => {
        const left = config.left.find((item) => String(item.id) === String(leftId))?.text ?? leftId;
        const right = config.right.find((item) => String(item.id) === String(rightId))?.text ?? rightId;
        return `${left} → ${right}`;
      }).join('\n');
    case 'ORDERING':
      return (answerKey.order || []).map((id, index) => {
        const text = config.items.find((item) => String(item.id) === String(id))?.text ?? id;
        return `${index + 1}. ${text}`;
      }).join('\n');
    case 'IMAGE_LABEL':
      return config.points.map((point, index) => `${index + 1}: ${answerKey.labels?.[point.id] || '—'}`).join('\n');
    case 'SHORT_TEXT':
      return [
        ...(answerKey.accepted || []),
        ...(answerKey.regex ? [`Expressió regular: ${answerKey.regex}`] : []),
      ].join('\n');
    case 'FILL_BLANKS':
      return (answerKey.blanks || []).map((alternatives, index) => `${index + 1}. ${alternatives.join(' / ')}`).join('\n');
    case 'CALCULATED':
      return answerKey.formula ? `Fórmula: ${answerKey.formula}\nEl resultat concret varia segons l’intent.` : '';
    case 'LONG_TEXT':
      return answerKey.reference || '';
    case 'TABLE':
      return answerKey.reference || '';
    default:
      return '';
  }
}

export default function QuestionReview() {
  const { id, qid } = useParams();
  const queryClient = useQueryClient();
  const [criteria, setCriteria] = useState(defaultCriteria);
  const [savedCriteria, setSavedCriteria] = useState(defaultCriteria);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [gradingMode, setGradingMode] = useState('manual');
  const [selectedAnswerIds, setSelectedAnswerIds] = useState([]);
  const [bulkScore, setBulkScore] = useState('');
  const [bulkFeedback, setBulkFeedback] = useState('');
  const [savingCriteria, setSavingCriteria] = useState(false);
  const [gradingWithAi, setGradingWithAi] = useState(false);
  const [savingManual, setSavingManual] = useState(false);
  const [actionError, setActionError] = useState('');
  const [actionMessage, setActionMessage] = useState('');
  const { data, isLoading, error } = useQuery({
    queryKey: ['question-answers', qid],
    queryFn: () => api(`/api/teacher/questions/${qid}/answers`),
  });
  const { data: llm } = useQuery({
    queryKey: ['llm-models'],
    queryFn: () => api('/api/teacher/llm-models'),
    staleTime: Infinity,
  });
  const [model, setModel] = useState('');
  const [webSearch, setWebSearch] = useState(false);
  const [llmDetail, setLlmDetail] = useState(null);
  const models = llm?.models || [];
  const selectedModel = models.includes(model) ? model : models[0] || '';

  useEffect(() => {
    if (!data?.question) return;
    const currentCriteria = data.question.gradingCriteria || defaultCriteria;
    setCriteria(currentCriteria);
    setSavedCriteria(currentCriteria);
  }, [data?.question?.id, data?.question?.gradingCriteria]);

  useEffect(() => {
    if (!data?.question) return;
    setSelectedAnswerIds([]);
  }, [data?.question?.id]);

  if (isLoading) return <p>Carregant respostes…</p>;
  if (error) return <p className="error">No s'han pogut carregar les respostes: {error.message}</p>;

  const answers = [...data.answers].sort((a, b) => new Date(b.attempt.submittedAt) - new Date(a.attempt.submittedAt));
  const pending = answers.filter((answer) => answer.needsReview).length;
  const selectableAnswers = answers.filter((answer) => data.question.type === 'TABLE'
    ? Array.isArray(answer.value) && answer.value.some((row) => Array.isArray(row) && row.some((cell) => String(cell ?? '').trim()))
    : typeof answer.value === 'string' && answer.value.trim());
  const visibleAnswers = pendingOnly ? answers.filter((answer) => answer.needsReview) : answers;
  const selectedAnswers = answers.filter((answer) => selectedAnswerIds.includes(answer.id));
  const selectableAnswerIds = new Set(selectableAnswers.map((answer) => answer.id));
  const selectedLlmAnswers = selectedAnswers.filter((answer) => selectableAnswerIds.has(answer.id));
  const selectionLimitExceeded = selectedAnswers.length > 100;
  const supportsAiGrading = ['SHORT_TEXT', 'LONG_TEXT', 'TABLE'].includes(data.question.type);
  const bulkScoreIsValid = bulkScore !== '' && Number.isFinite(Number(bulkScore)) && Number(bulkScore) >= 0 && Number(bulkScore) <= data.question.points;
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
        body: { answerIds: selectedLlmAnswers.map((answer) => answer.id), ...(selectedModel ? { model: selectedModel } : {}), webSearch },
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

  const gradeSelectedManually = async () => {
    setSavingManual(true);
    setActionError('');
    setActionMessage('');
    try {
      const result = await api(`/api/teacher/questions/${qid}/manual-grade`, {
        method: 'POST',
        body: {
          answerIds: selectedAnswers.map((answer) => answer.id),
          score: Number(bulkScore),
          feedback: bulkFeedback,
        },
      });
      setSelectedAnswerIds([]);
      await refresh();
      setActionMessage(`Desada la mateixa correcció a ${result.reviewed} respostes.`);
    } catch (e) {
      setActionError(e.message);
    } finally {
      setSavingManual(false);
    }
  };

  const expectedAnswer = getReferenceAnswer(data.question);
  const answerSaved = (answerId) => {
    setSelectedAnswerIds((current) => current.filter((selectedId) => selectedId !== answerId));
    return refresh();
  };
  const setPendingSelection = () => {
    const selectionPool = supportsAiGrading && gradingMode === 'llm' ? selectableAnswers : answers;
    setSelectedAnswerIds(selectionPool.filter((answer) => answer.needsReview).map((answer) => answer.id));
  };
  const setLlmSelection = () => setSelectedAnswerIds(selectableAnswers.filter((answer) => answer.llmReviewed).map((answer) => answer.id));
  const selectAllAnswers = () => {
    const selectionPool = supportsAiGrading && gradingMode === 'llm' ? selectableAnswers : answers;
    setSelectedAnswerIds(selectionPool.map((answer) => answer.id));
  };
  const toggleAnswerSelection = (answerId) => {
    setSelectedAnswerIds((current) => current.includes(answerId)
      ? current.filter((selectedId) => selectedId !== answerId)
      : [...current, answerId]);
  };
  const toggleCardSelection = (event, answerId) => {
    if (event.target.closest('a, button, input, textarea, select, label, .question-answer-form, .question-answer-feedback')) return;
    if (gradingWithAi || savingManual) return;
    if (gradingMode === 'manual') {
      selectManualAnswer(answerId);
      return;
    }
    if (gradingMode === 'llm' && !selectableAnswerIds.has(answerId)) return;
    toggleAnswerSelection(answerId);
  };
  const selectManualAnswer = (answerId) => {
    setSelectedAnswerIds((current) => current.includes(answerId) ? [] : [answerId]);
  };
  return (
    <div className="question-review">
      <p className="review-breadcrumb"><Link to={`/t/quiz/${id}/attempts`}>← Tots els intents</Link><span>/</span>Revisió per pregunta</p>
      <header className="question-review-header">
        <div className="question-review-title">
          <span className="eyebrow">{data.question.type}</span>
          <div className="question-review-heading"><span className="review-question-number">{String(data.question.order + 1).padStart(2, '0')}</span><div className="question-review-prompt"><MarkdownText>{data.question.text}</MarkdownText></div></div>
          <p>{formatGrade(data.question.points)} punts · Respostes de tots els intents enviats</p>
          {expectedAnswer && <div className="review-reference question-review-reference"><span>RESPOSTA ESPERADA</span>{expectedAnswer}</div>}
        </div>
        <div className="question-review-count"><span>PENDENTS</span><b>{pending}</b></div>
      </header>
      <div className="question-review-toolbar">
        <div className="question-review-controls">
          <div className="question-review-mode" role="group" aria-label="Mode de correcció">
            <button type="button" className={gradingMode === 'manual' ? 'is-active' : ''} aria-pressed={gradingMode === 'manual'} onClick={() => { setGradingMode('manual'); setSelectedAnswerIds([]); }}>Avaluació manual</button>
            <button type="button" className={gradingMode === 'bulk' ? 'is-active' : ''} aria-pressed={gradingMode === 'bulk'} onClick={() => { setGradingMode('bulk'); setSelectedAnswerIds([]); }}>Avaluació en bloc</button>
            <button type="button" className={gradingMode === 'llm' ? 'is-active' : ''} aria-pressed={gradingMode === 'llm'} disabled={!supportsAiGrading} title={!supportsAiGrading ? 'Disponible només per a respostes de text' : undefined} onClick={() => { setGradingMode('llm'); setSelectedAnswerIds([]); }}>Avaluació amb LLM</button>
          </div>
          <button className={`question-review-filter${pendingOnly ? ' is-active' : ''}`} aria-pressed={pendingOnly} onClick={() => setPendingOnly((current) => !current)}>
            <svg aria-hidden="true" viewBox="0 0 20 20"><path d="M3 4h14l-5.4 6.2v4.2l-3.2 1.7v-5.9L3 4Z" /></svg>
            Pendents <span>{pending}</span>
          </button>
          {gradingMode !== 'manual' && <div className="question-review-selection-actions" aria-label="Selecció de respostes">
            <button onClick={setPendingSelection} disabled={gradingWithAi || savingManual}>Pendents</button>
            {gradingMode === 'llm' && <button onClick={setLlmSelection} disabled={gradingWithAi || savingManual}>Avaluades amb LLM</button>}
            <button onClick={selectAllAnswers} disabled={gradingWithAi || savingManual}>Totes</button>
            <button onClick={() => setSelectedAnswerIds([])} disabled={!selectedAnswerIds.length || gradingWithAi || savingManual}>Cap</button>
          </div>}
        </div>
        <span className="question-review-result-count">{visibleAnswers.length} de {answers.length} respostes</span>
      </div>
      {actionMessage && <p className="question-review-action-message" role="status">{actionMessage}</p>}
      {gradingMode === 'llm' && supportsAiGrading && (
        <section className="question-ai-grading">
          <label className="question-ai-criteria">Criteris de correcció
            <textarea maxLength={5000} value={criteria} onChange={(event) => setCriteria(event.target.value)} />
          </label>
          <div className="question-ai-options">
            {models.length > 1 && (
              <label className="question-ai-model">Model
                <select value={selectedModel} onChange={(event) => setModel(event.target.value)} disabled={gradingWithAi}>
                  {models.map((name) => <option key={name} value={name}>{name}{name === models[0] ? ' (per defecte)' : ''}</option>)}
                </select>
              </label>
            )}
            <label className="question-ai-model">
              <input type="checkbox" checked={webSearch} disabled={gradingWithAi} onChange={(event) => setWebSearch(event.target.checked)} />
              Permetre cerca web al model
            </label>
          </div>
          <div className="question-ai-selection" aria-live="polite">
            <strong>Respostes que s’enviaran ({selectedLlmAnswers.length})</strong>
            {selectedLlmAnswers.length ? (
              <ul>{selectedLlmAnswers.map((answer) => (
                <li key={answer.id}>
                  <b>{answer.attempt.user.name || answer.attempt.user.email}</b>
                  <span>{answer.needsReview ? 'Pendent' : 'Ja corregida; reavaluació sol·licitada'}</span>
                  <div className="question-ai-answer"><AnswerValue answer={answer} question={data.question} /></div>
                </li>
              ))}</ul>
            ) : <p>Cap resposta seleccionada.</p>}
          </div>
          <div className="question-ai-actions">
            <button className="secondary" onClick={saveCriteria} disabled={!criteriaChanged || savingCriteria || gradingWithAi}>
              {savingCriteria ? 'Desant criteris…' : 'Desa criteris'}
            </button>
            <button onClick={evaluateSelectedWithLlm} disabled={!selectedLlmAnswers.length || selectionLimitExceeded || savingCriteria || gradingWithAi}>
              {gradingWithAi ? 'Avaluant selecció…' : `Avalua ${selectedLlmAnswers.length} seleccionades`}
            </button>
            <span className="muted">{gradingWithAi ? 'S’està enviant aquesta selecció; no es pot modificar durant la crida.' : selectionLimitExceeded ? 'Màxim de 100 respostes per crida. Redueix la selecció per continuar.' : 'Les propostes no es desen fins que les revisis.'}</span>
          </div>
          {actionError && <p className="error">{actionError}</p>}
        </section>
      )}
      {gradingMode === 'bulk' && (
        <section className="question-ai-grading question-bulk-grading">
          <label className="question-ai-criteria">Puntuació comuna
            <input type="number" min="0" max={data.question.points} step="0.25" value={bulkScore} onChange={(event) => setBulkScore(event.target.value)} disabled={savingManual} />
          </label>
          <label className="question-ai-criteria">Comentari comú
            <textarea rows="2" maxLength={2000} value={bulkFeedback} onChange={(event) => setBulkFeedback(event.target.value)} disabled={savingManual} />
          </label>
          <div className="question-ai-selection" aria-live="polite">
            <strong>La mateixa correcció s’aplicarà a {selectedAnswers.length} respostes</strong>
            <ul>{selectedAnswers.map((answer) => (
              <li key={answer.id}>
                <b>{answer.attempt.user.name || answer.attempt.user.email}</b>
                <span>{answer.needsReview ? 'Pendent' : 'Ja corregida; la nota se substituirà'}</span>
                <div className="question-bulk-answer-value"><AnswerValue answer={answer} question={data.question} /></div>
              </li>
            ))}</ul>
          </div>
          <div className="question-ai-actions">
            <button onClick={gradeSelectedManually} disabled={!bulkScoreIsValid || selectionLimitExceeded || savingManual || gradingWithAi}>
              {savingManual ? 'Desant correccions…' : `Aplica a ${selectedAnswers.length} respostes`}
            </button>
            <span className="muted">La puntuació substitueix la nota actual de totes les respostes seleccionades.</span>
          </div>
          {selectionLimitExceeded && <p className="error">Màxim de 100 respostes per desament.</p>}
          {actionError && <p className="error">{actionError}</p>}
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
                  {(
                    <input
                      className="question-answer-select"
                      type="checkbox"
                      checked={selectedAnswerIds.includes(answer.id)}
                      disabled={gradingWithAi || savingManual || (gradingMode === 'llm' && !selectableAnswerIds.has(answer.id))}
                      aria-label={`Selecciona la resposta de ${answer.attempt.user.name || answer.attempt.user.email}`}
                      title="Selecciona resposta"
                      onChange={() => gradingMode === 'manual' ? selectManualAnswer(answer.id) : toggleAnswerSelection(answer.id)}
                    />
                  )}
                  <b>{answer.attempt.user.name || answer.attempt.user.email}</b>
                  <span>{new Date(answer.attempt.submittedAt).toLocaleString()}</span>
                </div>
                <div className="question-answer-header-actions">
                  <span className={`question-answer-state${!answer.needsReview ? ' is-reviewed' : ''}`}>
                    {answer.llmReviewed ? 'Avaluada amb LLM' : answer.needsReview ? 'Pendent de correcció' : answer.manuallyReviewed ? 'Revisada pel professor' : 'Puntuada'}
                  </span>
                  <span className={`question-answer-score${answer.score == null ? ' is-pending' : ''}`}>
                    {answer.score == null ? 'Sense nota' : `${formatGrade(answer.score)} / ${formatGrade(data.question.points)}`}
                  </span>
                  {answer.llmRun && (
                    <button
                      type="button"
                      className="question-answer-llm-detail"
                      title="Veure la correcció del model"
                      onClick={(event) => { event.stopPropagation(); setLlmDetail(answer); }}
                    >
                      Detall LLM
                    </button>
                  )}
                  <Link to={`/t/attempt/${answer.attemptId}`}>Obre l'intent ↗</Link>
                </div>
              </header>
              {answer.linkedAnswer && (
                <div className="review-linked-answer">
                  <span className="eyebrow">RESPOSTA ANTERIOR ENLLAÇADA</span>
                  <div className="review-linked-question"><MarkdownText>{answer.linkedAnswer.question.text}</MarkdownText></div>
                  <AnswerValue answer={{ ...answer, value: answer.linkedAnswer.value, fileUrl: answer.linkedAnswer.fileUrl }} question={answer.linkedAnswer.question} />
                </div>
              )}
              <div className="question-answer-content"><AnswerValue answer={answer} question={data.question} /></div>
              {answer.feedback && (
                <div className="question-answer-feedback">
                  <span className="eyebrow">COMENTARI DEL PROFESSOR</span>
                  <p>{answer.feedback}</p>
                </div>
              )}
              {gradingMode === 'manual' && selectedAnswerIds.includes(answer.id) && (
                <AnswerReviewForm answer={answer} question={data.question} onDone={() => answerSaved(answer.id)} />
              )}
            </article>
          ))}
        </div>
      )}
      {llmDetail && <LlmRunModal answer={llmDetail} question={data.question} onClose={() => setLlmDetail(null)} />}
    </div>
  );
}
