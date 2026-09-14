import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { Connection, PublicKey } from '@solana/web3.js';
import { installAuth } from './backend/auth.ts';
import { sanitizeConfig, writeConfig, readConfig } from './backend/config.ts';

export function createApp(options: { origin: string; passwordHash: string; dataDir: string; root: string; now?: () => number; spawnBot?: typeof spawn; publicAddress?: string }) {
  const app = express();
  app.use(express.json({ limit: '256kb', strict: true }));
  installAuth(app, options);
  const configPath = path.join(options.dataDir, 'scanner.json');
  let bot: ChildProcess | null = null;
  let stopping = false;
  const logs: { text: string; type: string; timestamp: string }[] = [];
  const log = (text: string) => {
    logs.push({ text, type: 'info', timestamp: new Date().toLocaleTimeString('tr-TR') });
    if (logs.length > 100) logs.shift();
  };
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.post('/api/save-bot', (_req, res) => res.status(410).json({ error: 'Web üzerinden kod yükleme kaldırıldı. Yalnızca tarama ayarları kaydedilebilir.' }));
  app.post('/api/save-config', (req, res) => {
    try { writeConfig(options.dataDir, sanitizeConfig(req.body)); res.json({ success: true }); }
    catch { res.status(400).json({ error: 'Ayarlar reddedildi. Anahtar, parola, URL veya canlı işlem ayarı gönderilemez.' }); }
  });
  app.get('/api/load-config', (_req, res) => {
    try { res.json({ success: true, config: readConfig(options.dataDir) }); }
    catch { res.status(500).json({ error: 'Tarama ayarları okunamadı.' }); }
  });
  app.get('/api/wallet', (_req, res) => {
    let address: string | null = null;
    try { if (options.publicAddress) address = new PublicKey(options.publicAddress).toBase58(); } catch {}
    res.json({ address, source: 'operator-configured', mode: 'scanner-only' });
  });
  app.post('/api/bot/start', (_req, res) => {
    if (bot) return res.status(409).json({ success: false, error: 'Tarayıcı zaten çalışıyor veya durduruluyor.' });
    try {
      writeConfig(options.dataDir, readConfig(options.dataDir));
      // Never inherit key files, NODE_OPTIONS, preload hooks, RPC credentials or live flags.
      const env: NodeJS.ProcessEnv = {
        NODE_ENV: 'production', SOLANA_DRY_RUN: 'true', SOLARB_PANEL_SCANNER: 'true',
        SOLARB_CONFIG_FILE: configPath, SOLANA_RPC_URL: 'https://api.mainnet-beta.solana.com',
        JUPITER_API_URL: 'https://api.jup.ag/swap/v1',
        ...(process.platform === 'win32' ? { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP } : {}),
      };
      if (process.env.SCANNER_JUPITER_API_KEY) env.JUPITER_API_KEY = process.env.SCANNER_JUPITER_API_KEY;
      const child = (options.spawnBot || spawn)(process.execPath, [path.join(options.root, 'SOLArb', 'bot.ts')], {
        cwd: options.root, shell: false, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
      });
      bot = child; stopping = false;
      log('Anahtarsız tarayıcı başlatıldı. Canlı işlem servisi panelden yönetilmez.');
      child.stdout?.on('data', (chunk: Buffer) => {
        for (const line of chunk.toString().split('\n')) {
          const count = line.match(/\[Keşif\] (\d+) filtrelenmiş token \/ hedef (\d+)/);
          if (count) log('Keşif: ' + count[1] + ' token / hedef ' + count[2]);
          if (line.includes('[FIRSAT ADAYI / TARAMA]')) log('Yeni fırsat adayı bulundu. İşlem gönderilmedi.');
        }
      });
      child.stderr?.on('data', () => log('Tarayıcı bir hata bildirdi. Sunucu kotasını ve ayarlarını kontrol edin.'));
      child.once('error', () => { if (bot === child) { bot = null; stopping = false; } log('Tarayıcı başlatılamadı.'); });
      child.once('close', () => { if (bot === child) { bot = null; stopping = false; } log('Tarayıcı durdu.'); });
      res.json({ success: true });
    } catch { bot = null; res.status(500).json({ error: 'Tarayıcı başlatılamadı.' }); }
  });
  app.post('/api/bot/stop', (_req, res) => {
    if (!bot) return res.json({ success: true });
    if (!stopping) { stopping = true; bot.kill('SIGTERM'); }
    res.json({ success: true, message: 'Durdurma istendi.' });
  });
  app.get('/api/bot/status', (_req, res) => res.json({ success: true, running: bot !== null, stopping, mode: 'scanner-only', logs }));
  let spyBusy = false, nextSpy = 0;
  app.get('/api/spy-wallet', async (req, res) => {
    if (spyBusy || Date.now() < nextSpy) return res.status(429).json({ error: 'Cüzdan sorgusu için 30 saniye bekleyin.' });
    if (req.query.rpcUrl !== undefined) return res.status(400).json({ error: 'Tarayıcıdan RPC URL kabul edilmez.' });
    let owner: PublicKey;
    try { owner = new PublicKey(String(req.query.walletAddress)); } catch { return res.status(400).json({ error: 'Geçersiz cüzdan adresi.' }); }
    spyBusy = true; nextSpy = Date.now() + 30000;
    try {
      const connection = new Connection('https://api.mainnet-beta.solana.com', {
        commitment: 'confirmed', disableRetryOnRateLimit: true,
        fetch: (url, init) => fetch(url, { ...init, signal: AbortSignal.timeout(10000) }),
      });
      const found = await connection.getParsedTokenAccountsByOwner(owner, { programId: new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') });
      const mints = [...new Set(found.value.map(a => a.account.data.parsed?.info?.mint).filter((m): m is string => typeof m === 'string'))].slice(0, 5000);
      res.json({ success: true, tokens: mints.map(mint => ({ mint, symbol: 'SPL_' + mint.slice(0, 6), name: 'Cüzdan tokeni' })) });
    } catch { res.status(502).json({ error: 'Cüzdan verisi alınamadı.' }); }
    finally { spyBusy = false; }
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Bilinmeyen API.' }));
  app.use(express.static(path.join(options.root, 'dist'), { dotfiles: 'deny', index: false }));
  app.get('*', (_req, res) => res.sendFile(path.join(options.root, 'dist', 'index.html')));
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    res.status(err?.type === 'entity.too.large' ? 413 : 400).json({ error: 'İstek işlenemedi.' });
  });
  return { app, stop: () => { bot?.kill('SIGTERM'); } };
}

export async function startServer() {
  if (process.env.SOLANA_PRIVATE_KEY || process.env.SOLANA_KEYPAIR_FILE || process.env.BOT_ENV_FILE) throw new Error('Panel ortamından bot sırlarını kaldırın.');
  const hashFile = process.env.PANEL_PASSWORD_HASH_FILE;
  if (!hashFile || !path.isAbsolute(hashFile)) throw new Error('PANEL_PASSWORD_HASH_FILE mutlak yol olarak gerekli.');
  const stat = fs.lstatSync(hashFile);
  if (!stat.isFile() || stat.isSymbolicLink() || (process.platform !== 'win32' && (stat.mode & 0o077) !== 0)) throw new Error('Parola özeti dosyası yalnızca sahibi tarafından okunabilir olmalı (0600).');
  const origin = process.env.PANEL_ORIGIN || 'http://127.0.0.1:3000';
  const root = process.cwd();
  const dataDir = path.resolve(process.env.PANEL_DATA_DIR || path.join(root, 'var', 'panel'));
  const { app, stop } = createApp({ origin, passwordHash: fs.readFileSync(hashFile, 'utf8').trim(), dataDir, root, publicAddress: process.env.SOLANA_PUBLIC_ADDRESS });
  const server = app.listen(3000, '127.0.0.1', () => console.log('Panel: ' + origin));
  server.requestTimeout = 15000; server.headersTimeout = 10000;
  for (const signal of ['SIGINT', 'SIGTERM'] as const) process.once(signal, () => { stop(); server.close(); });
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  startServer().catch(() => { console.error('Panel başlatılamadı. Güvenli kurulum rehberini ve dosya izinlerini kontrol edin.'); process.exitCode = 1; });
}
