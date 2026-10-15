import React, { useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';
import { upload } from '../api';
import { dataUriToFile, parsePortableQuiz } from '../portableQuiz.js';
import { toPayload } from '../questionModel.js';
import WorkspaceHero from '../components/WorkspaceHero.jsx';
import FormatMenu from '../components/FormatMenu.jsx';
import { usePrompt } from '../components/PromptProvider.jsx';

export default function TeacherHome() {
  const { confirm } = usePrompt();
  const qc = useQueryClient();
  const nav = useNavigate();
  const [title, setTitle] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [gradeAction, setGradeAction] = useState(null);
  const [gradeMessage, setGradeMessage] = useState({});
  const importInput = useRef(null);
  const { data, isLoading } = useQuery({ queryKey: ['quizzes'], queryFn: () => api('/api/teacher/quizzes') });
  const refresh = () => qc.invalidateQueries({ queryKey: ['quizzes'] });
  const create = useMutation({
    mutationFn: () => api('/api/teacher/quizzes', { method: 'POST', body: { title } }),
    onSuccess: (q) => nav(`/t/quiz/${q.id}`),
  });
  const dup = useMutation({ mutationFn: (id) => api(`/api/teacher/quizzes/${id}/duplicate`, { method: 'POST' }), onSuccess: refresh });
  const del = useMutation({ mutationFn: (id) => api(`/api/teacher/quizzes/${id}`, { method: 'DELETE' }), onSuccess: refresh });

  const runGradeAction = async (quiz, action) => {
    setGradeAction({ id: quiz.id, action });
    setGradeMessage((messages) => ({ ...messages, [quiz.id]: '' }));
    try {
      if (action === 'regrade') {
        const result = await api(`/api/teacher/quizzes/${quiz.id}/regrade`, { method: 'POST' });
        setGradeMessage((messages) => ({ ...messages, [quiz.id]: { text: `${result.regraded} intents reavaluats; ${result.pendingReview} pendents de revisió manual.` } }));
      } else {
        const result = await api(`/api/teacher/quizzes/${quiz.id}/export`, { method: 'POST', body: { returnToStudents: false } });
        const succeeded = result.filter((row) => row.ok).length;
        const failed = result.filter((row) => !row.ok).length;
        setGradeMessage((messages) => ({ ...messages, [quiz.id]: { text: `${succeeded} notes actualitzades a Classroom${failed ? `; ${failed} errors` : ''}.`, error: failed > 0 } }));
      }
      refresh();
    } catch (error) {
      setGradeMessage((messages) => ({ ...messages, [quiz.id]: { text: error.message, error: true } }));
    } finally {
      setGradeAction(null);
    }
  };

  const deleteQuiz = async (quiz) => {
    const accepted = await confirm('S’esborraran l’entrega i tots els intents. Aquesta acció no es pot desfer.', {
      title: `Esborrar «${quiz.title}»?`,
      confirmLabel: 'Esborra',
      danger: true,
    });
    if (accepted) del.mutate(quiz.id);
  };

  const importQuiz = async (file) => {
    setImportBusy(true);
    setImportMessage('');
    let created;
    try {
      if (file.size > 50 * 1024 * 1024) throw new Error('El fitxer no pot superar els 50 MiB.');
      const portable = parsePortableQuiz(JSON.parse(await file.text()));
      created = await api('/api/teacher/quizzes', {
        method: 'POST',
        body: {
          title: portable.title,
          description: portable.description,
          maxScore: portable.maxScore,
          shuffleQuestions: portable.shuffleQuestions,
          allowRetry: portable.allowRetry,
          maxAttempts: portable.allowRetry ? portable.maxAttempts : 1,
          negativePenalty: portable.negativePenalty,
          gradeToExport: portable.gradeToExport,
          showResults: portable.showResults,
          showResultsFrom: portable.showResultsFrom,
          published: false,
        },
      });
      for (const draft of portable.drafts) {
        const imageUrl = draft.image ? (await upload('/api/files/question-image', dataUriToFile(draft.image))).imageUrl : null;
        await api(`/api/teacher/quizzes/${created.id}/questions`, {
          method: 'POST',
          body: toPayload({ ...draft, imageUrl }),
        });
      }
      nav(`/t/quiz/${created.id}`);
    } catch (error) {
      if (created) {
        try { await api(`/api/teacher/quizzes/${created.id}`, { method: 'DELETE' }); } catch { /* Keep the original import error. */ }
      }
      setImportMessage(error.message || 'No s’ha pogut importar el fitxer.');
      setImportBusy(false);
    }
  };

  return (
    <div>
      <WorkspaceHero eyebrow="ESPAI PROFESSORAT" title="Les teves entregues" description="Dissenya, publica i revisa activitats." />
      <div className="card row create-panel">
        <div className="create-panel-label"><span className="eyebrow">NOVA ACTIVITAT</span><span>Comença una entrega</span></div>
        <input type="text" style={{ flex: 1, width: 'auto' }} placeholder="Títol de la nova entrega" value={title} onChange={(e) => setTitle(e.target.value)} />
        <button disabled={!title.trim() || create.isPending} onClick={() => create.mutate()}>Crea entrega <span aria-hidden="true">↗</span></button>
      </div>
      <div className="row import-tools">
        <button className="secondary" disabled={importBusy} onClick={() => importInput.current?.click()}>{importBusy ? 'Important…' : 'Importa JSON'}</button>
        <input ref={importInput} className="visually-hidden" type="file" accept=".json,application/json" tabIndex={-1} aria-label="Fitxer JSON d’una entrega" onChange={(event) => event.target.files[0] && importQuiz(event.target.files[0])} />
        <FormatMenu />
        {importMessage && <span className="error">{importMessage}</span>}
      </div>
      <div className="panel-heading list-heading"><div><span className="eyebrow">BIBLIOTECA</span><h2>Activitats creades</h2></div><span className="panel-index">02 / GESTIÓ</span></div>
      {isLoading && <p>Carregant…</p>}
      {!isLoading && !data?.length && <div className="card empty-state">Encara no has creat cap entrega.</div>}
      {data?.map((q) => (
        <div className="card row between quiz-row" key={q.id}>
          <div>
            <Link to={`/t/quiz/${q.id}`}><b>{q.title}</b></Link>{' '}
            <span className="badge">{q.published ? 'Publicada' : 'Esborrany'}</span>
            <div className="muted">{q._count.questions} preguntes · {q._count.attempts} intents{q.classrooms?.length > 0 && ` · Classroom (${q.classrooms.length})`}</div>
            {q.gradingStatus?.needsRegrade > 0 && <p className="grade-warning">Hi ha {q.gradingStatus.needsRegrade} intents corregits amb una versió anterior de les preguntes.</p>}
            {q.gradingStatus?.pendingReview > 0 && <p className="grade-warning">Hi ha {q.gradingStatus.pendingReview} intents pendents de revisió manual.</p>}
            {q.gradingStatus?.classroomUpdates > 0 && <p className="grade-warning">Les notes exportades a Classroom han canviat per a {q.gradingStatus.classroomUpdates} alumnes.</p>}
            {gradeMessage[q.id] && <p className={gradeMessage[q.id].error ? 'error' : 'muted'}>{gradeMessage[q.id].text}</p>}
          </div>
          <div className="row">
            <Link to={`/t/quiz/${q.id}/attempts`}>Intents</Link>
            {q.gradingStatus?.needsRegrade > 0 && <button disabled={gradeAction?.id === q.id} onClick={() => runGradeAction(q, 'regrade')}>{gradeAction?.id === q.id && gradeAction.action === 'regrade' ? 'Reavaluant…' : 'Reavalua intents'}</button>}
            {q.gradingStatus?.classroomUpdates > 0 && q.classrooms?.length > 0 && <button className="secondary" disabled={gradeAction?.id === q.id || q.gradingStatus?.needsRegrade > 0 || q.gradingStatus?.pendingReview > 0} onClick={() => runGradeAction(q, 'classroom')}>{gradeAction?.id === q.id && gradeAction.action === 'classroom' ? 'Actualitzant…' : 'Actualitza Classroom'}</button>}
            <button className="secondary" onClick={() => dup.mutate(q.id)}>Duplica</button>
            <button className="danger" onClick={() => deleteQuiz(q)}>Esborra</button>
          </div>
        </div>
      ))}
    </div>
  );
}
