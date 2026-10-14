import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';

export default function StudentHome() {
  const { data, isLoading } = useQuery({ queryKey: ['my-attempts'], queryFn: () => api('/api/student/attempts') });
  if (isLoading) return <p>Carregant…</p>;
  return (
    <div className="card">
      <h2>Les meves entregues</h2>
      <p className="muted">Per fer una entrega nova, obre l'enllaç que t'ha donat el professor (o la tasca al Classroom).</p>
      {!data.length && <p>Encara no n'has fet cap.</p>}
      <table>
        <thead><tr><th>Entrega</th><th>Estat</th><th>Nota</th><th /></tr></thead>
        <tbody>
          {data.map((a) => (
            <tr key={a.id}>
              <td>{a.quizTitle}</td>
              <td>{a.status === 'IN_PROGRESS' ? 'En curs' : a.status === 'NEEDS_REVIEW' ? 'Pendent de correcció' : 'Corregida'}</td>
              <td>{a.score != null ? `${a.score} / ${a.maxScore}` : '—'}</td>
              <td><Link to={a.status === 'IN_PROGRESS' ? `/attempt/${a.id}` : `/q/${a.slug}`}>Obre</Link></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
