let csrf = '';
export function setCsrf(value: string) { csrf = value; }
export async function apiFetch(url: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (init.method && !['GET', 'HEAD'].includes(init.method.toUpperCase())) {
    headers.set('Content-Type', 'application/json');
    headers.set('X-Solarb-Request', '1');
    headers.set('X-CSRF-Token', csrf);
    if (!init.body) init = { ...init, body: '{}' };
  }
  const response = await fetch(url, { ...init, headers, credentials: 'same-origin' });
  if (response.status === 401 && url !== '/api/login') window.dispatchEvent(new Event('solarb-session-expired'));
  return response;
}
