import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl } from '../api';
import QuestionInput, { ImageWithPoints } from '../components/QuestionInput.jsx';

function AnswerBlock({ label, children, tone }) {
  return (
    <div className={`answer-block${tone ? ` answer-${tone}` : ''}`}>
      <span className="answer-label">{label}</span>
      <div>{children || <span className="muted">Sense resposta</span>}</div>
    </div>
  );
}

function QuestionResult({ q }) {
  const value = q.value;
  const key = q.answerKey || {};
  const options = q.config?.options || [];
  const scoreTone = q.score == null ? 'pending' : q.score >= q.points ? 'correct' : q.score > 0 ? 'partial' : 'incorrect';
  const status = q.score == null ? 'Pendent de correcció' : q.score >= q.points ? 'Correcte' : q.score > 0 ? 'Parcialment correcte' : 'Per revisar';

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
                  {isSelected && <span className="answer-tag">La teva tria</span>}
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
    case 'IMAGE_LABEL':
      answers = (
        <div className="answer-image-labels">
          {q.imageUrl && <ImageWithPoints src={fileUrl(q.imageUrl)} points={q.config?.points || []} />}
          <div className="answer-matches">
            {(q.config?.points || []).map((point, index) => {
              const selected = value?.[point.id];
              const expected = key.labels?.[point.id];
              const isCorrect = String(selected ?? '').trim().toLocaleLowerCase() === String(expected ?? '').trim().toLocaleLowerCase();
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
    case 'SHORT_TEXT':
      answers = (
        <div className="answer-columns">
          <AnswerBlock label="La teva resposta" tone={scoreTone === 'correct' ? 'correct' : scoreTone === 'pending' ? '' : 'incorrect'}>{value}</AnswerBlock>
          <AnswerBlock label="Respostes acceptades" tone="correct">{(key.accepted || []).join(' · ')}</AnswerBlock>
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
    default:
      answers = <AnswerBlock label="La teva resposta">{value == null ? null : String(value)}</AnswerBlock>;
  }

  return (
    <div className="card stack result-question">
      <div className="row between result-heading">
        <b>{q.text}</b>
        <span className={`result-score result-${scoreTone}`}>{q.score ?? '—'} / {q.points} · {status}</span>
      </div>
      {answers}
      {q.feedback && <div className="result-feedback"><strong>Comentari del professorat</strong><p>{q.feedback}</p></div>}
    </div>
  );
}

function Result({ result }) {
  if (!result.visible) return <p>Entrega enviada. Els resultats encara no estan disponibles.</p>;
  return (
    <div className="stack">
      <p>
        {result.status === 'NEEDS_REVIEW' ? 'Pendent de correcció manual per part del professor.' : <>Nota: <b>{result.score} / {result.maxScore}</b></>}
      </p>
      {result.questions?.map((q) => <QuestionResult q={q} key={q.id} />)}
    </div>
  );
}

export default function TakeQuiz() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: ['attempt', id], queryFn: () => api(`/api/student/attempts/${id}`) });
  const [answers, setAnswers] = useState({});
  const [missing, setMissing] = useState([]);
  const [msg, setMsg] = useState('');
  const [saveState, setSaveState] = useState('');
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
    latest.current[qid] = value;
    clearTimeout(timers.current[qid]);
    timers.current[qid] = setTimeout(() => save(qid).catch(() => {}), 600);
  };

  const submit = async () => {
    if (!confirm('Vols enviar l\'entrega? No podràs canviar les respostes.')) return;
    setMsg('');
    try {
      await Promise.all(Object.keys(timers.current).map((qid) => save(qid)));
      await api(`/api/student/attempts/${id}/submit`, { method: 'POST' });
      await qc.invalidateQueries();
    } catch (e) {
      setMissing(e.data?.missing || []);
      setMsg(e.message);
    }
  };

  if (isLoading) return <p>Carregant…</p>;
  if (error) return <p className="error">{error.message}</p>;
  if (data.status !== 'IN_PROGRESS') {
    return (
      <div className="card stack">
        <h2>{data.title}</h2>
        <Result result={data.result} />
        <Link to="/s">Tornar</Link>
      </div>
    );
  }
  return (
    <div>
      <h2>{data.title}</h2>
      {data.questions.map((q, i) => (
        <div className="card stack" key={q.id} style={missing.includes(q.id) ? { outline: '2px solid #dc2626' } : undefined}>
          <div><b>{i + 1}. {q.text}</b> {q.required && <span className="error">*</span>} <span className="muted">({q.points} pt)</span></div>
          {q.type !== 'IMAGE_LABEL' && q.imageUrl && <img src={`/api/files/${q.imageUrl}`} alt="" style={{ maxWidth: '100%' }} />}
          <QuestionInput
            q={q}
            attemptId={data.id}
            value={answers[q.id]?.value}
            fileName={answers[q.id]?.fileUrl}
            onChange={(v) => change(q.id, v)}
            onFile={(f) => setAnswers((a) => ({ ...a, [q.id]: { value: 'file', fileUrl: f } }))}
          />
        </div>
      ))}
      <div className="row">
        <button onClick={submit}>Envia l'entrega</button>
        <span className="muted">{saveState}</span>
        {msg && <span className="error">{msg}</span>}
      </div>
    </div>
  );
}
