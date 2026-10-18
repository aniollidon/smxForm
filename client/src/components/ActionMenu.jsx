import React, { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';

// items: { label, onClick | to, danger }; els valors falsos s'ignoren.
export default function ActionMenu({ items }) {
  const ref = useRef(null);
  const list = items.filter(Boolean);
  useEffect(() => {
    const close = (event) => {
      if (ref.current?.open && !ref.current.contains(event.target)) ref.current.open = false;
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);
  if (!list.length) return null;
  const done = () => { if (ref.current) ref.current.open = false; };
  return (
    <details className="format-menu" ref={ref}>
      <summary aria-label="Més accions" title="Més accions">⋯</summary>
      <div className="format-menu-popover">
        {list.map((item) => (item.to
          ? <Link key={item.label} to={item.to}>{item.label}</Link>
          : <button key={item.label} type="button" className={`menu-item${item.danger ? ' is-danger' : ''}`} onClick={() => { done(); item.onClick(); }}>{item.label}</button>))}
      </div>
    </details>
  );
}
