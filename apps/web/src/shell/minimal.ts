import copy from '../../../../content/minimal.json';
import ru from '../i18n/ru.json';
import en from '../i18n/en.json';
import { minimalLocale, minimalPath } from '../lib/minimal-routes';
import { mountInkHover } from '../lib/ink-hover';
type Locale = 'ru' | 'en';
const gallery = document.body.dataset.gallery === 'true';
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const desktop = matchMedia('(min-width: 701px)');
let art: { setCalm(value: boolean): void; destroy(): void } | undefined;
let artGeneration = 0;
// The removed UI preference must not silently disable effects in returning browsers.
const isCalm = () => reduced.matches;

function locale(): Locale { return minimalLocale(location.pathname); }
function translate() {
  const language = locale();
  document.documentElement.lang = language;
  document.querySelectorAll<HTMLElement>('[data-l10n]').forEach(element => { element.textContent = element.dataset[language] ?? ''; });
  document.querySelectorAll<HTMLElement>('[data-aria-ru]').forEach(element => { element.setAttribute('aria-label', element.dataset[language === 'ru' ? 'ariaRu' : 'ariaEn'] ?? ''); });
  document.querySelectorAll<HTMLElement>('[data-title-ru]').forEach(element => { element.title = element.dataset[language === 'ru' ? 'titleRu' : 'titleEn'] ?? ''; });
  document.querySelectorAll<HTMLElement>('[data-language]').forEach(element => { if (element.dataset.language === language) element.setAttribute('aria-current','page'); else element.removeAttribute('aria-current'); });
  document.title = gallery ? (language === 'ru' ? ru.minimal.gallery : en.minimal.gallery) : copy[language].title;
  document.querySelector('meta[name=description]')!.setAttribute('content', copy[language].description);
  const cv = document.querySelector<HTMLAnchorElement>('[data-cv]');
  if (cv) { cv.href = language === 'ru' ? '/cv.pdf' : '/en/cv.pdf'; cv.download = `Matvei-Riabushkin-CV-${language.toUpperCase()}.pdf`; }
  document.querySelectorAll<HTMLAnchorElement>('[data-home-link]').forEach(link => { link.href = minimalPath(language); });
  document.dispatchEvent(new Event('localechange'));
  document.querySelector('[data-language-status]')!.textContent = document.title;
}
function calm() {
  document.documentElement.dataset.calm = String(isCalm());
  art?.setCalm(isCalm());
}
async function syncArt() {
  const generation = ++artGeneration;
  if (!desktop.matches && !gallery) { art?.destroy(); art = undefined; return; }
  if (art) return;
  const { mountAtlas } = await import('../lib/atlas');
  if (generation !== artGeneration || art) return;
  art = mountAtlas(document.querySelector<HTMLElement>('[data-postcard]')!, isCalm());
}
document.querySelectorAll<HTMLAnchorElement>('[data-language]').forEach(link => link.addEventListener('click', event => {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || link.dataset.language === locale()) return;
  event.preventDefault();
  const target = new URL(link.href); target.search = location.search;
  history.pushState({ ...history.state, locale: link.dataset.language }, '', target);
  // Patch text and attributes only: the art node, canvas and current animation are untouched.
  translate();
}));
window.addEventListener('popstate', translate);
reduced.addEventListener('change', calm);
desktop.addEventListener('change', () => void syncArt());
window.addEventListener('pagehide', () => { artGeneration++; art?.destroy(); art = undefined; });
window.addEventListener('pageshow', event => { if (event.persisted) void syncArt(); });
calm();
mountInkHover(reduced);
if (document.readyState === 'complete') void syncArt();
else window.addEventListener('load', () => void syncArt(), { once: true });
