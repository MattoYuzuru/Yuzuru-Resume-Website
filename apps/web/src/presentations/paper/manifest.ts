export const paperPresentation = {
  id: 'paper', pages: ['home'], locales: ['ru', 'en'], status: 'local-preview',
  renderer: 'static-dom-and-optional-glyph-webgl2', fallback: 'webp-glyph-poster',
  mobile: 'text-only', reducedMotion: 'static',
  teardown: 'abort-listeners-disconnect-observer-cancel-raf',
} as const;
