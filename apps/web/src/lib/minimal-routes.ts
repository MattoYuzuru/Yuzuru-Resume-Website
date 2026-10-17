export type MinimalLocale = 'ru' | 'en';

/** English owns the root. Existing /en/ URLs remain valid aliases. */
export function minimalLocale(pathname: string): MinimalLocale {
  return pathname === '/ru' || pathname.startsWith('/ru/') ? 'ru' : 'en';
}

export function minimalPath(locale: MinimalLocale, gallery = false): string {
  return `${locale === 'ru' ? '/ru' : ''}/${gallery ? 'art/' : ''}`;
}

export function formatCoordinates(latitude: number, longitude: number): string {
  return `${Math.abs(latitude).toFixed(4)}° ${latitude < 0 ? 'S' : 'N'}, ${Math.abs(longitude).toFixed(4)}° ${longitude < 0 ? 'W' : 'E'}`;
}
