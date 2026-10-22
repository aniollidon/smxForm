import React, { useEffect, useRef, useState } from 'react';
import { TEXT_SCALES, THEMES, useAccessibility } from './AccessibilityProvider.jsx';

export default function AccessibilityControls() {
  const { enabled, setEnabled, theme, setTheme, textScale, setTextScale, reduceMotion, setReduceMotion, reset } = useAccessibility();
  const [notice, setNotice] = useState('');
  const wrapRef = useRef(null);
  const detailsRef = useRef(null);

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

  return (
    <div className="a11y-controls" ref={wrapRef}>
      <details className={`a11y-settings${enabled ? ' is-on' : ''}`} ref={detailsRef}>
        <summary
          className="a11y-settings-summary"
          aria-label={`Ajustaments d’accessibilitat${enabled ? ' (vista accessible activada)' : ''}`}
        >
          <span aria-hidden="true">⚙</span>
          <span className="a11y-settings-text">Ajustaments</span>
          {enabled && <span className="a11y-settings-state" aria-hidden="true">✓</span>}
        </summary>
        <div className="a11y-panel">
          <div className="a11y-panel-heading">
            <div>
              <span className="a11y-panel-eyebrow">LECTURA I CONFORT</span>
              <h2>Ajustaments d’accessibilitat</h2>
            </div>
            <button type="button" className="a11y-panel-close" onClick={closePanel} aria-label="Tanca els ajustaments">
              <span aria-hidden="true">✕</span>
            </button>
          </div>

          <label className="a11y-switch-row">
            <span className="a11y-switch-copy">
              <b>Vista accessible</b>
              <small>Redueix el moviment, amplia el text i reforça el contrast.</small>
            </span>
            <span className="a11y-switch">
              <input
                type="checkbox"
                role="switch"
                checked={enabled}
                onChange={(event) => {
                  const next = event.target.checked;
                  setEnabled(next);
                  setNotice(next ? 'Vista accessible activada.' : 'Vista accessible desactivada.');
                }}
              />
              <span className="a11y-switch-track" aria-hidden="true" />
            </span>
          </label>

          {enabled ? (
            <div className="a11y-options">
              <fieldset>
                <legend>Mida del text</legend>
                <div className="a11y-scale-options">
                  {TEXT_SCALES.map((scale) => (
                    <button
                      key={scale}
                      type="button"
                      aria-pressed={textScale === scale}
                      onClick={() => setTextScale(scale)}
                    >
                      {Math.round(scale * 100)} %
                    </button>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>Colors i contrast</legend>
                <div className="a11y-theme-options">
                  {THEMES.map((option) => (
                    <label className="a11y-theme-option" key={option.id}>
                      <input
                        type="radio"
                        name="a11y-theme"
                        value={option.id}
                        checked={theme === option.id}
                        onChange={() => setTheme(option.id)}
                      />
                      <span>
                        <b>{option.label}</b>
                      </span>
                    </label>
                  ))}
                </div>
              </fieldset>

              <fieldset>
                <legend>Moviment</legend>
                <label className="a11y-check">
                  <input
                    type="checkbox"
                    checked={reduceMotion}
                    onChange={(event) => setReduceMotion(event.target.checked)}
                  />
                  <span>Redueix animacions i desplaçament suau</span>
                </label>
              </fieldset>

              <button type="button" className="secondary a11y-reset" onClick={() => { reset(); setNotice('Ajustaments restablerts.'); }}>
                Restableix els ajustaments
              </button>
              <p className="a11y-panel-note">Els ajustaments es desen en aquest navegador.</p>
            </div>
          ) : (
            <p className="a11y-panel-hint">Activa la vista accessible per ajustar la mida del text, els colors i el moviment.</p>
          )}
        </div>
      </details>

      <span className="visually-hidden" role="status" aria-live="polite">{notice}</span>
    </div>
  );
}
