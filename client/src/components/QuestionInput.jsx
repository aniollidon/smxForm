import React from 'react';
import { fileUrl, upload } from '../api';

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

export default function QuestionInput({ q, value, onChange, attemptId, fileName, onFile, disabled }) {
  const c = q.config;
  switch (q.type) {
    case 'MCQ': {
      const sel = value || [];
      const toggle = (id) => {
        if (!c.multiple) return onChange([id]);
        onChange(sel.includes(id) ? sel.filter((x) => x !== id) : [...sel, id]);
      };
      return (
        <div>
          {c.options.map((o) => (
            <label key={o.id}>
              <input type={c.multiple ? 'checkbox' : 'radio'} name={`q${q.id}`} disabled={disabled} checked={sel.includes(o.id)} onChange={() => toggle(o.id)} /> {o.text}
            </label>
          ))}
          {c.multiple && <p className="muted">Pots marcar diverses respostes.</p>}
        </div>
      );
    }
    case 'TRUE_FALSE':
      return (
        <div>
          {[[true, 'Cert'], [false, 'Fals']].map(([v, t]) => (
            <label key={t}>
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
    case 'IMAGE_LABEL': {
      const v = value || {};
      return (
        <div className="stack">
          <ImageWithPoints src={fileUrl(q.imageUrl)} points={c.points} />
          {c.points.map((p, i) => (
            <div className="row" key={p.id}>
              <span className="badge">{i + 1}</span>
              {c.labels ? (
                <select disabled={disabled} value={v[p.id] ?? ''} onChange={(e) => onChange({ ...v, [p.id]: e.target.value })}>
                  <option value="">—</option>
                  {c.labels.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              ) : (
                <input type="text" disabled={disabled} value={v[p.id] ?? ''} onChange={(e) => onChange({ ...v, [p.id]: e.target.value })} />
              )}
            </div>
          ))}
        </div>
      );
    }
    case 'SHORT_TEXT':
      return <input type="text" maxLength={500} disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
    case 'LONG_TEXT':
      return <textarea maxLength={10000} disabled={disabled} value={value ?? ''} onChange={(e) => onChange(e.target.value)} />;
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
                alert(err.message);
              }
            }}
          />
        </div>
      );
    default:
      return null;
  }
}
