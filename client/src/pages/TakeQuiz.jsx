import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl } from '../api';
import QuestionInput, { ImageWithPoints } from '../components/QuestionInput.jsx';
import DrawingBoard from '../components/DrawingBoard.jsx';
import MarkdownText from '../components/MarkdownText.jsx';
import { formatGrade } from '../formatGrade.js';
import { usePrompt } from '../components/PromptProvider.jsx';
import PagedQuestions, { QuestionFlow } from '../components/QuestionBlocks.jsx';
import { buildPages, invalidNumericFields, isAnswered, isNumericAnswer } from '../layout.js';

const sameNumber = (first, second) => {
  if (!isNumericAnswer(first) || !isNumericAnswer(second)) return false;
  return Number(String(first).trim().replace(',', '.')) === Number(String(second).trim().replace(',', '.'));
};

function AnswerBlock({ label, children, tone }) {
  return (
    <div className={`answer-block${tone ? ` answer-${tone}` : ''}`}>
      <span className="answer-label">{label}</span>
      <div>{children || <span className="muted">Sense resposta</span>}</div>
    </div>
  );
}

function PlainAnswer({ q, value }) {
  const text = (list, id) => q.config?.[list]?.find((x) => x.id === id)?.text ?? id;
  switch (q.type) {
    case 'MCQ': return (Array.isArray(value) ? value : []).map((v) => text('options', v)).join(', ');
    case 'TRUE_FALSE': return value == null ? null : value ? 'Cert' : 'Fals';
    case 'MATCHING': return value ? <ul>{Object.entries(value).map(([l, r]) => <li key={l}>{text('left', l)} → {text('right', r)}</li>)}</ul> : null;
    case 'ORDERING': return Array.isArray(value) ? <ol>{value.map((id) => <li key={id}>{text('items', id)}</li>)}</ol> : null;
    case 'FILL_BLANKS': return Array.isArray(value) ? <ol>{value.map((v, i) => <li key={i}>{v || '—'}</li>)}</ol> : null;
    case 'IMAGE_LABEL': return (
      <div className="answer-image-labels">
        {q.imageUrl && <ImageWithPoints src={fileUrl(q.imageUrl)} points={q.config?.points || []} />}
        <ul>{(q.config?.points || []).map((p, i) => <li key={p.id}>{i + 1}: {value?.[p.id] || '—'}</li>)}</ul>
      </div>
    );
    case 'IMAGE_UPLOAD': return q.fileUrl ? <img className="answer-upload" src={fileUrl(q.fileUrl)} alt="Imatge enviada per l’alumne" /> : null;
    case 'DRAWING': return value?.strokes?.length ? <DrawingBoard src={fileUrl(q.imageUrl)} color={q.config?.color} width={q.config?.width} value={value} readOnly /> : null;
    default: return value == null ? null : String(value);
  }
}

function QuestionResult({ q, index, inGroup }) {
  const cardClass = `${inGroup ? 'group-question' : 'card'} stack result-question`;
  if (!q.answerKey) {
    return (
      <div className={cardClass} key={q.id}>
        <div className="review-question-title"><span className="review-question-number">{String(index + 1).padStart(2, '0')}</span><MarkdownText>{q.text}</MarkdownText></div>
        <AnswerBlock label="La teva resposta"><PlainAnswer q={q} value={q.value} /></AnswerBlock>
      </div>
    );
  }
  const value = q.value;
  const key = q.answerKey || {};
  const options = q.config?.options || [];
  const scoreTone = q.score == null ? 'pending' : q.score >= q.points ? 'correct' : q.score > 0 ? 'partial' : 'incorrect';
  const status = q.score == null ? 'Pendent de correcció' : q.score >= q.points ? 'Correcte' : q.score > 0 ? 'Parcialment correcte' : 'Incorrecte';

  let answers;
  switch (q.type) {
    case 'MCQ': {
      const selected = new Set(Array.isArray(value) ? value : []);
      const correct = new Set(key.correct || []);
      answers = (
        <div className="answer-options">
          {options.map((option) => {
            const isSelected = selected.has(option.id);
            const isCorrect = correct.has(option.id);
            return (
              <div className={`answer-option${isCorrect ? ' answer-correct' : isSelected ? ' answer-incorrect' : ''}`} key={option.id}>
                <span>{option.text}</span>
                <span className="answer-option-tags">
                  {isSelected && <span className="answer-tag">Has respost</span>}
                  {isCorrect && <span className="answer-tag">Correcta</span>}
                </span>
              </div>
            );
          })}
        </div>
      );
      break;
    }
    case 'TRUE_FALSE':
      answers = (
        <div className="answer-columns">
          <AnswerBlock label="La teva resposta" tone={value === key.correct ? 'correct' : 'incorrect'}>{value == null ? null : value ? 'Cert' : 'Fals'}</AnswerBlock>
          <AnswerBlock label="Resposta correcta" tone="correct">{key.correct ? 'Cert' : 'Fals'}</AnswerBlock>
        </div>
      );
      break;
    case 'MATCHING':
      answers = (
        <div className="answer-matches">
          {(q.config?.left || []).map((left) => {
            const expectedId = key.pairs?.[left.id];
            const selectedId = value?.[left.id];
            const expected = q.config?.right?.find((right) => right.id === expectedId)?.text;
            const selected = q.config?.right?.find((right) => right.id === selectedId)?.text;
            const isCorrect = selectedId === expectedId;
            return (
              <div className={`answer-match${isCorrect ? ' answer-correct' : ' answer-incorrect'}`} key={left.id}>
                <strong>{left.text}</strong>
                <span>{selected || 'Sense resposta'}</span>
                {!isCorrect && <span className="answer-expected">Correcte: {expected || '—'}</span>}
              </div>
            );
          })}
        </div>
      );
      break;
    case 'ORDERING': {
      const orderedIds = Array.isArray(value) ? value : [];
      const correctOrder = key.order || [];
      answers = (
        <div className="answer-columns">
          <AnswerBlock label="El teu ordre" tone={scoreTone === 'correct' ? 'correct' : scoreTone === 'pending' ? '' : 'incorrect'}>
            <ol>{orderedIds.map((id) => <li key={id}>{q.config?.items?.find((item) => item.id === id)?.text ?? id}</li>)}</ol>
          </AnswerBlock>
          <AnswerBlock label="Ordre correcte" tone="correct">
            <ol>{correctOrder.map((id) => <li key={id}>{q.config?.items?.find((item) => item.id === id)?.text ?? id}</li>)}</ol>
          </AnswerBlock>
        </div>
      );
      break;
    }
    case 'IMAGE_LABEL':
      answers = (
        <div className="answer-image-labels">
          {q.imageUrl && <ImageWithPoints src={fileUrl(q.imageUrl)} points={q.config?.points || []} />}
          <div className="answer-matches">
            {(q.config?.points || []).map((point, index) => {
              const selected = value?.[point.id];
              const expected = key.labels?.[point.id];
              const isCorrect = point.numeric
                ? sameNumber(selected, expected)
                : String(selected ?? '').trim().toLocaleLowerCase() === String(expected ?? '').trim().toLocaleLowerCase();
              return (
                <div className={`answer-match${isCorrect ? ' answer-correct' : ' answer-incorrect'}`} key={point.id}>
                  <strong>Punt {index + 1}</strong>
                  <span>{selected || 'Sense resposta'}</span>
                  {!isCorrect && <span className="answer-expected">Correcte: {expected || '—'}</span>}
                </div>
              );
            })}
          </div>
        </div>
      );
      break;
    case 'FILL_BLANKS':
      answers = (
        <div className="answer-matches">
          {(key.blanks || []).map((accepted, index) => {
            const given = Array.isArray(value) ? value[index] : '';
            const norm = (s) => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
            const isCorrect = q.config?.numericBlanks?.[index]
              ? accepted.some((a) => sameNumber(a, given))
              : accepted.some((a) => norm(a) === norm(given));
            return (
              <div className={`answer-match${isCorrect ? ' answer-correct' : ' answer-incorrect'}`} key={index}>
                <strong>Buit {index + 1}</strong>
                <span>{given || 'Sense resposta'}</span>
                {!isCorrect && <span className="answer-expected">Correcte: {accepted.join(' / ')}</span>}
              </div>
            );
          })}
        </div>
      );
      break;
    case 'SHORT_TEXT':
      answers = (
        <div className="answer-columns">
          <AnswerBlock label="La teva resposta" tone={scoreTone === 'correct' ? 'correct' : scoreTone === 'pending' ? '' : 'incorrect'}>{value}</AnswerBlock>
          <AnswerBlock label="Respostes acceptades" tone="correct">{(key.accepted || []).join(' · ')}</AnswerBlock>
        </div>
      );
      break;
    case 'CALCULATED':
      answers = (
        <div className="answer-columns">
          <AnswerBlock label="La teva resposta" tone={scoreTone === 'correct' ? 'correct' : scoreTone === 'pending' ? '' : 'incorrect'}>{value}</AnswerBlock>
          <AnswerBlock label="Resposta correcta" tone="correct">{key.expected}</AnswerBlock>
        </div>
      );
      break;
    case 'LONG_TEXT':
      answers = (
        <div className="answer-columns">
          <AnswerBlock label="La teva resposta">{value}</AnswerBlock>
          {key.reference && <AnswerBlock label="Resposta de referència" tone="correct">{key.reference}</AnswerBlock>}
        </div>
      );
      break;
    case 'IMAGE_UPLOAD':
      answers = q.fileUrl
        ? <AnswerBlock label="Imatge enviada"><img className="answer-upload" src={fileUrl(q.fileUrl)} alt="Imatge enviada per l’alumne" /></AnswerBlock>
        : <AnswerBlock label="Resposta">{value ? 'Imatge enviada' : null}</AnswerBlock>;
      break;
    case 'DRAWING':
      answers = <AnswerBlock label="El teu dibuix">{value?.strokes?.length ? <DrawingBoard src={fileUrl(q.imageUrl)} color={q.config?.color} width={q.config?.width} value={value} readOnly /> : null}</AnswerBlock>;
      break;
    default:
      answers = <AnswerBlock label="La teva resposta">{value == null ? null : String(value)}</AnswerBlock>;
  }

  return (
    <div className={cardClass}>
      <div className="row between result-heading">
        <div className="review-question-title"><span className="review-question-number">{String(index + 1).padStart(2, '0')}</span><MarkdownText>{q.text}</MarkdownText></div>
        <span className={`result-score result-${scoreTone}`}>{formatGrade(q.score)} / {formatGrade(q.points)} · {status}</span>
      </div>
      {answers}
      {q.feedback && <div className="result-feedback"><strong>Comentari de correcció</strong><p>{q.feedback}</p></div>}
    </div>
  );
}

function Result({ result, title }) {
  if (!result.visible) {
    return (
      <div className="attempt-review">
        <header className="review-summary">
          <div className="review-student"><span className="eyebrow">RESULTAT D'INTENT</span><h1>{title}</h1></div>
        </header>
        <p>Entrega enviada. Els resultats encara no estan disponibles.</p>
      </div>
    );
  }
  const status = { NEEDS_REVIEW: 'Pendent de correcció', GRADED: 'Corregit', SUBMITTED: 'Enviat' }[result.status] || result.status;
  return (
    <div className="attempt-review">
      <header className="review-summary">
        <div className="review-student">
          <span className="eyebrow">RESULTAT D'INTENT</span>
          <h1>{title}</h1>
        </div>
        <div className="review-metrics">
          <div className="review-metric"><span>ESTAT</span><b>{status}</b></div>
          <div className={`review-metric review-total-score${result.score != null && result.score <= 0 ? ' is-negative' : ''}`}><span>NOTA</span><b>{formatGrade(result.score)} <i>/ {formatGrade(result.maxScore)}</i></b></div>
          <div className="review-metric"><span>PREGUNTES</span><b>{result.questionCount}</b></div>
        </div>
        {result.status === 'NEEDS_REVIEW' && <p className="review-pending-note">Pendent de correcció manual per part del professor.</p>}
      </header>
      <div className="stack">
        {result.questions && <QuestionFlow items={result.questions} groups={result.groups} render={(q, index, inGroup) => <QuestionResult q={q} index={index} inGroup={inGroup} key={q.id} />} />}
      </div>
    </div>
  );
}

export default function TakeQuiz() {
  const { id } = useParams();
  const { confirm } = usePrompt();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['attempt', id], queryFn: () => api(`/api/student/attempts/${id}`) });
  const [answers, setAnswers] = useState({});
  const [missing, setMissing] = useState([]);
  const [numericErrors, setNumericErrors] = useState({});
  const [page, setPage] = useState(0);
  const [msg, setMsg] = useState('');
  const [saveState, setSaveState] = useState('');
  const [pasteBlocked, setPasteBlocked] = useState(null);
  const timers = useRef({});
  const latest = useRef({});

  useEffect(() => {
    if (data?.answers) {
      setAnswers(data.answers);
      latest.current = {};
    }
  }, [data]);

  const save = async (qid) => {
    clearTimeout(timers.current[qid]);
    delete timers.current[qid];
    try {
      await api(`/api/student/attempts/${id}/answers/${qid}`, { method: 'PUT', body: { value: latest.current[qid] } });
      setSaveState('Guardat');
    } catch (e) {
      setSaveState('Error en guardar: ' + e.message);
      throw e;
    }
  };

  const change = (qid, value) => {
    setAnswers((a) => ({ ...a, [qid]: { ...a[qid], value } }));
    setNumericErrors((current) => {
      const next = { ...current };
      delete next[qid];
      return next;
    });
    setMissing((current) => current.filter((questionId) => questionId !== qid));
    latest.current[qid] = value;
    setPasteBlocked((current) => current?.questionId === qid ? null : current);
    setSaveState('Desant…');
    clearTimeout(timers.current[qid]);
    timers.current[qid] = setTimeout(() => save(qid).catch(() => {}), 600);
  };

  const submit = async () => {
    const invalid = Object.fromEntries(data.questions.map((question) => [question.id, invalidNumericFields(question, answers[question.id])]).filter(([, fields]) => fields.length));
    if (Object.keys(invalid).length) {
      const ids = Object.keys(invalid).map(Number);
      setNumericErrors(invalid);
      setMissing(ids);
      setMsg('Revisa els camps marcats: han de contenir un nombre vàlid.');
      const firstPage = buildPages(data.questions, data.groups).findIndex((p) => p.blocks.some((b) => (b.type === 'group' ? b.entries.map((x) => x.item) : [b.item]).some((q) => ids.includes(q.id))));
      if (firstPage >= 0) setPage(firstPage);
      return;
    }
    setNumericErrors({});
    if (!await confirm('No podràs canviar les respostes després d’enviar.', { title: 'Vols enviar l’entrega?', confirmLabel: 'Envia l’entrega' })) return;
    setMsg('');
    try {
      await Promise.all(Object.keys(timers.current).map((qid) => save(qid)));
      await api(`/api/student/attempts/${id}/submit`, { method: 'POST' });
      await qc.invalidateQueries();
    } catch (e) {
      let ids = e.data?.missing || [];
      if (e.data?.invalidNumeric) {
        const invalidFields = Object.fromEntries(e.data.invalidNumeric.map(({ questionId, fields }) => [questionId, fields]));
        setNumericErrors(invalidFields);
        ids = e.data.invalidNumeric.map(({ questionId }) => questionId);
        setMissing(ids);
        setMsg('Revisa els camps marcats: han de contenir un nombre vàlid.');
      } else {
        setMissing(ids);
        setMsg(e.message);
      }
      const firstPage = buildPages(data.questions, data.groups).findIndex((p) => p.blocks.some((b) => (b.type === 'group' ? b.entries.map((x) => x.item) : [b.item]).some((q) => ids.includes(q.id))));
      if (firstPage >= 0) setPage(firstPage);
    }
  };

  if (isLoading) return <p>Carregant…</p>;
  if (error) return <p className="error">{error.message}</p>;
  if (data.status !== 'IN_PROGRESS') {
    return (
      <div>
        <title>{data.title}</title>
        <Result result={data.result} title={data.title} />
        <Link to="/s">Tornar</Link>
      </div>
    );
  }
  const renderQuestion = (q, i, inGroup) => (
    <div
      className={`${inGroup ? 'group-question' : 'card'} stack`}
      key={q.id}
      style={missing.includes(q.id) ? { outline: '2px solid #dc2626' } : undefined}
      onCopy={q.config?.allowClipboard ? undefined : (event) => event.preventDefault()}
      onCut={q.config?.allowClipboard ? undefined : (event) => event.preventDefault()}
    >
      <div
        className={q.config?.allowClipboard ? undefined : 'take-quiz-question-prompt'}
        onContextMenu={q.config?.allowClipboard ? undefined : (event) => event.preventDefault()}
      >
        <div className="review-question-title">
          <span className="review-question-number">{String(i + 1).padStart(2, '0')}</span>
          <div className="review-question-text">{q.type !== 'FILL_BLANKS' && <MarkdownText>{q.text}</MarkdownText>} {q.required && <span className="error">*</span>} <span className="muted">({formatGrade(q.points)} pt)</span></div>
        </div>
      </div>
      {q.type !== 'IMAGE_LABEL' && q.type !== 'DRAWING' && q.imageUrl && <img src={`/api/files/${q.imageUrl}`} alt="" style={{ maxWidth: '100%' }} />}
      <div className="question-response">
        <QuestionInput
          q={q}
          numericErrors={numericErrors[q.id] || []}
          attemptId={data.id}
          value={answers[q.id]?.value}
          fileName={answers[q.id]?.fileUrl}
          pasteBlockedField={pasteBlocked?.questionId === q.id ? pasteBlocked.field : null}
          onPasteBlocked={(field) => setPasteBlocked({ questionId: q.id, field })}
          onChange={(v) => change(q.id, v)}
          onFile={(f) => setAnswers((a) => ({ ...a, [q.id]: { value: 'file', fileUrl: f } }))}
        />
      </div>
    </div>
  );
  return (
    <div className="take-quiz">
      <title>{data.title}</title>
      <header className="take-quiz-header">
        <h2>{data.title}</h2>
        <p className={`take-quiz-save-state${saveState.startsWith('Error') ? ' is-error' : ''}`} aria-live="polite">
          {saveState || 'Les respostes es desen automàticament.'}
        </p>
      </header>
      <PagedQuestions
        pages={buildPages(data.questions, data.groups)}
        page={page}
        onPage={setPage}
        render={renderQuestion}
        isIncomplete={(q) => q.required && !isAnswered(q, answers[q.id])}
        flagAll={missing.length > 0}
        footer={(
          <div className="take-quiz-finish">
            <div className="take-quiz-finish-copy">
              <h3>Finalitza l'entrega</h3>
              <p className="muted">Quan l'enviïs, ja no podràs modificar les respostes.</p>
            </div>
            <div className="take-quiz-finish-actions">
              {msg && <p className="error" role="alert">{msg}</p>}
              <button onClick={submit}>Envia l'entrega</button>
            </div>
          </div>
        )}
      />
    </div>
  );
}
