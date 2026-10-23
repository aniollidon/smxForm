import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../api';

export default function ImpersonationMenu() {
  const qc = useQueryClient();
  const nav = useNavigate();
  const wrapRef = useRef(null);
  const detailsRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState('');

  const { data: students, isLoading } = useQuery({
    queryKey: ['teacher-students'],
    queryFn: () => api('/api/teacher/students'),
    enabled: open,
    staleTime: 30_000,
  });

  useEffect(() => {
    const onPointerDown = (event) => {
      if (detailsRef.current?.open && !wrapRef.current?.contains(event.target)) detailsRef.current.open = false;
    };
    const onKeyDown = (event) => {
      if (event.key !== 'Escape' || !detailsRef.current?.open) return;
      detailsRef.current.open = false;
      detailsRef.current.querySelector('summary')?.focus();
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const closePanel = () => {
    if (!detailsRef.current) return;
    detailsRef.current.open = false;
    detailsRef.current.querySelector('summary')?.focus();
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = students ?? [];
    if (!term) return list;
    return list.filter((student) => `${student.name ?? ''} ${student.email}`.toLowerCase().includes(term));
  }, [students, search]);

  const impersonate = async (student) => {
    setBusyId(student.id);
    setError('');
    try {
      await api('/api/teacher/impersonate', { method: 'POST', body: { userId: student.id } });
      qc.clear();
      closePanel();
      nav('/s');
    } catch (e) {
      setError(e.message || 'No s’ha pogut obrir la vista de l’alumne.');
      setBusyId(null);
    }
  };

  return (
    <div className="impersonation-controls" ref={wrapRef}>
      <details className="impersonation-menu" ref={detailsRef} onToggle={(event) => setOpen(event.currentTarget.open)}>
        <summary className="impersonation-summary" aria-label="Veure l’aplicació com un alumne">
          <span aria-hidden="true">⇄</span>
          <span className="impersonation-summary-text">Veure com a</span>
        </summary>
        <div className="impersonation-panel">
          <div className="impersonation-heading">
            <div>
              <span className="impersonation-eyebrow">MODE PROFESSORAT</span>
              <h2>Veure com a un alumne</h2>
            </div>
            <button type="button" className="impersonation-close" onClick={closePanel} aria-label="Tanca el selector d’alumnes">
              <span aria-hidden="true">✕</span>
            </button>
          </div>
          <p className="impersonation-note">
            Navegaràs amb la identitat d’aquest alumne. Les respostes que enviïs es desaran com a seves.
          </p>
          <label className="impersonation-search">
            <span className="visually-hidden">Cerca alumnes</span>
            <input
              type="search"
              placeholder="Cerca per nom o correu"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          {isLoading && <p className="muted">Carregant alumnes…</p>}
          {!isLoading && !filtered.length && (
            <p className="impersonation-empty">Cap alumne trobat. Els alumnes apareixen aquí després d’entrar-hi almenys una vegada.</p>
          )}
          {filtered.length > 0 && (
            <ul className="impersonation-list">
              {filtered.map((student) => (
                <li key={student.id}>
                  <button type="button" disabled={busyId !== null} onClick={() => impersonate(student)}>
                    <span className="impersonation-student">
                      <b>{student.name || student.email}</b>
                      <small>{student.email}</small>
                    </span>
                    <span className="impersonation-student-action" aria-hidden="true">{busyId === student.id ? '…' : '→'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="error">{error}</p>}
        </div>
      </details>
    </div>
  );
}
