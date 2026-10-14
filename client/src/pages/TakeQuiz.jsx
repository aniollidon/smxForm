import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import QuestionInput from '../components/QuestionInput.jsx';

function Result({ result }) {
  if (!result.visible) return <p>Entrega enviada. Els resultats encara no estan disponibles.</p>;
  return (
    <div className="stack">
      <p>
        {result.status === 'NEEDS_REVIEW' ? 'Pendent de correcció manual per part del professor.' : <>Nota: <b>{result.score} / {result.maxScore}</b></>}
      </p>
      {result.questions?.map((q) => (
        <div className="card" key={q.id}>
          <b>{q.text}</b> <span className="badge">{q.score ?? '?'} / {q.points}</span>
          <pre className="muted" style={{ whiteSpace: 'pre-wrap' }}>La teva resposta: {JSON.stringify(q.value)}{'\n'}Resposta correcta: {JSON.stringify(q.answerKey)}</pre>
          {q.feedback && <p>Comentari: {q.feedback}</p>}
        </div>
      ))}
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
