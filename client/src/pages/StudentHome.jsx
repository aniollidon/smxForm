import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api } from '../api';
import WorkspaceHero from '../components/WorkspaceHero.jsx';
import { formatGrade } from '../formatGrade.js';

export default function StudentHome() {
  const { data, isLoading } = useQuery({ queryKey: ['my-attempts'], queryFn: () => api('/api/student/attempts') });
  if (isLoading) return <p>Carregant…</p>;
  return (
    <div>
      <WorkspaceHero eyebrow="ESPAI ALUMNE" title="Les meves entregues" description="Les teves activitats, en un sol lloc." />
      <section className="card data-panel">
        <div className="panel-heading"><div><span className="eyebrow">ACTIVITAT RECENT</span><h2>Historial d'entregues</h2></div><span className="panel-index">01 / ALUMNE</span></div>
        <p className="muted">Per fer una entrega nova, obre l'enllaç que t'ha donat el professor (o la tasca al Classroom).</p>
      {!data.length ? <p className="empty-state">Encara no n'has fet cap.</p> : <table>
        <thead><tr><th>Entrega</th><th>Estat</th><th>Nota</th><th /></tr></thead>
        <tbody>
          {data.map((a) => (
            <tr key={a.id}>
              <td>{a.quizTitle}</td>
              <td>{a.status === 'IN_PROGRESS' ? 'En curs' : a.status === 'NEEDS_REVIEW' ? 'Pendent de correcció' : 'Corregida'}</td>
              <td>{a.score != null ? `${formatGrade(a.score)} / ${formatGrade(a.maxScore)}` : '—'}</td>
              <td><Link to={a.status === 'IN_PROGRESS' ? `/attempt/${a.id}` : `/q/${a.slug}`}>Obre</Link></td>
            </tr>
          ))}
        </tbody>
      </table>}
      </section>
    </div>
  );
}
