import React, { useEffect, useState, useMemo } from 'react';
import { ThemeContext } from './themeContextInstance';

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    try {
      return (
        localStorage.getItem('theme') ||
        localStorage.getItem('routemate-theme') ||
        'light'
      );
    } catch {
      return 'light';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('theme', theme);
      localStorage.setItem('routemate-theme', theme);
    } catch {
      // ignore storage error
    }
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  const value = useMemo(() => ({
    theme,
    toggleTheme: () => {
      setTheme((prev) => (prev === 'light' ? 'dark' : 'light'));
    },
    setTheme,
  }), [theme]);

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

export default ThemeProvider;
