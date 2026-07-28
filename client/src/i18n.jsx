/**
 * v1.10.0 — Leichtgewichtige Zweisprachigkeit (DE/EN) für den
 * Experten-Self-Service. Kein Framework: tr(lang, de, en) übersetzt an Ort
 * und Stelle, die Wahl liegt im localStorage. Admin-Konsole bleibt Deutsch.
 */
import { createContext, useContext, useState } from 'react';

const LangContext = createContext({ lang: 'de', setLang: () => {} });

export function LangProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    try { return window.localStorage.getItem('phx-lang') || 'de'; } catch { return 'de'; }
  });
  const setLang = (l) => {
    try { window.localStorage.setItem('phx-lang', l); } catch { /* egal */ }
    setLangState(l);
  };
  return <LangContext.Provider value={{ lang, setLang }}>{children}</LangContext.Provider>;
}

export const useLang = () => useContext(LangContext);
export const tr = (lang, de, en) => (lang === 'en' && en != null ? en : de);
