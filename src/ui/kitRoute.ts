// The dev-only kit page (SPEC §10.4) is requested with a `kit` query parameter.
export function isKitRequested(search: string): boolean {
  return new URLSearchParams(search).has('kit')
}
