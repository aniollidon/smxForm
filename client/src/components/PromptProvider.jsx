import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

const PromptContext = createContext(null);

export function PromptProvider({ children }) {
  const [dialog, setDialog] = useState(null);
  const dialogRef = useRef(null);

  const openDialog = useCallback((options) => new Promise((resolve) => {
    const next = { ...options, resolve };
    dialogRef.current = next;
    setDialog(next);
  }), []);

  const confirm = useCallback((message, options = {}) => openDialog({
    title: options.title || 'Confirma l’acció',
    message,
    confirmLabel: options.confirmLabel || 'Confirma',
    cancelLabel: options.cancelLabel || 'Cancel·la',
    danger: !!options.danger,
    type: 'confirm',
  }), [openDialog]);

  const alert = useCallback((message, options = {}) => openDialog({
    title: options.title || 'Avís',
    message,
    confirmLabel: options.confirmLabel || 'D’acord',
    type: 'alert',
  }), [openDialog]);

  const close = useCallback((result) => {
    const current = dialogRef.current;
    dialogRef.current = null;
    setDialog(null);
    current?.resolve(result);
  }, []);

  useEffect(() => {
    if (!dialog) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') close(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [dialog, close]);

  return (
    <PromptContext.Provider value={{ confirm, alert }}>
      {children}
      {dialog && createPortal(
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && close(false)}>
          <section className="modal" role="alertdialog" aria-modal="true" aria-labelledby="prompt-title">
            <h3 id="prompt-title">{dialog.title}</h3>
            {typeof dialog.message === 'string' ? <p>{dialog.message}</p> : <div className="modal-message">{dialog.message}</div>}
            <div className="modal-actions">
              {dialog.type === 'confirm' && <button type="button" className="secondary" autoFocus onClick={() => close(false)}>{dialog.cancelLabel}</button>}
              <button type="button" className={dialog.danger ? 'danger' : undefined} autoFocus={dialog.type === 'alert'} onClick={() => close(true)}>{dialog.confirmLabel}</button>
            </div>
          </section>
        </div>,
        document.body,
      )}
    </PromptContext.Provider>
  );
}

export function usePrompt() {
  const context = useContext(PromptContext);
  if (!context) throw new Error('usePrompt s’ha d’utilitzar dins de PromptProvider');
  return context;
}