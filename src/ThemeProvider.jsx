import { createContext, useContext, useState, useEffect, useCallback } from 'react';

const ThemeContext = createContext({ theme: 'dark', toggleTheme: () => {} });

const STORAGE_KEY = 'ora-theme';

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) || 'dark';
    } catch {
      return 'dark';
    }
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(STORAGE_KEY, theme); } catch { /* noop */ }
  }, [theme]);

  const toggleTheme = useCallback(() => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
