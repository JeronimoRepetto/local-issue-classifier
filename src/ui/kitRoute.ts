// The dev-only kit page is requested with a `kit` query parameter.
export function isKitRequested(search: string): boolean {
  return new URLSearchParams(search).has('kit')
}
