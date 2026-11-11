export function appBasename(baseUrl: string): string {
  return baseUrl.replace(/\/$/, '') || '/';
}
