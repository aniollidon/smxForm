import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';

const STORAGE_KEY = 'palamform.accessibility';

export const TEXT_SCALES = [1, 1.25, 1.5, 1.75, 2];

export const THEMES = [
  { id: 'soft-dark', label: 'Fosc suau', description: 'Blanc trencat sobre fons fosc, per reduir l’enlluernament.' },
  { id: 'light', label: 'Clar', description: 'Text fosc sobre paper càlid, sense blanc pur.' },
  { id: 'contrast', label: 'Alt contrast', description: 'Contrast reforçat per a baixa visió.' },
];

const THEME_IDS = THEMES.map((theme) => theme.id);

function systemPreferences() {
  if (typeof window === 'undefined' || !window.matchMedia) return { theme: 'soft-dark', reduceMotion: false };
  const contrast = window.matchMedia('(prefers-contrast: more)').matches;
  const light = window.matchMedia('(prefers-color-scheme: light)').matches;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return { theme: contrast ? 'contrast' : light ? 'light' : 'soft-dark', reduceMotion: reduce };
}

function loadState() {
  const fallback = systemPreferences();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { enabled: false, textScale: 1, ...fallback, hasSaved: false };
    const saved = JSON.parse(raw);
    const scale = Number(saved.textScale);
    return {
      enabled: saved.enabled === true,
      theme: THEME_IDS.includes(saved.theme) ? saved.theme : fallback.theme,
      textScale: TEXT_SCALES.includes(scale) ? scale : 1,
      reduceMotion: typeof saved.reduceMotion === 'boolean' ? saved.reduceMotion : fallback.reduceMotion,
      hasSaved: true,
    };
  } catch {
    return { enabled: false, textScale: 1, ...fallback, hasSaved: false };
  }
}

const AccessibilityContext = createContext(null);

export function AccessibilityProvider({ children }) {
  const initial = useRef(null);
  if (initial.current === null) initial.current = loadState();

  const [enabled, setEnabledState] = useState(initial.current.enabled);
  const [theme, setThemeState] = useState(initial.current.theme);
  const [textScale, setTextScaleState] = useState(initial.current.textScale);
  const [reduceMotion, setReduceMotionState] = useState(initial.current.reduceMotion);
  const hasSaved = useRef(initial.current.hasSaved);

  const remember = useCallback(() => {
    hasSaved.current = true;
  }, []);

  const setEnabled = useCallback((value) => {
    remember();
    setEnabledState(value === true);
  }, [remember]);

  const setTheme = useCallback((value) => {
    if (!THEME_IDS.includes(value)) return;
    remember();
    setThemeState(value);
  }, [remember]);

  const setTextScale = useCallback((value) => {
    const next = Number(value);
    if (!TEXT_SCALES.includes(next)) return;
    remember();
    setTextScaleState(next);
  }, [remember]);

  const setReduceMotion = useCallback((value) => {
    remember();
    setReduceMotionState(value === true);
  }, [remember]);

  const reset = useCallback(() => {
    const system = systemPreferences();
    remember();
    setTextScaleState(1);
    setThemeState(system.theme);
    setReduceMotionState(system.reduceMotion);
  }, [remember]);

  // Respecta canvis del sistema mentre l'usuari encara no ha desat preferències.
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return undefined;
    const queries = [
      window.matchMedia('(prefers-contrast: more)'),
      window.matchMedia('(prefers-color-scheme: light)'),
      window.matchMedia('(prefers-reduced-motion: reduce)'),
    ];
    const onChange = () => {
      if (hasSaved.current) return;
      const next = systemPreferences();
      setThemeState(next.theme);
      setReduceMotionState(next.reduceMotion);
    };
    queries.forEach((query) => query.addEventListener?.('change', onChange));
    return () => queries.forEach((query) => query.removeEventListener?.('change', onChange));
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ enabled, theme, textScale, reduceMotion }));
    } catch {
      // Sense emmagatzematge: la vista continua funcionant durant la sessió.
    }
  }, [enabled, theme, textScale, reduceMotion]);

  const value = useMemo(() => ({
    enabled,
    setEnabled,
    theme,
    setTheme,
    textScale,
    setTextScale,
    reduceMotion,
    setReduceMotion,
    reset,
  }), [enabled, setEnabled, theme, setTheme, textScale, setTextScale, reduceMotion, setReduceMotion, reset]);

  return <AccessibilityContext.Provider value={value}>{children}</AccessibilityContext.Provider>;
}

export function useAccessibility() {
  const context = useContext(AccessibilityContext);
  if (!context) throw new Error('useAccessibility s’ha d’utilitzar dins de AccessibilityProvider');
  return context;
}
