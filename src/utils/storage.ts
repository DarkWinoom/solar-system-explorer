export function readPreference(key: string): string | null {
  try {
    return localStorage.getItem(`orbital.${key}`);
  } catch {
    return null;
  }
}
export function savePreference(key: string, value: string | null): void {
  try {
    if (value === null) localStorage.removeItem(`orbital.${key}`);
    else localStorage.setItem(`orbital.${key}`, value);
  } catch {
    /* Storage may be unavailable in private browsing. */
  }
}
