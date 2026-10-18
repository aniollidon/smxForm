import React, { useEffect, useRef, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fileUrl, upload } from '../api';
import QuestionEditor from '../components/QuestionEditor.jsx';
import FormatMenu from '../components/FormatMenu.jsx';
import ActionMenu from '../components/ActionMenu.jsx';
import { TYPE_LABELS, emptyDraft, fromQuestion } from '../questionModel';
import { applyImportedLayout, blobToDataUri, dataUriToFile, exportQuiz, parsePortableQuestions } from '../portableQuiz.js';
import { toEditorEntries, toLayoutItems } from '../layout.js';
import { toPayload } from '../questionModel.js';
import { formatGrade } from '../formatGrade.js';
import { usePrompt } from '../components/PromptProvider.jsx';

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
            <option value="ANSWERS">Nota i respostes sense corregir</option>
            <option value="FULL">Nota i respostes correctes</option>
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
  const linked = new Set((quiz.classrooms || []).map((l) => l.courseId));
  return (
    <div className="card stack">
      <h3>Google Classroom</h3>
      {!me.classroomConnected ? (
        <a href="/auth/classroom"><button>Connecta amb Classroom</button></a>
      ) : (
        <>
          {quiz.classrooms?.length > 0 && (
            <>
              <ul>
                {quiz.classrooms.map((l) => (
                  <li key={l.courseId}>
                    {l.courseName || `Curs ${l.courseId}`} (tasca {l.courseWorkId}){' '}
                    <button className="secondary" onClick={() => run(async () => {
                      await api(`/api/teacher/quizzes/${quiz.id}/classroom/${encodeURIComponent(l.courseId)}`, { method: 'DELETE' });
                      onSaved();
                    })}>Desvincula</button>
                  </li>
                ))}
              </ul>
              <p className="muted">Publica les tasques al Classroom perquè els alumnes hi accedeixin. Cada alumne només rep la nota al curs on és.</p>
            </>
          )}
          <div className="row">
            <button className="secondary" onClick={() => run(async () => { const c = await api('/api/teacher/classroom/courses'); setCourses(c); setCourse(c.find((x) => !linked.has(x.id))?.id || ''); })}>Carrega cursos</button>
            {courses && (
              <>
                <select style={{ width: 'auto' }} value={course} onChange={(e) => setCourse(e.target.value)}>
                  {courses.filter((c) => !linked.has(c.id)).map((c) => <option key={c.id} value={c.id}>{c.name}{c.section ? ` (${c.section})` : ''}</option>)}
                </select>
                <button disabled={!course} onClick={() => run(async () => {
                  const c = courses.find((x) => x.id === course);
                  await api(`/api/teacher/quizzes/${quiz.id}/classroom`, { method: 'POST', body: { courseId: course, courseName: `${c.name}${c.section ? ` (${c.section})` : ''}` } });
                  setCourses(null);
                  onSaved();
                })}>Crea la tasca «{quiz.title}»</button>
              </>
            )}
          </div>
          {quiz.classrooms?.length > 0 && (
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
            {results.map((r) => <tr key={r.email}><td>{r.email}</td><td>{formatGrade(r.score)}</td><td className={r.ok ? 'ok' : 'error'}>{r.ok ? 'OK' : r.error}</td></tr>)}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function QuizEditor() {
  const { id } = useParams();
  const { confirm } = usePrompt();
  const qc = useQueryClient();
  const { data: quiz, isLoading, error } = useQuery({ queryKey: ['quiz-edit', id], queryFn: () => api(`/api/teacher/quizzes/${id}`) });
  const [editing, setEditing] = useState(null); // draft o null
  const [editingGroup, setEditingGroup] = useState(null); // grup on s'afegeix la pregunta nova
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const importInput = useRef(null);
  const [gradeAction, setGradeAction] = useState('');
  const [gradeMessage, setGradeMessage] = useState('');
  const refresh = () => qc.invalidateQueries({ queryKey: ['quiz-edit', id] });
  if (isLoading) return <p>Carregant…</p>;
  if (error) return <p className="error">{error.message}</p>;

  const closeEditor = () => { setEditing(null); setEditingGroup(null); };
  const save = async (payload, qid) => {
    await api(qid ? `/api/teacher/questions/${qid}` : `/api/teacher/quizzes/${id}/questions`, { method: qid ? 'PUT' : 'POST', body: qid || editingGroup === null ? payload : { ...payload, groupId: editingGroup } });
    closeEditor();
    refresh();
  };

  const entries = toEditorEntries(quiz.questions, quiz.groups || []);
  const numberOf = new Map(quiz.questions.map((q, k) => [q.id, k + 1]));
  const swap = (list, i, d) => { const next = [...list]; [next[i], next[i + d]] = [next[i + d], next[i]]; return next; };
  const addSection = (list, i) => [...list.slice(0, i), { kind: 'section', title: 'Secció nova' }, ...list.slice(i)];
  // Dues seccions seguides o una secció final no tenen cap pregunta on guardar-se.
  const validEntries = (list) => list.every((e, k) => e.kind !== 'section' || (k < list.length - 1 && list[k + 1].kind !== 'section'));
  const canMoveEntry = (i, d) => i + d >= 0 && i + d < entries.length && validEntries(swap(entries, i, d));
  const commit = async (next) => {
    await api(`/api/teacher/quizzes/${id}/layout`, { method: 'PUT', body: { items: toLayoutItems(next) } });
    refresh();
  };
  const renameSection = (i, title) => {
    const clean = title.trim() || 'Secció';
    if (clean !== entries[i].title) commit(entries.map((e, k) => (k === i ? { ...e, title: clean } : e)));
  };
  const saveGroupText = async (gid, text) => {
    await api(`/api/teacher/groups/${gid}`, { method: 'PUT', body: { text } });
    refresh();
  };
  const newGroup = async () => {
    await api(`/api/teacher/quizzes/${id}/groups`, { method: 'POST', body: { text: '' } });
    refresh();
  };
  const groupQuestion = async (i) => {
    const group = await api(`/api/teacher/quizzes/${id}/groups`, { method: 'POST', body: { text: '' } });
    commit(entries.map((e, k) => (k === i ? { kind: 'group', group, questions: [e.q] } : e)));
  };
  const del = async (qid) => {
    if (!await confirm('Aquesta pregunta i les respostes associades s’esborraran.', { title: 'Esborrar la pregunta?', confirmLabel: 'Esborra', danger: true })) return;
    await api(`/api/teacher/questions/${qid}`, { method: 'DELETE' });
    // Reassigna el títol de secció si la pregunta esborrada n'era la primera.
    const next = entries.map((e) => (e.kind === 'question' ? e : e.kind === 'group' ? { ...e, questions: e.questions.filter((q) => q.id !== qid) } : e)).filter((e) => !(e.kind === 'question' && e.q.id === qid));
    await commit(next);
  };
  const questionRow = (q, inGroup, controls, menu = []) => (editing?.id === q.id ? (
    <QuestionEditor key={q.id} initial={editing} onSave={save} onCancel={closeEditor} />
  ) : (
    <div className={`${inGroup ? 'group-member' : 'card'} row between quiz-question-row`}>
      <div className="quiz-question-summary">
        <span className="badge quiz-question-type">{TYPE_LABELS[q.type]}</span>
        <div className="review-question-title"><span className="review-question-number">{String(numberOf.get(q.id)).padStart(2, '0')}</span><span className="quiz-question-prompt">{q.text.slice(0, 100)} <span className="muted">({formatGrade(q.points)} pt{q.required ? ', obligatòria' : ''})</span></span></div>
      </div>
      <div className="row quiz-question-actions">
        {React.Children.toArray(controls)}
        <button className="secondary" onClick={() => setEditing(fromQuestion(q))}>Edita</button>
        <ActionMenu items={[
          ['SHORT_TEXT', 'FILL_BLANKS', 'LONG_TEXT', 'IMAGE_UPLOAD', 'DRAWING'].includes(q.type) && { label: 'Veure respostes ↗', to: `/t/quiz/${id}/question/${q.id}/answers` },
          ...menu,
          { label: 'Esborra la pregunta', danger: true, onClick: () => del(q.id) },
        ]} />
      </div>
    </div>
  ));

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
      anchor.download = `${quiz.title.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-|-$/g, '').toLowerCase() || 'entrega'}.palamForm.json`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      setExportError(error.message);
    } finally {
      setExporting(false);
    }
  };

  const importQuestions = async (file) => {
    setImportBusy(true);
    setImportMessage('');
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('El fitxer no pot superar els 50 MiB.');
      const drafts = parsePortableQuestions(JSON.parse(await file.text()));
      let done = 0;
      const createdQuestions = [];
      try {
        for (const draft of drafts) {
          const imageUrl = draft.image ? (await upload('/api/files/question-image', dataUriToFile(draft.image))).imageUrl : null;
          createdQuestions.push(await api(`/api/teacher/quizzes/${id}/questions`, { method: 'POST', body: toPayload({ ...draft, imageUrl }) }));
          done += 1;
        }
        await applyImportedLayout(api, id, drafts, createdQuestions, quiz.questions);
      } catch (error) {
        throw new Error(`${error.message} (s’han importat ${done} de ${drafts.length} preguntes).`);
      } finally {
        refresh();
      }
      setImportMessage(`${drafts.length} preguntes importades.`);
    } catch (error) {
      setImportMessage(error.message || 'No s’ha pogut importar el fitxer.');
    } finally {
      setImportBusy(false);
      if (importInput.current) importInput.current.value = '';
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
    <div className="quiz-editor">
      <header className="quiz-editor-header">
        <p className="quiz-editor-breadcrumb"><Link to="/t">← Entregues</Link><span>/</span>Editor</p>
        <div className="quiz-editor-title-row">
          <div>
            <span className="eyebrow">EDICIÓ D’ACTIVITAT</span>
            <h1>{quiz.title}</h1>
            <p className="quiz-editor-meta">{quiz.questions.length} preguntes · Nota màxima {formatGrade(quiz.maxScore)}</p>
          </div>
          <span className={`badge ${quiz.published ? 'quiz-status-published' : ''}`}>{quiz.published ? 'Publicada' : 'Esborrany'}</span>
        </div>
        <div className="row quiz-editor-actions">
          <Link className="button button-primary" to={`/t/quiz/${id}/preview`}>Visualitza el formulari ↗</Link>
          <Link className="button secondary" to={`/t/quiz/${id}/attempts`}>Veure intents</Link>
          <button className="secondary" onClick={downloadExport} disabled={exporting}>{exporting ? 'Preparant…' : 'Exporta JSON'}</button>
          <FormatMenu />
          {exportError && <span className="error">{exportError}</span>}
        </div>
      </header>
      {(quiz.gradingStatus?.needsRegrade > 0 || quiz.gradingStatus?.pendingReview > 0 || quiz.gradingStatus?.classroomUpdates > 0) && (
        <div className="grade-warning-panel">
          <strong>Cal actualitzar les qualificacions</strong>
          {quiz.gradingStatus.needsRegrade > 0 && <p>{quiz.gradingStatus.needsRegrade} intents s’han avaluat amb una versió anterior de les preguntes. La reavaluació pot deixar les respostes llargues pendents de revisió manual.</p>}
          {quiz.gradingStatus.pendingReview > 0 && <p>{quiz.gradingStatus.pendingReview} intents tenen respostes manuals pendents de corregir; no s’actualitzaran les notes de Classroom fins que es revisin.</p>}
          {quiz.gradingStatus.classroomUpdates > 0 && <p>Les notes ja exportades han canviat per a {quiz.gradingStatus.classroomUpdates} alumnes; actualitza-les també a Classroom.</p>}
          <div className="row">
            {quiz.gradingStatus.needsRegrade > 0 && <button disabled={!!gradeAction} onClick={regrade}>{gradeAction === 'regrade' ? 'Reavaluant…' : 'Reavalua intents'}</button>}
            {quiz.gradingStatus.classroomUpdates > 0 && quiz.classrooms?.length > 0 && <button className="secondary" disabled={!!gradeAction || quiz.gradingStatus.needsRegrade > 0 || quiz.gradingStatus.pendingReview > 0} onClick={updateClassroom}>{gradeAction === 'classroom' ? 'Actualitzant…' : 'Actualitza Classroom'}</button>}
            {gradeMessage && <span className="muted">{gradeMessage}</span>}
          </div>
        </div>
      )}
      <section className="quiz-editor-section">
        <div className="panel-heading">
          <div><span className="eyebrow">01 / PARAMETRES</span><h2>Detalls i avaluació</h2></div>
        </div>
        <Settings quiz={quiz} onSaved={refresh} />
      </section>
      <section className="quiz-editor-section">
        <div className="panel-heading">
          <div><span className="eyebrow">02 / CONTINGUT</span><h2>Preguntes</h2></div>
          <span className="panel-index">{quiz.questions.length} {quiz.questions.length === 1 ? 'PREGUNTA' : 'PREGUNTES'}</span>
        </div>
      {entries.map((entry, i) => {
        const rowControls = (up, down) => (
          <>
            <button className="secondary" disabled={!up} onClick={up} aria-label="Puja">↑</button>
            <button className="secondary" disabled={!down} onClick={down} aria-label="Baixa">↓</button>
          </>
        );
        const moveEntryProps = [canMoveEntry(i, -1) && (() => commit(swap(entries, i, -1))), canMoveEntry(i, 1) && (() => commit(swap(entries, i, 1)))];
        const canAddSection = entries[i - 1]?.kind !== 'section' && validEntries(addSection(entries, i));

        if (entry.kind === 'section') {
          return (
            <div className="section-divider" key={`s-${i}-${entry.title}`}>
              <span className="eyebrow">SECCIÓ · NOVA PÀGINA</span>
              <input type="text" defaultValue={entry.title} maxLength={200} aria-label="Títol de la secció" onBlur={(e) => renameSection(i, e.target.value)} />
              <div className="row">
                {rowControls(...moveEntryProps)}
                <ActionMenu items={[{ label: 'Treu la secció (les preguntes es mantenen)', danger: true, onClick: () => commit(entries.filter((_, k) => k !== i)) }]} />
              </div>
            </div>
          );
        }

        const sectionItem = canAddSection && !editing && { label: '+ Secció abans', onClick: () => commit(addSection(entries, i)) };

        if (entry.kind === 'group') {
          const { group } = entry;
          const members = entry.questions;
          const swapInGroup = (j, d) => entries.map((e, k) => (k === i ? { ...e, questions: swap(members, j, d) } : e));
          const leaveGroup = (j) => {
            const rest = members.filter((_, k) => k !== j);
            const next = [...entries];
            const loose = { kind: 'question', q: members[j] };
            if (j === 0) next.splice(i, rest.length ? 0 : 1, loose);
            else next.splice(i + 1, 0, loose);
            if (rest.length) next[next.indexOf(entry)] = { ...entry, questions: rest };
            commit(next);
          };
          const dissolve = () => commit(entries.flatMap((e, k) => (k === i ? e.questions.map((q) => ({ kind: 'question', q })) : [e])));
          return (
            <div className="card group-editor stack" key={`g-${group.id}`}>
              <div className="row between">
                <span className="badge">GRUP DE PREGUNTES</span>
                <div className="row">
                  {rowControls(...moveEntryProps)}
                  <ActionMenu items={[sectionItem, { label: 'Desagrupa les preguntes', onClick: dissolve }]} />
                </div>
              </div>
              <label>Enunciat comú
                <textarea defaultValue={group.text} placeholder="Text que es mostra únicament una vegada, abans de les preguntes del grup" key={`${group.id}-${group.text}`} onBlur={(e) => e.target.value !== group.text && saveGroupText(group.id, e.target.value)} />
              </label>
              <div className="group-members">
                {members.map((q, j) => (
                  <div key={q.id}>
                    {questionRow(q, true,
                      rowControls(j > 0 && (() => commit(swapInGroup(j, -1))), j < members.length - 1 && (() => commit(swapInGroup(j, 1)))),
                      [(j === 0 || j === members.length - 1) && { label: 'Treu del grup', onClick: () => leaveGroup(j) }],
                    )}
                  </div>
                ))}
                {members.length === 0 && <p className="muted">Aquest grup encara no té preguntes.</p>}
                {editing && !editing.id && editingGroup === group.id && <QuestionEditor initial={editing} onSave={save} onCancel={closeEditor} />}
              </div>
              {!editing && (
                <div className="row">
                  <strong>Afegeix al grup:</strong>
                  {Object.entries(TYPE_LABELS).map(([t, l]) => <button key={t} className="secondary" onClick={() => { setEditingGroup(group.id); setEditing(emptyDraft(t)); }}>{l}</button>)}
                </div>
              )}
            </div>
          );
        }

        const neighbour = (d) => entries[i + d]?.kind === 'group' ? entries[i + d] : null;
        const joinGroup = (d) => {
          const target = neighbour(d);
          const merged = { ...target, questions: d < 0 ? [...target.questions, entry.q] : [entry.q, ...target.questions] };
          commit(entries.flatMap((e, k) => (k === i ? [] : k === i + d ? [merged] : [e])));
        };
        return (
          <div key={entry.q.id}>
            {questionRow(entry.q, false, rowControls(...moveEntryProps), [
              sectionItem,
              neighbour(-1) && { label: '↑ Mou al grup anterior', onClick: () => joinGroup(-1) },
              neighbour(1) && { label: '↓ Mou al grup següent', onClick: () => joinGroup(1) },
              { label: 'Agrupa en un grup nou', onClick: () => groupQuestion(i) },
            ])}
          </div>
        );
      })}
      {editing && !editing.id && editingGroup === null && <QuestionEditor initial={editing} onSave={save} onCancel={closeEditor} />}
      {!editing && (
        <div className="card quiz-add-question">
          <strong>Afegeix una pregunta</strong>
          <div className="row">
          {Object.entries(TYPE_LABELS).map(([t, l]) => <button key={t} className="secondary" onClick={() => setEditing(emptyDraft(t))}>{l}</button>)}
          </div>
          <div className="row">
            <button className="secondary" onClick={newGroup}>+ Grup de preguntes</button>
            <button className="secondary" disabled={entries.length === 0 || entries[entries.length - 1].kind === 'section'} onClick={() => commit([...entries, { kind: 'section', title: 'Secció nova' }])} title="Les següents preguntes aniran a una nova pàgina">+ Secció al final</button>
            <button className="secondary" disabled={importBusy} onClick={() => importInput.current?.click()}>{importBusy ? 'Important…' : 'Importa de JSON'}</button>
            <input ref={importInput} className="visually-hidden" type="file" accept=".json,application/json" tabIndex={-1} aria-label="Fitxer JSON de preguntes" onChange={(event) => event.target.files[0] && importQuestions(event.target.files[0])} />
            {importMessage && <span className="muted">{importMessage}</span>}
          </div>
        </div>
      )}
      </section>
      <section className="quiz-editor-section">
        <div className="panel-heading">
          <div><span className="eyebrow">03 / DISTRIBUCIÓ</span><h2>Publicació i Classroom</h2></div>
        </div>
        <div className="card stack">
          <h3>Formulari públic</h3>
          {quiz.published ? (
            <a href={`${window.location.origin}/q/${quiz.publicSlug}`} target="_blank" rel="noreferrer">
              {`${window.location.origin}/q/${quiz.publicSlug}`}
            </a>
          ) : (
            <p className="muted">Publica l’entrega a la configuració perquè l’enllaç públic funcioni.</p>
          )}
        </div>
        <ClassroomPanel quiz={quiz} onSaved={refresh} />
      </section>
    </div>
  );
}
