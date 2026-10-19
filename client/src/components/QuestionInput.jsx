import React from 'react';
import { fileUrl, upload } from '../api';
import { usePrompt } from './PromptProvider.jsx';
import DrawingBoard from './DrawingBoard.jsx';
import MarkdownText from './MarkdownText.jsx';
import { splitBlanks } from '../questionModel.js';
import { isNumericAnswer } from '../layout.js';

export function ImageWithPoints({ src, points = [], onClick }) {
  return (
    <div className="imgwrap" onClick={onClick} style={onClick ? { cursor: 'crosshair' } : undefined}>
      <img src={src} alt="" draggable={false} />
      {points.map((p, i) => (
        <span key={p.id} className="marker" style={{ left: `${p.x}%`, top: `${p.y}%` }}>{i + 1}</span>
      ))}
    </div>
  );
}

export default function QuestionInput({ q, value, onChange, attemptId, fileName, onFile, disabled, pasteBlockedField, onPasteBlocked, numericErrors = [] }) {
  const c = q.config;
  const { alert } = usePrompt();
  const onPaste = (field) => (event) => {
    if (disabled || c.allowClipboard) return;
    event.preventDefault();
    onPasteBlocked?.(field);
  };
  const onBeforeInput = (field) => (event) => {
    if (disabled || c.allowClipboard || event.nativeEvent?.inputType !== 'insertFromPaste') return;
    event.preventDefault();
    onPasteBlocked?.(field);
  };
  const onTextChange = (field, previousValue, update) => (event) => {
    if (!disabled && !c.allowClipboard && event.nativeEvent?.inputType === 'insertFromPaste') {
      event.preventDefault();
      event.currentTarget.value = previousValue ?? '';
      onPasteBlocked?.(field);
      return;
    }
    update(event.currentTarget.value);
  };
  const pasteWarning = (field) => pasteBlockedField === field && (
    <span className="paste-blocked-message" role="status">Enganxar no està permès en aquesta pregunta.</span>
  );
  const numericWarning = (field) => numericErrors.includes(field) && (
    <span className="numeric-answer-error" role="alert">Introdueix un nombre vàlid.</span>
  );
  switch (q.type) {
    case 'MCQ': {
      const sel = value || [];
      const toggle = (id) => {
        if (!c.multiple) return onChange([id]);
        onChange(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
      };
      return (
        <div className="choice-list">
          {c.options.map((o) => (
            <label className="choice-option" key={o.id}>
              <input type={c.multiple ? 'checkbox' : 'radio'} name={`q${q.id}`} disabled={disabled} checked={sel.includes(o.id)} onChange={() => toggle(o.id)} /> {o.text}
            </label>
          ))}
          {c.multiple && <p className="muted">Pots marcar diverses respostes.</p>}
        </div>
      );
    }
    case 'TRUE_FALSE':
      return (
        <div className="choice-list">
          {[[true, 'Cert'], [false, 'Fals']].map(([v, t]) => (
            <label className="choice-option" key={t}>
              <input type="radio" name={`q${q.id}`} disabled={disabled} checked={value === v} onChange={() => onChange(v)} /> {t}
            </label>
          ))}
        </div>
      );
    case 'MATCHING': {
      const v = value || {};
      return (
        <table>
          <tbody>
            {c.left.map((l) => (
              <tr key={l.id}>
                <td>{l.text}</td>
                <td>
                  <select disabled={disabled} value={v[l.id] ?? ''} onChange={(e) => onChange({ ...v, [l.id]: e.target.value })}>
                    <option value="">—</option>
                    {c.right.map((r) => <option key={r.id} value={r.id}>{r.text}</option>)}
                  </select>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      );
    }
    case 'ORDERING': {
      const orderedIds = value || c.items.map((item) => item.id);
      const move = (index, direction) => {
        const next = [...orderedIds];
        [next[index], next[index + direction]] = [next[index + direction], next[index]];
        onChange(next);
      };
      return (
        <ol className="ordering-answer">
          {orderedIds.map((id, index) => {
            const item = c.items.find((entry) => entry.id === id);
            if (!item) return null;
            return (
              <li key={id} className="ordering-answer-row">
                <button type="button" className="secondary ordering-move" disabled={disabled || index === 0} onClick={() => move(index, -1)} aria-label={`Mou ${item.text} amunt`}>↑</button>
                <button type="button" className="secondary ordering-move" disabled={disabled || index === orderedIds.length - 1} onClick={() => move(index, 1)} aria-label={`Mou ${item.text} avall`}>↓</button>
                <span className="ordering-answer-text">{item.text}</span>
              </li>
            );
          })}
        </ol>
      );
    }
    case 'IMAGE_LABEL': {
      const v = value || {};
      return (
        <div className="stack">
          <ImageWithPoints src={fileUrl(q.imageUrl)} points={c.points} />
          {c.points.map((p, i) => (
            <div className="row" key={p.id}>
              <span className="badge">{i + 1}</span>
              {c.labels ? (
                <select disabled={disabled} aria-invalid={numericErrors.includes(p.id) || undefined} value={v[p.id] ?? ''} onChange={(e) => onChange({ ...v, [p.id]: e.target.value })}>
                  <option value="">—</option>
                  {c.labels.filter((label) => !p.numeric || isNumericAnswer(label)).map((label) => <option key={label} value={label}>{label}</option>)}
                </select>
              ) : (
                <div className="question-input-field">
                  <input type="text" inputMode={p.numeric ? 'decimal' : undefined} aria-invalid={numericErrors.includes(p.id) || undefined} disabled={disabled} value={v[p.id] ?? ''} onPaste={onPaste(p.id)} onBeforeInput={onBeforeInput(p.id)} onChange={onTextChange(p.id, v[p.id], (text) => onChange({ ...v, [p.id]: text }))} />
                  {pasteWarning(p.id)}
                </div>
              )}
                {numericWarning(p.id)}
            </div>
          ))}
        </div>
      );
    }
    case 'SHORT_TEXT':
      return (
        <div className="question-input-field">
          <input type="text" inputMode={c.numericAnswer ? 'decimal' : undefined} aria-invalid={numericErrors.includes('answer') || undefined} maxLength={500} disabled={disabled} value={value ?? ''} onPaste={onPaste('answer')} onBeforeInput={onBeforeInput('answer')} onChange={onTextChange('answer', value, onChange)} />
          {pasteWarning('answer')}
          {numericWarning('answer')}
        </div>
      );
    case 'FILL_BLANKS': {
      const parts = splitBlanks(q.text);
      const values = Array.isArray(value) ? value : [];
      const setBlank = (i, text) => onChange(Array.from({ length: parts.length - 1 }, (_, j) => (j === i ? text : values[j] ?? '')));
      return (
        <div className="question-input-field">
          <div className="fill-blanks">
            {parts.map((part, i) => (
              <React.Fragment key={i}>
                <MarkdownText inline>{part}</MarkdownText>
                {i < parts.length - 1 && (
                  <>
                    <input type="text" inputMode={c.numericBlanks?.[i] ? 'decimal' : undefined} aria-invalid={numericErrors.includes(`blank${i}`) || undefined} className="fill-blank" maxLength={200} size={Math.max(10, (values[i] ?? '').length + 2)} aria-label={`Buit ${i + 1}`} disabled={disabled} value={values[i] ?? ''} onPaste={onPaste(`blank${i}`)} onBeforeInput={onBeforeInput(`blank${i}`)} onChange={onTextChange(`blank${i}`, values[i], (text) => setBlank(i, text))} />
                    {numericWarning(`blank${i}`)}
                  </>
                )}
              </React.Fragment>
            ))}
          </div>
          {pasteBlockedField?.startsWith('blank') && pasteWarning(pasteBlockedField)}
        </div>
      );
    }
    case 'CALCULATED':
      return (
        <div className="question-input-field">
          <input type="text" inputMode={c.numericAnswer ? 'decimal' : undefined} aria-invalid={numericErrors.includes('answer') || undefined} maxLength={50} disabled={disabled} value={value ?? ''} onPaste={onPaste('answer')} onBeforeInput={onBeforeInput('answer')} onChange={onTextChange('answer', value, onChange)} />
          {pasteWarning('answer')}
          {numericWarning('answer')}
        </div>
      );
    case 'LONG_TEXT':
      return (
        <div className="question-input-field">
          <textarea maxLength={10000} disabled={disabled} value={value ?? ''} onPaste={onPaste('answer')} onBeforeInput={onBeforeInput('answer')} onChange={onTextChange('answer', value, onChange)} />
          {pasteWarning('answer')}
        </div>
      );
    case 'DRAWING':
      return <DrawingBoard src={fileUrl(q.imageUrl)} color={c.color} width={c.width} value={value} onChange={onChange} readOnly={disabled} />;
    case 'IMAGE_UPLOAD':
      return (
        <div className="stack">
          {fileName && <img src={fileUrl(fileName)} alt="La teva resposta" style={{ maxWidth: 300 }} />}
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            disabled={disabled}
            onChange={async (e) => {
              const f = e.target.files[0];
              if (!f) return;
              try {
                const r = await upload(`/api/files/answer-image/${attemptId}/${q.id}`, f);
                onFile(r.fileUrl);
              } catch (err) {
                await alert(err.message, { title: 'No s’ha pogut pujar la imatge' });
              }
            }}
          />
        </div>
      );
    default:
      return null;
  }
}
