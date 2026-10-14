import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import WorkspaceHero from '../components/WorkspaceHero.jsx';

export default function TeacherHome() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const { data, isLoading } = useQuery({ queryKey: ['quizzes'], queryFn: () => api('/api/teacher/quizzes') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['quizzes'] });
  const create = useMutation({
    mutationFn: () => api('/api/teacher/quizzes', { method: 'POST', body: { title } }),
    onSuccess: (q) => nav(`/t/quiz/${q.id}`),
  });
  const dup = useMutation({ mutationFn: (id) => api(`/api/teacher/quizzes/${id}/duplicate`, { method: 'POST' }), onSuccess: refresh });
  const del = useMutation({ mutationFn: (id) => api(`/api/teacher/quizzes/${id}`, { method: 'DELETE' }), onSuccess: refresh });

  return (
    <div>
      <WorkspaceHero eyebrow="ESPAI PROFESSORAT" title="Les teves entregues" description="Dissenya, publica i revisa activitats." />
      <div className="card row create-panel">
        <div className="create-panel-label"><span className="eyebrow">NOVA ACTIVITAT</span><span>Comença una entrega</span></div>
        <input type="text" style={{ flex: 1, width: 'auto' }} placeholder="Títol de la nova entrega" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>Crea entrega <span aria-hidden="true">↗</span></button>
      </div>
      <div className="panel-heading list-heading"><div><span className="eyebrow">BIBLIOTECA</span><h2>Activitats creades</h2></div><span className="panel-index">02 / GESTIÓ</span></div>
      {isLoading && <p>Carregant…</p>}
      {!isLoading && !data?.length && <div className="card empty-state">Encara no has creat cap entrega.</div>}
      {data?.map((q) => (
        <div className="card row between quiz-row" key={q.id}>
          <div>
            <Link to={`/t/quiz/${q.id}`}><b>{q.title}</b></Link>{' '}
            <span className="badge">{q.published ? 'Publicada' : 'Esborrany'}</span>
            <div className="muted">{q._count.questions} preguntes · {q._count.attempts} intents{q.classroomCourseWorkId && ' · Classroom'}</div>
          </div>
          <div className="row">
            <Link to={`/t/quiz/${q.id}/attempts`}>Intents</Link>
            <button className="secondary" onClick={() => dup.mutate(q.id)}>Duplica</button>
            <button className="danger" onClick={() => confirm('Esborrar l\'entrega i tots els intents?') && del.mutate(q.id)}>Esborra</button>
          </div>
        </div>
      ))}
    </div>
  );
}
