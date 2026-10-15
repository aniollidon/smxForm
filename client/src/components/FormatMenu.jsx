import React from 'react';
import { Link } from 'react-router-dom';

export default function FormatMenu() {
  return (
    <details className="format-menu">
      <summary aria-label="Més opcions" title="Més opcions">⋯</summary>
      <div className="format-menu-popover">
        <Link to="/format">Especificació del format</Link>
      </div>
    </details>
  );
}