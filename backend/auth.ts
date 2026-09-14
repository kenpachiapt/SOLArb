import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { Express, Request, Response } from 'express';

const derive = (password: string, salt: Buffer) => new Promise<Buffer>((resolve, reject) => {
  scrypt(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 }, (err, key) => err ? reject(err) : resolve(key));
});
export async function hashPassword(password: string) {
  if (password.length < 16 || password.length > 256) throw new Error('Parola 16–256 karakter olmalı.');
  const salt = randomBytes(16);
  return 'scrypt$' + salt.toString('hex') + '$' + (await derive(password, salt)).toString('hex');
}
export function validHash(hash: string) { return /^scrypt\$[a-f0-9]{32}\$[a-f0-9]{128}$/.test(hash); }
export async function verifyPassword(password: string, hash: string) {
  if (!validHash(hash) || password.length > 256) return false;
  const [, salt, expected] = hash.split('$');
  return timingSafeEqual(await derive(password, Buffer.from(salt, 'hex')), Buffer.from(expected, 'hex'));
}

export function installAuth(app: Express, options: { origin: string; passwordHash: string; now?: () => number }) {
  if (!validHash(options.passwordHash)) throw new Error('Geçerli PANEL_PASSWORD_HASH_FILE gerekli.');
  const origin = new URL(options.origin);
  if (origin.origin !== options.origin || (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname)))) throw new Error('PANEL_ORIGIN HTTPS veya yerel HTTP olmalı.');
  const now = options.now || Date.now;
  const secure = origin.protocol === 'https:';
  const cookieName = secure ? '__Host-solarb_session' : 'solarb_session';
  const cookieOptions = { httpOnly: true, secure, sameSite: 'strict' as const, path: '/' };
  const sessions = new Map<string, { csrf: string; created: number; touched: number }>();
  // One administrator: a global throttle cannot be bypassed by rotating IPs/forwarded headers.
  let attempts: number[] = [];
  let loginBusy = false;
  const sessionId = (req: Request) => {
    const cookie = req.headers.cookie || '';
    const value = cookie.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    return value && /^[a-f0-9]{64}$/.test(value) ? value : '';
  };
  const session = (req: Request) => {
    const id = sessionId(req), entry = sessions.get(id);
    if (!entry || now() - entry.touched > 15 * 60_000 || now() - entry.created > 8 * 3600_000) { sessions.delete(id); return null; }
    return entry;
  };
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'no-referrer',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()', 'Cross-Origin-Opener-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://api.jup.ag https://api.coingecko.com https://api.binance.com; frame-ancestors 'none'; object-src 'none'; base-uri 'none'; form-action 'self'" });
    if (secure) res.set('Strict-Transport-Security', 'max-age=31536000');
    if (req.headers.host !== origin.host) return res.status(403).json({ error: 'Geçersiz Host.' });
    if (req.path.toLowerCase().startsWith('/api/')) {
      res.set('Cache-Control', 'no-store');
      if (req.headers.origin && req.headers.origin !== origin.origin) return res.status(403).json({ error: 'Geçersiz Origin.' });
      if (!['GET', 'HEAD'].includes(req.method) && (req.headers.origin !== origin.origin || req.headers['x-solarb-request'] !== '1' || !req.is('application/json'))) return res.status(403).json({ error: 'Aynı origin JSON isteği gerekli.' });
    }
    next();
  });
  app.post('/api/login', async (req: Request, res: Response) => {
    attempts = attempts.filter(t => now() - t < 15 * 60_000);
    if (attempts.length >= 5 || loginBusy) return res.status(429).set('Retry-After', '900').json({ error: 'Çok fazla deneme. 15 dakika sonra tekrar deneyin.' });
    attempts.push(now()); loginBusy = true;
    try {
      const password = req.body?.password;
      if (typeof password !== 'string' || !await verifyPassword(password, options.passwordHash)) return res.status(401).json({ error: 'Giriş başarısız.' });
      // Rotate every login and keep only one active administrator session.
      sessions.clear();
      const id = randomBytes(32).toString('hex'), csrf = randomBytes(32).toString('hex');
      sessions.set(id, { csrf, created: now(), touched: now() });
      res.cookie(cookieName, id, { ...cookieOptions, maxAge: 8 * 3600_000 }).json({ success: true, csrf });
    } catch { res.status(500).json({ error: 'Giriş işlenemedi.' }); }
    finally { loginBusy = false; }
  });
  app.use('/api', (req, res, next) => {
    const entry = session(req);
    if (!entry) return res.status(401).json({ error: 'Oturum gerekli.' });
    if (!['GET', 'HEAD'].includes(req.method) && req.headers['x-csrf-token'] !== entry.csrf) return res.status(403).json({ error: 'CSRF doğrulaması başarısız.' });
    // Polling does not keep an abandoned browser session alive indefinitely.
    if (req.method !== 'GET') entry.touched = now();
    next();
  });
  app.get('/api/session', (req, res) => res.json({ success: true, csrf: session(req)!.csrf }));
  app.post('/api/logout', (req, res) => { sessions.delete(sessionId(req)); res.clearCookie(cookieName, cookieOptions).json({ success: true }); });
}
