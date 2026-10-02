import { getPref, setPref } from '../repository/storage';

export function getTheme() {
  const saved = getPref('theme', null);
  if (saved === 'dark' || saved === 'light') return saved;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
export function applyTheme(t) {
  document.documentElement.dataset.theme = t;
}
export function setTheme(t) {
  setPref('theme', t);
  applyTheme(t);
}
export function initTheme() {
  applyTheme(getTheme());
}
