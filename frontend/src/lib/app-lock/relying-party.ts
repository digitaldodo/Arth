export function getRelyingParty(requestOrigin: string): { origin: string; rpID: string } {
  const url = new URL(requestOrigin);
  const isLocalhost = url.hostname === 'localhost' || url.hostname === '127.0.0.1';
  if (url.protocol !== 'https:' && !isLocalhost) {
    throw new Error('App Lock requires a secure HTTPS connection.');
  }
  return { origin: url.origin, rpID: url.hostname };
}
