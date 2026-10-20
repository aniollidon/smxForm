import React, { useState } from 'react';
import { upload, fileUrl } from '../api';
import { ImageWithPoints } from './QuestionInput.jsx';
import DrawingBoard from './DrawingBoard.jsx';
import { TYPE_LABELS, uid, toPayload, validateDraft, countBlanks } from '../questionModel';

export default function QuestionEditor({ initial, onSave, onCancel }) {
  const [d, setD] = useState(initial);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (patch) => setD((x) => ({ ...x, ...patch }));

  const uploadImage = async (file) => {
    try {
      const r = await upload('/api/files/question-image', file);
      set({ imageUrl: r.imageUrl });
    } catch (e) {
      setErr(e.message);
    }
  };

  const save = async () => {
    const v = validateDraft(d);
    if (v) return setErr(v);
    setBusy(true);
    try {
      await onSave(toPayload(d), d.id);
    } catch (e) {
      setErr(e.message);
      setBusy(false);
    }
  };

  const addPoint = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 1000) / 10;
    const y = Math.round(((e.clientY - rect.top) / rect.height) * 1000) / 10;
    set({ points_: [...d.points_, { id: uid(), x, y, label: '', numeric: false }] });
  };

  return (
    <div className="card stack question-editor-card">
      <b>{TYPE_LABELS[d.type]}</b>
      <label>Enunciat<textarea value={d.text} onChange={(e) => set({ text: e.target.value })} /></label>
      <div className="row">
        <label>Punts <input type="number" min="0" step="0.25" value={d.points} onChange={(e) => set({ points: e.target.value })} /></label>
        <label><input type="checkbox" checked={d.required} onChange={(e) => set({ required: e.target.checked })} /> Obligatòria</label>
        <label><input type="checkbox" checked={d.allowClipboard} onChange={(e) => set({ allowClipboard: e.target.checked })} /> Permet copiar i enganxar</label>
        {['MCQ', 'MATCHING', 'ORDERING', 'IMAGE_LABEL'].includes(d.type) && (
          <label><input type="checkbox" checked={d.shuffleOptions} onChange={(e) => set({ shuffleOptions: e.target.checked })} /> Respostes en ordre aleatori</label>
        )}
        {(d.type === 'MATCHING' || d.type === 'ORDERING' || (d.type === 'MCQ' && d.multiple)) && (
          <label><input type="checkbox" checked={d.allOrNothing} onChange={(e) => set({ allOrNothing: e.target.checked })} /> Puntuació tot o res</label>
        )}
      </div>

      {d.type !== 'IMAGE_LABEL' && d.type !== 'IMAGE_UPLOAD' && d.type !== 'DRAWING' && (
        <div>
          <label>Imatge (opcional) <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && uploadImage(e.target.files[0])} /></label>
          {d.imageUrl && <img src={fileUrl(d.imageUrl)} alt="" style={{ maxWidth: 200 }} />}
        </div>
      )}

      {d.type === 'MCQ' && (
        <div className="stack">
          <label><input type="checkbox" checked={d.multiple} onChange={(e) => set({ multiple: e.target.checked })} /> Permet múltiples respostes</label>
          {d.opts.map((o, i) => (
            <div className="row" key={o.id}>
              <input
                type={d.multiple ? 'checkbox' : 'radio'}
                checked={o.correct}
                title="Correcta"
                onChange={(e) =>
                  set({ opts: d.opts.map((x) => (x.id === o.id ? { ...x, correct: e.target.checked } : d.multiple ? x : { ...x, correct: false })) })
                }
              />
              <input type="text" style={{ flex: 1, width: 'auto' }} placeholder={`Opció ${String.fromCharCode(65 + i)}`} value={o.text} onChange={(e) => set({ opts: d.opts.map((x) => (x.id === o.id ? { ...x, text: e.target.value } : x)) })} />
              {d.opts.length > 2 && <button className="secondary" onClick={() => set({ opts: d.opts.filter((x) => x.id !== o.id) })}>✕</button>}
            </div>
          ))}
          {d.opts.length < 12 && <button className="secondary" onClick={() => set({ opts: [...d.opts, { id: uid(), text: '', correct: false }] })}>+ Opció</button>}
        </div>
      )}

      {d.type === 'TRUE_FALSE' && (
        <label>Resposta correcta
          <select value={String(d.correct)} onChange={(e) => set({ correct: e.target.value === 'true' })}>
            <option value="true">Cert</option>
            <option value="false">Fals</option>
          </select>
        </label>
      )}

      {d.type === 'MATCHING' && (
        <div className="stack">
          {d.pairs.map((p, i) => (
            <div className="row" key={i}>
              <input type="text" style={{ flex: 1, width: 'auto' }} placeholder="Concepte" value={p.left} onChange={(e) => set({ pairs: d.pairs.map((x, j) => (j === i ? { ...x, left: e.target.value } : x)) })} />
              <span>→</span>
              <input type="text" style={{ flex: 1, width: 'auto' }} placeholder="Correspondència" value={p.right} onChange={(e) => set({ pairs: d.pairs.map((x, j) => (j === i ? { ...x, right: e.target.value } : x)) })} />
              {d.pairs.length > 2 && <button className="secondary" onClick={() => set({ pairs: d.pairs.filter((_, j) => j !== i) })}>✕</button>}
            </div>
          ))}
          <button className="secondary" onClick={() => set({ pairs: [...d.pairs, { left: '', right: '' }] })}>+ Parella</button>
          <label>Opcions de distracció (una per línia)<textarea value={d.distractors} onChange={(e) => set({ distractors: e.target.value })} /></label>
        </div>
      )}

      {d.type === 'ORDERING' && (
        <div className="stack">
          <p className="muted">Escriu els elements en l’ordre correcte.</p>
          {d.items.map((item, index) => (
            <div className="row" key={item.id}>
              <span className="badge">{index + 1}</span>
              <input type="text" maxLength={500} style={{ flex: 1, width: 'auto' }} placeholder={`Element ${index + 1}`} value={item.text} onChange={(e) => set({ items: d.items.map((entry) => (entry.id === item.id ? { ...entry, text: e.target.value } : entry)) })} />
              <button className="secondary" disabled={index === 0} onClick={() => set({ items: d.items.map((entry, i) => i === index - 1 ? d.items[index] : i === index ? d.items[index - 1] : entry) })} aria-label="Mou amunt">↑</button>
              <button className="secondary" disabled={index === d.items.length - 1} onClick={() => set({ items: d.items.map((entry, i) => i === index ? d.items[index + 1] : i === index + 1 ? d.items[index] : entry) })} aria-label="Mou avall">↓</button>
              {d.items.length > 2 && <button className="secondary" onClick={() => set({ items: d.items.filter((entry) => entry.id !== item.id) })} aria-label="Elimina element">✕</button>}
            </div>
          ))}
          {d.items.length < 30 && <button className="secondary" onClick={() => set({ items: [...d.items, { id: uid(), text: '' }] })}>+ Element</button>}
        </div>
      )}

      {d.type === 'IMAGE_LABEL' && (
        <div className="stack">
          <label>Imatge <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && uploadImage(e.target.files[0])} /></label>
          {d.imageUrl && (
            <>
              <p className="muted">Clica sobre la imatge per afegir un punt.</p>
              <ImageWithPoints src={fileUrl(d.imageUrl)} points={d.points_} onClick={addPoint} />
              {d.points_.map((p, i) => (
                <div className="row" key={p.id}>
                  <span className="badge">{i + 1}</span>
                  <input type="text" style={{ flex: 1, width: 'auto' }} placeholder="Etiqueta correcta" value={p.label} onChange={(e) => set({ points_: d.points_.map((x) => (x.id === p.id ? { ...x, label: e.target.value } : x)) })} />
                  <label><input type="checkbox" checked={!!p.numeric} onChange={(e) => set({ points_: d.points_.map((x) => (x.id === p.id ? { ...x, numeric: e.target.checked } : x)) })} /> Número</label>
                  <button className="secondary" onClick={() => set({ points_: d.points_.filter((x) => x.id !== p.id) })}>✕</button>
                </div>
              ))}
            </>
          )}
          <label><input type="checkbox" checked={d.predefined} onChange={(e) => set({ predefined: e.target.checked })} /> Etiquetes predefinides (l'alumne tria d'una llista)</label>
          {d.predefined && <label>Etiquetes extra (distractors, una per línia)<textarea value={d.extraLabels} onChange={(e) => set({ extraLabels: e.target.value })} /></label>}
        </div>
      )}

      {d.type === 'SHORT_TEXT' && (
        <div className="stack">
          <label><input type="checkbox" checked={!!d.numericAnswer} onChange={(e) => set({ numericAnswer: e.target.checked })} /> La resposta ha de ser un número</label>
          <label>Respostes acceptades (una per línia; ignora majúscules i accents)<textarea value={d.accepted} onChange={(e) => set({ accepted: e.target.value })} /></label>
          <label>Expressió regular (opcional)<input type="text" value={d.regex} onChange={(e) => set({ regex: e.target.value })} /></label>
        </div>
      )}

      {d.type === 'FILL_BLANKS' && (
        <div className="stack">
          <p className="muted">Escriu l’enunciat i marca cada buit amb tres o més guions baixos (<code>___</code>). L’alumne ompli els buits dins la frase.</p>
          {countBlanks(d.text) === 0 && <p className="muted">Encara no hi ha cap buit a l’enunciat.</p>}
          {Array.from({ length: Math.min(countBlanks(d.text), 20) }, (_, i) => (
            <label key={i}>Buit {i + 1}: respostes acceptades (separades per <code>|</code>; ignora majúscules i accents)
              <input type="text" maxLength={400} value={d.blanks[i] ?? ''} onChange={(e) => set({ blanks: Array.from({ length: Math.max(d.blanks.length, i + 1) }, (_, j) => (j === i ? e.target.value : d.blanks[j] ?? '')) })} />
              <span><input type="checkbox" checked={!!d.numericBlanks?.[i]} onChange={(e) => set({ numericBlanks: Array.from({ length: Math.max(d.numericBlanks?.length || 0, i + 1) }, (_, j) => j === i ? e.target.checked : !!d.numericBlanks?.[j]) })} /> La resposta d’aquest buit ha de ser un número</span>
            </label>
          ))}
        </div>
      )}

      {d.type === 'TABLE' && (
        <div className="stack">
          <div className="stack">
            <b>Columnes</b>
            {d.tableColumns.map((column, index) => (
              <div className="row" key={index}>
                <input type="text" maxLength={200} style={{ flex: 1, width: 'auto' }} aria-label={`Capçalera de columna ${index + 1}`} value={column} onChange={(e) => set({ tableColumns: d.tableColumns.map((item, i) => i === index ? e.target.value : item) })} />
                {d.tableColumns.length > 1 && <button className="secondary" onClick={() => set({ tableColumns: d.tableColumns.filter((_, i) => i !== index) })} aria-label={`Elimina columna ${index + 1}`}>✕</button>}
              </div>
            ))}
            {d.tableColumns.length < 10 && <button className="secondary" onClick={() => set({ tableColumns: [...d.tableColumns, `Columna ${d.tableColumns.length + 1}`] })}>+ Columna</button>}
          </div>
          <div className="stack">
            <b>Files</b>
            {d.tableRows.map((row, index) => (
              <div className="row" key={index}>
                <input type="text" maxLength={200} style={{ flex: 1, width: 'auto' }} aria-label={`Etiqueta de fila ${index + 1}`} value={row} onChange={(e) => set({ tableRows: d.tableRows.map((item, i) => i === index ? e.target.value : item) })} />
                {d.tableRows.length > 1 && <button className="secondary" onClick={() => set({ tableRows: d.tableRows.filter((_, i) => i !== index) })} aria-label={`Elimina fila ${index + 1}`}>✕</button>}
              </div>
            ))}
            {d.tableRows.length < 20 && <button className="secondary" onClick={() => set({ tableRows: [...d.tableRows, `Fila ${d.tableRows.length + 1}`] })}>+ Fila</button>}
          </div>
          <label>Resposta de referència (per a l’avaluació amb LLM)<textarea maxLength={5000} value={d.reference} onChange={(e) => set({ reference: e.target.value })} /></label>
          <p className="muted">No s’avalua automàticament. Es pot corregir manualment o amb LLM.</p>
        </div>
      )}

      {d.type === 'CALCULATED' && (
        <div className="stack">
          <p className="muted">Usa variables a l’enunciat amb claus, p. ex. {'{a}'}; cada alumne en rep un valor aleatori del rang o de la llista. També pots escriure càlculs a l’enunciat amb {'{=2*{a}}'}.</p>
          {d.vars.map((v, i) => {
            const setVar = (patch) => set({ vars: d.vars.map((x, j) => (j === i ? { ...x, ...patch } : x)) });
            return (
              <div className="row" key={i}>
                <label>Variable {'{ }'} <input type="text" style={{ width: 90 }} value={v.name} onChange={(e) => setVar({ name: e.target.value })} /></label>
                <label>Generació <select value={v.mode || 'range'} onChange={(e) => setVar({ mode: e.target.value })}>
                  <option value="range">Rang</option>
                  <option value="list">Llista</option>
                </select></label>
                {v.mode === 'list' ? (
                  <label>Valors possibles (un per línia)<textarea rows="3" placeholder={'1\n2,5\n4'} value={v.values || ''} onChange={(e) => setVar({ values: e.target.value })} /></label>
                ) : (
                  <>
                    <label>Mínim <input type="number" step="any" style={{ width: 100 }} value={v.min} onChange={(e) => setVar({ min: e.target.value })} /></label>
                    <label>Màxim <input type="number" step="any" style={{ width: 100 }} value={v.max} onChange={(e) => setVar({ max: e.target.value })} /></label>
                    <label>Decimals <input type="number" min="0" max="10" style={{ width: 70 }} value={v.decimals} onChange={(e) => setVar({ decimals: e.target.value })} /></label>
                  </>
                )}
                {d.vars.length > 1 && <button className="secondary" onClick={() => set({ vars: d.vars.filter((_, j) => j !== i) })}>✕</button>}
              </div>
            );
          })}
          {d.vars.length < 20 && <button className="secondary" onClick={() => set({ vars: [...d.vars, { name: '', mode: 'range', min: 1, max: 10, decimals: 0, values: '' }] })}>+ Variable</button>}
          <label>Fórmula de la resposta correcta (p. ex. {'{a}*{b}/2'}; admet + - * / % ** i funcions com sqrt, pow, abs, round, sin, cos, log, pi)
            <input type="text" maxLength={500} value={d.formula} onChange={(e) => set({ formula: e.target.value })} />
          </label>
          <label><input type="checkbox" checked={!!d.numericAnswer} onChange={(e) => set({ numericAnswer: e.target.checked })} /> La resposta de l’alumne ha de ser un número</label>
          <div className="row">
            <label>Tolerància <input type="number" min="0" step="any" value={d.tolerance} onChange={(e) => set({ tolerance: e.target.value })} /></label>
            <label>Tipus de tolerància
              <select value={d.toleranceType} onChange={(e) => set({ toleranceType: e.target.value })}>
                <option value="nominal">Nominal (± valor)</option>
                <option value="relative">Relativa (fracció de la resposta; 0.01 = 1%)</option>
              </select>
            </label>
          </div>
          <p className="muted">S’autoavalua; l’alumne pot escriure la resposta amb punt o coma decimal.</p>
        </div>
      )}

      {d.type === 'DRAWING' && (
        <div className="stack">
          <label>Imatge base <input type="file" accept="image/*" onChange={(e) => e.target.files[0] && uploadImage(e.target.files[0])} /></label>
          <div className="row">
            <label>Color del traç <input type="color" value={d.color} onChange={(e) => set({ color: e.target.value })} /></label>
            <label>Mida del traç ({d.width}) <input type="range" min="1" max="40" value={d.width} onChange={(e) => set({ width: Number(e.target.value) })} /></label>
          </div>
          {d.imageUrl && <DrawingBoard src={fileUrl(d.imageUrl)} color={d.color} width={d.width} value={d.sample} onChange={(v) => set({ sample: v })} />}
          <p className="muted">Prova el traç sobre la imatge (no es desa).</p>
        </div>
      )}

      {d.type === 'LONG_TEXT' && (
        <label>Resposta de referència (per al corrector)<textarea value={d.reference} onChange={(e) => set({ reference: e.target.value })} /></label>
      )}
      {(d.type === 'SHORT_TEXT' || d.type === 'FILL_BLANKS') && <p className="muted">S’autoavalua; el professor pot revisar i ajustar la puntuació manualment si cal.</p>}
      {(d.type === 'LONG_TEXT' || d.type === 'IMAGE_UPLOAD' || d.type === 'DRAWING') && <p className="muted">Aquesta pregunta es corregeix manualment.</p>}

      {err && <p className="error">{err}</p>}
      <div className="row">
        <button onClick={save} disabled={busy}>Desa</button>
        <button className="secondary" onClick={onCancel}>Cancel·la</button>
      </div>
    </div>
  );
}
