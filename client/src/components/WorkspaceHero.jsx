import React from 'react';
import ArchitectureArt from './ArchitectureArt.jsx';

export default function WorkspaceHero({ eyebrow, title, description }) {
  return (
    <section className="workspace-hero">
      <div className="workspace-copy">
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      <ArchitectureArt />
      <span className="hero-coordinate">S / 01.24</span>
    </section>
  );
}