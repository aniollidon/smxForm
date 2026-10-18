import React, { useEffect, useState } from 'react';
import { blockQuestions, buildBlocks } from '../layout.js';
import MarkdownText from './MarkdownText.jsx';

export function Blocks({ blocks, render }) {
  return blocks.map((block) => {
    if (block.type === 'section') return <h2 className="section-heading" key={`s-${block.title}`}>{block.title}</h2>;
    if (block.type === 'group') {
      return (
        <div className="card group-card" key={`g-${block.group.id}-${block.entries[0].index}`}>
          <div className="group-text"><MarkdownText>{block.group.text}</MarkdownText></div>
          <div className="group-children">{block.entries.map(({ item, index }) => render(item, index, true))}</div>
        </div>
      );
    }
    return render(block.item, block.index, false);
  });
}

// Tot el contingut en una pàgina, amb les seccions com a títols (respostes i correcció).
export function QuestionFlow({ items, groups, get, render }) {
  return <Blocks blocks={buildBlocks(items, groups, get)} render={render} />;
}

// Una pàgina per secció, amb punts de navegació a la part superior.
export default function PagedQuestions({ pages, page, onPage, render, isIncomplete, flagAll, footer }) {
  const [visited, setVisited] = useState(() => new Set([0]));
  useEffect(() => {
    setVisited((v) => (v.has(page) ? v : new Set(v).add(page)));
    window.scrollTo({ top: 0 });
  }, [page]);
  const multi = pages.length > 1;
  const current = pages[Math.min(page, pages.length - 1)];
  const incomplete = (i) => pages[i].blocks.some((b) => blockQuestions(b).some(isIncomplete));
  return (
    <>
      {multi && (
        <nav className="section-stepper" aria-label="Seccions">
          <ol>
            {pages.map((p, i) => {
              const warn = i !== page && (flagAll || visited.has(i)) && incomplete(i);
              const done = i !== page && visited.has(i) && !warn;
              const name = p.title || `Secció ${i + 1}`;
              return (
                <li key={i} className={`section-step${i === page ? ' is-current' : ''}${warn ? ' is-warning' : done ? ' is-done' : ''}`}>
                  <button type="button" onClick={() => onPage(i)} aria-current={i === page ? 'step' : undefined} title={warn ? `${name} · preguntes obligatòries sense respondre` : name}>
                    <span className="section-step-mark">{warn ? '!' : done ? '✓' : i + 1}</span>
                    <span className="section-step-label">{name}</span>
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>
      )}
      {multi && (
        <div className="section-banner">
          <span className="eyebrow">SECCIÓ {page + 1} DE {pages.length}</span>
          <h2>{current.title || `Secció ${page + 1}`}</h2>
        </div>
      )}
      {!multi && current.title && <h2 className="section-heading">{current.title}</h2>}
      <Blocks blocks={current.blocks} render={render} />
      {multi && (
        <div className="section-pager">
          <button type="button" className="secondary" disabled={page === 0} onClick={() => onPage(page - 1)}>← Anterior</button>
          <span className="muted">{page + 1} / {pages.length}</span>
          <button type="button" disabled={page === pages.length - 1} onClick={() => onPage(page + 1)}>Següent →</button>
        </div>
      )}
      {page === pages.length - 1 && footer}
    </>
  );
}
