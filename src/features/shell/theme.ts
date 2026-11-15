'use client';
export type Theme = 'light' | 'dark';

export function getTheme(): Theme {
  try {
    return localStorage.getItem('theme') === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function setTheme(t: Theme) {
  document.documentElement.classList.toggle('dark', t === 'dark');
  try {
    localStorage.setItem('theme', t);
  } catch {
    /* private mode */
  }
}

/** Runs before the page paints so dark mode never flashes white. */
export const THEME_BOOT = `try{if(localStorage.getItem('theme')==='dark')document.documentElement.classList.add('dark')}catch(e){}`;
