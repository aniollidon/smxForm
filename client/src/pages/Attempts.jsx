import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { formatGrade } from '../formatGrade.js';
import { usePrompt } from '../components/PromptProvider.jsx';

const label = { NEEDS_REVIEW: 'Pendent de correcció', GRADED: 'Corregida', SUBMITTED: 'Enviada' };

export default function Attempts() {
  const { id } = useParams();
  const { data, isLoading } = useQuery({ queryKey: ['attempts', id], queryFn: () => api(`/api/teacher/quizzes/${id}/attempts`) });
  const qc = useQueryClient();
  const { confirm } = usePrompt();
  const del = useMutation({
    mutationFn: (aid) => api(`/api/teacher/attempts/${aid}`, { method: 'DELETE' }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['attempts', id] }),
  });
  const removeAttempt = async (attempt) => {
    const accepted = await confirm(
      <>Intent de <strong>{attempt.user.name || attempt.user.email}</strong> enviat el {new Date(attempt.submittedAt).toLocaleString()}. S'esborraran també totes les respostes i la nota. Aquesta acció no es pot desfer.</>,
      { title: 'Esborrar l’intent?', confirmLabel: 'Esborra', danger: true },
    );
    if (accepted) del.mutate(attempt.id);
  };
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
              <td>{formatGrade(a.score)}</td>
              <td>{a.exportedAt ? '✓' : ''}</td>
              <td>
                <Link to={`/t/attempt/${a.id}`}>Revisa</Link>{' '}
                <details className="row-menu">
                  <summary aria-label="Més opcions" title="Més opcions">⋯</summary>
                  <div className="row-menu-popover">
                    <button type="button" onClick={(e) => { e.currentTarget.closest('details').open = false; removeAttempt(a); }}>Esborra l'intent</button>
                  </div>
                </details>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
