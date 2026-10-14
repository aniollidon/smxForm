import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

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
      <div className="card row">
        <input type="text" style={{ flex: 1, width: 'auto' }} placeholder="Títol de la nova entrega" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>Crea entrega</button>
      </div>
      {isLoading && <p>Carregant…</p>}
      {data?.map((q) => (
        <div className="card row between" key={q.id}>
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
