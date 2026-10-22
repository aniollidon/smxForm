import React, { useEffect, useRef, useState } from 'react';

const W = 1000;
const ERASE_RADIUS = 18;

// Traços en coordenades normalitzades (amplada = 1000); value = { strokes: [[x, y, x, y, ...], ...] }
export default function DrawingBoard({ src, color = '#e11d48', width = 4, value, onChange, readOnly }) {
  const strokes = value?.strokes || [];
  const [tool, setTool] = useState('pen');
  const [ratio, setRatio] = useState(0.75);
  const [live, setLive] = useState(null);
  const svg = useRef(null);
  const drawing = useRef(false);
  const local = useRef(strokes);
  const H = W * ratio;

  useEffect(() => { local.current = value?.strokes || []; }, [value]);

  const point = (e) => {
    const r = svg.current.getBoundingClientRect();
    return [Math.round(((e.clientX - r.left) / r.width) * W), Math.round(((e.clientY - r.top) / r.height) * H)];
  };

  const eraseAt = ([x, y]) => {
    const kept = local.current.filter((s) => {
      for (let i = 0; i < s.length; i += 2) if (Math.hypot(s[i] - x, s[i + 1] - y) <= ERASE_RADIUS) return false;
      return true;
    });
    if (kept.length !== local.current.length) {
      local.current = kept;
      onChange({ strokes: kept });
    }
  };

  const down = (e) => {
    if (readOnly) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    drawing.current = true;
    const p = point(e);
    if (tool === 'erase') return eraseAt(p);
    setLive([...p, ...p]);
  };
  const move = (e) => {
    if (!drawing.current) return;
    const p = point(e);
    if (tool === 'erase') return eraseAt(p);
    setLive((s) => {
      if (!s) return s;
      const lx = s[s.length - 2];
      const ly = s[s.length - 1];
      return Math.hypot(p[0] - lx, p[1] - ly) < 2 || s.length >= 4000 ? s : [...s, ...p];
    });
  };
  const up = () => {
    if (!drawing.current) return;
    drawing.current = false;
    if (live && local.current.length < 500) {
      local.current = [...local.current, live];
      onChange({ strokes: local.current });
    }
    setLive(null);
  };

  const path = (s) => `M${s[0]} ${s[1]}` + (s.length === 4 && s[0] === s[2] && s[1] === s[3] ? 'l0.1 0' : s.slice(2).reduce((acc, n, i) => acc + (i % 2 ? ` ${n}` : ` L${n}`), ''));
  const all = live ? [...strokes, live] : strokes;

  return (
    <div className="stack">
      {!readOnly && (
        <div className="row">
          <button type="button" className={tool === 'pen' ? '' : 'secondary'} onClick={() => setTool('pen')}>Llapis</button>
          <button type="button" className={tool === 'erase' ? '' : 'secondary'} onClick={() => setTool('erase')}>Goma</button>
          <button type="button" className="secondary" disabled={!strokes.length} onClick={() => { local.current = []; onChange({ strokes: [] }); }}>Esborra-ho tot</button>
        </div>
      )}
      <div className="imgwrap drawing-board">
        <img src={src} alt="Imatge de base del dibuix" draggable={false} ref={(el) => el?.complete && el.naturalWidth && setRatio((r) => { const n = el.naturalHeight / el.naturalWidth; return r === n ? r : n; })} onLoad={(e) => e.currentTarget.naturalWidth && setRatio(e.currentTarget.naturalHeight / e.currentTarget.naturalWidth)} />
        <svg
          ref={svg}
          viewBox={`0 0 ${W} ${H}`}
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', touchAction: 'none', cursor: readOnly ? 'default' : tool === 'erase' ? 'cell' : 'crosshair' }}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerCancel={up}
        >
          {all.map((s, i) => (
            <path key={i} d={path(s)} fill="none" stroke={color} strokeWidth={width} strokeLinecap="round" strokeLinejoin="round" />
          ))}
        </svg>
      </div>
    </div>
  );
}
