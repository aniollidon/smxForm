import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { fileUrl } from '../api';
import QuestionEditor from '../components/QuestionEditor.jsx';
import { TYPE_LABELS, emptyDraft, fromQuestion } from '../questionModel';
import { blobToDataUri, exportQuiz } from '../portableQuiz.js';

const toLocal = (iso) => (iso ? new Date(new Date(iso) - new Date(iso).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

function Settings({ quiz, onSaved }) {
  const [f, setF] = useState(null);
  const [msg, setMsg] = useState('');
  useEffect(() => setF({ ...quiz, showResultsFrom: toLocal(quiz.showResultsFrom) }), [quiz]);
  if (!f) return null;
  const set = (p) => setF((x) => ({ ...x, ...p }));
  const check = (k, label) => <label><input type="checkbox" checked={f[k]} onChange={(e) => set({ [k]: e.target.checked })} /> {label}</label>;
  const save = async () => {
    try {
      await api(`/api/teacher/quizzes/${quiz.id}`, {
        method: 'PUT',
        body: {
          title: f.title, description: f.description, maxScore: Number(f.maxScore), shuffleQuestions: f.shuffleQuestions,
          allowRetry: f.allowRetry, maxAttempts: f.allowRetry ? Number(f.maxAttempts) : 1, negativePenalty: Number(f.negativePenalty),
          gradeToExport: f.gradeToExport, showResults: f.showResults, published: f.published,
          showResultsFrom: f.showResultsFrom ? new Date(f.showResultsFrom).toISOString() : null,
        },
      });
      setMsg('Desat');
      onSaved();
    } catch (e) {
      setMsg(e.message);
    }
  };
  return (
    <div className="card stack">
      <h3>Configuració</h3>
      <label>Títol<input type="text" value={f.title} onChange={(e) => set({ title: e.target.value })} /></label>
      <label>Descripció<textarea value={f.description} onChange={(e) => set({ description: e.target.value })} /></label>
      <div className="row">
        <label>Nota màxima <input type="number" min="1" step="0.5" value={f.maxScore} onChange={(e) => set({ maxScore: e.target.value })} /></label>
        <label>Penalització per error (fracció dels punts, 0 = no resta) <input type="number" min="0" max="1" step="0.05" value={f.negativePenalty} onChange={(e) => set({ negativePenalty: e.target.value })} /></label>
      </div>
      {check('shuffleQuestions', 'Ordre de preguntes aleatori')}
      {check('allowRetry', 'Es pot repetir l\'entrega')}
      {f.allowRetry && (
        <div className="row">
          <label>Intents màxims <input type="number" min="1" value={f.maxAttempts} onChange={(e) => set({ maxAttempts: e.target.value })} /></label>
          <label>Nota a exportar
            <select value={f.gradeToExport} onChange={(e) => set({ gradeToExport: e.target.value })}>
              <option value="BEST">La més alta</option>
              <option value="LAST">L'última</option>
            </select>
          </label>
        </div>
      )}
      <div className="row">
        <label>L'alumne veu
          <select value={f.showResults} onChange={(e) => set({ showResults: e.target.value })}>
            <option value="NONE">Res</option>
            <option value="SCORE">Només la nota</option>
          </select>
        </label>
        <label>A partir de (opcional) <input type="datetime-local" value={f.showResultsFrom} onChange={(e) => set({ showResultsFrom: e.target.value })} /></label>
      </div>
      {check('published', 'Publicada (l\'enllaç funciona)')}
      <div className="row"><button onClick={save}>Desa</button><span className="muted">{msg}</span></div>
    </div>
  );
}

function ClassroomPanel({ quiz, onSaved }) {
  const { data: me } = useQuery({ queryKey: ['t-me'], queryFn: () => api('/api/teacher/me') });
  const [courses, setCourses] = useState(null);
  const [course, setCourse] = useState('');
  const [msg, setMsg] = useState('');
  const [results, setResults] = useState(null);
  const [ret, setRet] = useState(false);
  const run = async (fn) => {
    setMsg('');
    try { await fn(); } catch (e) { setMsg(e.message); }
  };
  if (!me) return null;
  return (
    <div className="card stack">
      <h3>Google Classroom</h3>
      {!me.classroomConnected ? (
        <a href="/auth/classroom"><button>Connecta amb Classroom</button></a>
      ) : (
        <>
          {quiz.classroomCourseWorkId ? (
            <p className="ok">Vinculada a la tasca {quiz.classroomCourseWorkId} (curs {quiz.classroomCourseId}). Publica la tasca al Classroom perquè els alumnes hi accedeixin.</p>
          ) : (
            <div className="row">
              <button className="secondary" onClick={() => run(async () => { const c = await api('/api/teacher/classroom/courses'); setCourses(c); setCourse(c[0]?.id || ''); })}>Carrega cursos</button>
              {courses && (
                <>
                  <select style={{ width: 'auto' }} value={course} onChange={(e) => setCourse(e.target.value)}>
                    {courses.map((c) => <option key={c.id} value={c.id}>{c.name}{c.section ? ` (${c.section})` : ''}</option>)}
                  </select>
                  <button disabled={!course} onClick={() => run(async () => {
                    await api(`/api/teacher/quizzes/${quiz.id}/classroom`, { method: 'POST', body: { courseId: course } });
                    onSaved();
                  })}>Crea la tasca «{quiz.title}»</button>
                </>
              )}
            </div>
          )}
          {quiz.classroomCourseWorkId && (
            <div className="row">
              <label><input type="checkbox" checked={ret} onChange={(e) => setRet(e.target.checked)} /> Retorna les tasques als alumnes</label>
              <button disabled={quiz.gradingStatus?.needsRegrade > 0 || quiz.gradingStatus?.pendingReview > 0} onClick={() => run(async () => setResults(await api(`/api/teacher/quizzes/${quiz.id}/export`, { method: 'POST', body: { returnToStudents: ret } })))}>
                {quiz.gradingStatus?.classroomUpdates > 0 ? 'Actualitza notes a Classroom' : 'Exporta notes'}
              </button>
              {quiz.gradingStatus?.needsRegrade > 0 && <span className="muted">Reavalua els intents abans d’exportar les notes.</span>}
              {quiz.gradingStatus?.pendingReview > 0 && <span className="muted">Revisa les respostes manuals abans d’actualitzar les notes.</span>}
            </div>
          )}
        </>
      )}
      {msg && <p className="error">{msg}</p>}
      {results && (
        <table>
          <tbody>
            {results.map((r) => <tr key={r.email}><td>{r.email}</td><td>{r.score}</td><td className={r.ok ? 'ok' : 'error'}>{r.ok ? 'OK' : r.error}</td></tr>)}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function QuizEditor() {
  const { id } = useParams();
  const qc = useQueryClient();
  const { data: quiz, isLoading, error } = useQuery({ queryKey: ['quiz-edit', id], queryFn: () => api(`/api/teacher/quizzes/${id}`) });
  const [editing, setEditing] = useState(null); // draft o null
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [gradeAction, setGradeAction] = useState('');
  const [gradeMessage, setGradeMessage] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['quiz-edit', id] });
  if (isLoading) return <p>Carregant…</p>;
  if (error) return <p className="error">{error.message}</p>;

  const save = async (payload, qid) => {
    await api(qid ? `/api/teacher/questions/${qid}` : `/api/teacher/quizzes/${id}/questions`, { method: qid ? 'PUT' : 'POST', body: payload });
    setEditing(null);
    refresh();
  };
  const move = async (i, d) => {
    const ids = quiz.questions.map((q) => q.id);
    [ids[i], ids[i + d]] = [ids[i + d], ids[i]];
    await api(`/api/teacher/quizzes/${id}/reorder`, { method: 'PUT', body: { ids } });
    refresh();
  };
  const del = async (qid) => {
    if (!confirm('Esborrar la pregunta?')) return;
    await api(`/api/teacher/questions/${qid}`, { method: 'DELETE' });
    refresh();
  };

  const downloadExport = async () => {
    setExporting(true);
    setExportError('');
    try {
      const images = {};
      for (const name of new Set(quiz.questions.map((question) => question.imageUrl).filter(Boolean))) {
        const response = await fetch(fileUrl(name), { credentials: 'same-origin' });
        if (!response.ok) throw new Error(`No s’ha pogut descarregar la imatge ${name}.`);
        images[name] = await blobToDataUri(await response.blob());
      }
      const blob = new Blob([JSON.stringify(exportQuiz(quiz, images), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${quiz.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'entrega'}.smxform.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error.message);
    } finally {
      setExporting(false);
    }
  };

  const regrade = async () => {
    setGradeAction('regrade');
    setGradeMessage('');
    try {
      const result = await api(`/api/teacher/quizzes/${id}/regrade`, { method: 'POST' });
      setGradeMessage(`${result.regraded} intents reavaluats; ${result.pendingReview} pendents de revisió manual.`);
      refresh();
    } catch (error) {
      setGradeMessage(error.message);
    } finally {
      setGradeAction('');
    }
  };

  const updateClassroom = async () => {
    setGradeAction('classroom');
    setGradeMessage('');
    try {
      const result = await api(`/api/teacher/quizzes/${id}/export`, { method: 'POST', body: { returnToStudents: false } });
      const succeeded = result.filter((row) => row.ok).length;
      const failed = result.filter((row) => !row.ok).length;
      setGradeMessage(`${succeeded} notes actualitzades a Classroom${failed ? `; ${failed} errors` : ''}.`);
      refresh();
    } catch (error) {
      setGradeMessage(error.message);
    } finally {
      setGradeAction('');
    }
  };

  return (
    <div>
      <p><Link to="/t">← Entregues</Link> · <Link to={`/t/quiz/${id}/attempts`}>Veure intents</Link></p>
      <p><Link className="button button-primary" to={`/t/quiz/${id}/preview`}>Visualitza el formulari ↗</Link></p>
      <div className="row export-tools">
        <button className="secondary" onClick={downloadExport} disabled={exporting}>{exporting ? 'Preparant…' : 'Exporta JSON'}</button>
        <Link to="/format">Especificació del format</Link>
        {exportError && <span className="error">{exportError}</span>}
      </div>
      {(quiz.gradingStatus?.needsRegrade > 0 || quiz.gradingStatus?.pendingReview > 0 || quiz.gradingStatus?.classroomUpdates > 0) && (
        <div className="grade-warning-panel">
          <strong>Cal actualitzar les qualificacions</strong>
          {quiz.gradingStatus.needsRegrade > 0 && <p>{quiz.gradingStatus.needsRegrade} intents s’han avaluat amb una versió anterior de les preguntes. La reavaluació pot deixar les respostes llargues pendents de revisió manual.</p>}
          {quiz.gradingStatus.pendingReview > 0 && <p>{quiz.gradingStatus.pendingReview} intents tenen respostes manuals pendents de corregir; no s’actualitzaran les notes de Classroom fins que es revisin.</p>}
          {quiz.gradingStatus.classroomUpdates > 0 && <p>Les notes ja exportades han canviat per a {quiz.gradingStatus.classroomUpdates} alumnes; actualitza-les també a Classroom.</p>}
          <div className="row">
            {quiz.gradingStatus.needsRegrade > 0 && <button disabled={!!gradeAction} onClick={regrade}>{gradeAction === 'regrade' ? 'Reavaluant…' : 'Reavalua intents'}</button>}
            {quiz.gradingStatus.classroomUpdates > 0 && quiz.classroomCourseWorkId && <button className="secondary" disabled={!!gradeAction || quiz.gradingStatus.needsRegrade > 0 || quiz.gradingStatus.pendingReview > 0} onClick={updateClassroom}>{gradeAction === 'classroom' ? 'Actualitzant…' : 'Actualitza Classroom'}</button>}
            {gradeMessage && <span className="muted">{gradeMessage}</span>}
          </div>
        </div>
      )}
      <Settings quiz={quiz} onSaved={refresh} />
      <ClassroomPanel quiz={quiz} onSaved={refresh} />
      <h3>Preguntes</h3>
      {quiz.questions.map((q, i) =>
        editing?.id === q.id ? (
          <QuestionEditor key={q.id} initial={editing} onSave={save} onCancel={() => setEditing(null)} />
        ) : (
          <div className="card row between" key={q.id}>
            <div>
              <span className="badge">{TYPE_LABELS[q.type]}</span> {i + 1}. {q.text.slice(0, 100)} <span className="muted">({q.points} pt{q.required ? ', obligatòria' : ''})</span>
            </div>
            <div className="row">
              <button className="secondary" disabled={i === 0} onClick={() => move(i, -1)}>↑</button>
              <button className="secondary" disabled={i === quiz.questions.length - 1} onClick={() => move(i, 1)}>↓</button>
              <button className="secondary" onClick={() => setEditing(fromQuestion(q))}>Edita</button>
              <button className="danger" onClick={() => del(q.id)}>✕</button>
            </div>
          </div>
        )
      )}
      {editing && !editing.id && <QuestionEditor initial={editing} onSave={save} onCancel={() => setEditing(null)} />}
      {!editing && (
        <div className="card row">
          <span>Afegeix:</span>
          {Object.entries(TYPE_LABELS).map(([t, l]) => <button key={t} className="secondary" onClick={() => setEditing(emptyDraft(t))}>{l}</button>)}
        </div>
      )}
    </div>
  );
}
