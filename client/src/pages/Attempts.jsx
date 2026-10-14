import React from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

const label = { NEEDS_REVIEW: 'Pendent de correcció', GRADED: 'Corregida', SUBMITTED: 'Enviada' };

export default function Attempts() {
  const { id } = useParams();
  const { data, isLoading } = useQuery({ queryKey: ['attempts', id], queryFn: () => api(`/api/teacher/quizzes/${id}/attempts`) });
  if (isLoading) return <p>Carregant…</p>;
  return (
    <div className="card">
      <p><Link to={`/t/quiz/${id}`}>← Entrega</Link></p>
      <h2>Intents</h2>
      <table>
        <thead><tr><th>Alumne</th><th>Enviat</th><th>Estat</th><th>Nota</th><th>Classroom</th><th /></tr></thead>
        <tbody>
          {data.map((a) => (
            <tr key={a.id}>
              <td>{a.user.name || a.user.email}</td>
              <td>{new Date(a.submittedAt).toLocaleString()}</td>
              <td>{label[a.status]}</td>
              <td>{a.score ?? '—'}</td>
              <td>{a.exportedAt ? '✓' : ''}</td>
              <td><Link to={`/t/attempt/${a.id}`}>Revisa</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
