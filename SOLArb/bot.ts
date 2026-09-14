/**
 * ====================================================================
 * SOLArb - ÇOKLU PARİTE VE MEME COIN ARBİTRAJ BOTU (GÜNCEL SÜRÜM)
 * ====================================================================
 * Bu bot, Solana Mainnet üzerinde dairesel arbitraj fırsatlarını arar.
 * "Tüm Pariteler" modu seçildiğinde, cüzdanınızdaki başlangıç varlığını koruyarak
 * JUP, BONK, WIF, USDC, USDT ve eklediğiniz pump.fun tokenlerinde fırsat kovalayıp
 * gerçek teklifler üzerinden fırsat adaylarını tarar. Varsayılan mod işlem göndermez.
 */

import { Connection, Keypair, VersionedTransaction, PublicKey, TransactionMessage, SystemProgram } from "@solana/web3.js";
import * as dotenv from "dotenv";
import bs58 from "bs58";
import * as dns from "dns";
import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Node.js'in IPv6 önceliği sebebiyle oluşan DNS ENOTFOUND hatalarını önle
if (dns && typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}


function readPrivateFile(filename: string): string {
  if (!path.isAbsolute(filename)) throw new Error('Sır dosyası mutlak yol olmalı.');
  const stat = fs.lstatSync(filename);
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > 16384) throw new Error('Geçersiz sır dosyası.');
  if (process.platform !== 'win32') {
    const uid = process.getuid?.();
    if ((stat.mode & 0o077) !== 0 || (stat.uid !== uid && stat.uid !== 0)) throw new Error('Sır dosyası izinleri 0600 olmalı.');
  }
  return fs.readFileSync(filename, 'utf8').trim();
}
function walletFromFile(): Keypair {
  if (process.env.SOLANA_PRIVATE_KEY) throw new Error('SOLANA_PRIVATE_KEY kaldırıldı; SOLANA_KEYPAIR_FILE kullanın.');
  const filename = process.env.SOLANA_KEYPAIR_FILE;
  if (!filename) throw new Error('SOLANA_KEYPAIR_FILE gerekli.');
  let text = readPrivateFile(filename);
  let bytes: Uint8Array | undefined;
  try {
    if (text.startsWith('[')) {
      const data = JSON.parse(text);
      if (!Array.isArray(data) || data.length !== 64 || !data.every(n => Number.isInteger(n) && n >= 0 && n <= 255)) throw new Error();
      bytes = Uint8Array.from(data);
    } else bytes = bs58.decode(text);
    if (bytes.length !== 64) throw new Error();
    const pair = Keypair.fromSecretKey(Uint8Array.from(bytes));
    if (!process.env.SOLANA_PUBLIC_ADDRESS || pair.publicKey.toBase58() !== process.env.SOLANA_PUBLIC_ADDRESS) throw new Error();
    return pair;
  } catch { throw new Error('Anahtar geçersiz veya SOLANA_PUBLIC_ADDRESS ile eşleşmiyor.'); }
  finally { text = ''; bytes?.fill(0); }
}
function requiredNumber(name: string, min: number, max: number): number {
  const raw = process.env[name], value = Number(raw);
  if (!raw || !Number.isFinite(value) || value < min || value > max) throw new Error('Geçersiz limit: ' + name);
  return value;
}
function initializeLiveRisk() {
  if (process.env.SOLARB_PANEL_SCANNER === 'true' || process.env.ENABLE_LIVE_TRADING !== 'I_UNDERSTAND_THE_RISKS') throw new Error('Canlı işlem yalnızca VPS operatörü tarafından açılabilir.');
  if (process.platform !== 'linux') throw new Error('Canlı mod için ayrı kullanıcılarla Linux kurulumu gerekli.');
  if (CONFIG.START_TOKEN !== 'SOL' || !CONFIG.USE_JITO) throw new Error('Canlı mod yalnızca SOL başlangıcı ve Jito ile desteklenir.');
  if ((CONFIG.JUPITER_API_URL || 'https://api.jup.ag/swap/v1') !== 'https://api.jup.ag/swap/v1' || CONFIG.JITO_BLOCK_ENGINE_URL !== 'https://mainnet.block-engine.jito.wtf/api/v1/bundles') throw new Error('Canlı işlem uç noktası değiştirilemez.');
  const rpc = new URL(CONFIG.RPC_URL);
  if (rpc.protocol !== 'https:') throw new Error('RPC HTTPS olmalı.');
  const maxTrade = requiredNumber('MAX_TRADE_SOL', 0.000001, 100);
  const dailyRisk = requiredNumber('MAX_DAILY_RISK_SOL', 0.000001, 1000);
  const maxTrades = requiredNumber('MAX_TRADES_PER_DAY', 1, 1000);
  const minBalance = requiredNumber('MIN_RESERVE_SOL', 0.001, 100);
  const maxFees = requiredNumber('MAX_FEES_SOL', 0.000015, 0.1);
  const maxSlippage = requiredNumber('MAX_SLIPPAGE_BPS', 0, 100);
  const tip = requiredNumber('JITO_TIP_SOL', 0.000001, 0.01);
  if (!Number.isInteger(maxTrades) || CONFIG.TRADE_AMOUNT > maxTrade || CONFIG.SLIPPAGE_BPS > maxSlippage) throw new Error('İşlem ayarı operatör limitini aşıyor.');
  if (2 * CONFIG.PRIORITY_FEE_SOL + 0.000015 + tip > maxFees) throw new Error('Ücret ayarı limiti aşıyor.');
  const directory = process.env.BOT_STATE_DIR;
  if (!directory || !path.isAbsolute(directory)) throw new Error('BOT_STATE_DIR gerekli.');
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink() || (stat.mode & 0o077) !== 0 || stat.uid !== process.getuid?.()) throw new Error('BOT_STATE_DIR bot kullanıcısına ait ve 0700 olmalı.');
  const lock = path.join(directory, 'runner.lock');
  const fd = fs.openSync(lock, 'wx', 0o600); fs.writeFileSync(fd, String(process.pid)); fs.closeSync(fd);
  process.once('exit', () => { try { fs.unlinkSync(lock); } catch {} });
  for (const signal of ['SIGINT','SIGTERM'] as const) process.once(signal, () => process.exit(0));
  const filename = path.join(directory, 'risk.json');
  const killSwitch = path.join(directory, 'STOP');
  const read = () => {
    if (!fs.existsSync(filename)) return { day: '', spent: 0, trades: 0, pending: false };
    const value = JSON.parse(readPrivateFile(filename));
    if (!value || typeof value.day !== 'string' || !Number.isFinite(value.spent) || value.spent < 0 || !Number.isInteger(value.trades) || value.trades < 0 || typeof value.pending !== 'boolean') throw new Error('Risk kaydı bozuk.');
    return value;
  };
  const write = (value: any) => {
    const temp = filename + '.tmp';
    const fd = fs.openSync(temp, 'wx', 0o600);
    try { fs.writeFileSync(fd, JSON.stringify(value)); fs.fsyncSync(fd); } finally { fs.closeSync(fd); }
    fs.renameSync(temp, filename);
  };
  if (read().pending || fs.existsSync(killSwitch)) throw new Error('Önceki işlem belirsiz veya STOP dosyası var; operatör kontrolü gerekli.');
  return {
    tip, maxFees,
    check: () => { if (fs.existsSync(killSwitch)) throw new Error('STOP dosyası ile durduruldu.'); },
    reserve: async (connection: Connection, wallet: Keypair) => {
      if (fs.existsSync(killSwitch)) throw new Error('STOP dosyası ile durduruldu.');
      let state = read(); if (state.pending) throw new Error('Belirsiz işlem var.');
      const today = new Date().toISOString().slice(0,10);
      if (state.day !== today) state = { day: today, spent: 0, trades: 0, pending: false };
      // Conservatively charge the entire principal + fee ceiling against the daily risk budget.
      // This is a spending envelope, not a claim to measure realized P&L.
      const exposure = CONFIG.TRADE_AMOUNT + maxFees;
      if (state.trades >= maxTrades || state.spent + exposure > dailyRisk) throw new Error('Günlük işlem/risk limiti doldu.');
      const balance = await connection.getBalance(wallet.publicKey, 'confirmed');
      if (balance / 1e9 < exposure + minBalance) throw new Error('İşlem sonrası rezerv yetersiz.');
      write({ day: today, spent: state.spent + exposure, trades: state.trades + 1, pending: true });
    },
    complete: () => { const state = read(); write({ ...state, pending: false }); },
  };
}

// No implicit .env loading. The panel scanner cannot import the live bot environment.
if (process.env.BOT_ENV_FILE && process.env.SOLARB_PANEL_SCANNER !== 'true') {
  const entries = dotenv.parse(readPrivateFile(process.env.BOT_ENV_FILE));
  for (const [key, value] of Object.entries(entries)) if (process.env[key] === undefined) process.env[key] = value;
}

// Yapılandırma Parametreleri
const CONFIG = {
  RPC_URL: "https://api.mainnet-beta.solana.com",

  START_TOKEN: "SOL",
  START_MINT: "So11111111111111111111111111111111111111112",
  START_DECIMALS: 9,

  INTER_TOKEN: "ALL",
  INTER_MINT: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  INTER_DECIMALS: 6,

  TRADE_AMOUNT: 5,
  TRADE_AMOUNT_RAW: 5000000000,

  SLIPPAGE_BPS: 20,
  MIN_PROFIT_PCT: 0.5,

  PRIORITY_FEE_SOL: 0.0001,
  SCAN_INTERVAL: 5000,

  USE_JITO: true,
  JITO_BLOCK_ENGINE_URL: process.env.JITO_BLOCK_ENGINE_URL || "https://mainnet.block-engine.jito.wtf/api/v1/bundles",

  JUPITER_API_URL: "",

  TELEGRAM_TOKEN: "",
  TELEGRAM_CHAT_ID: "",

  CUSTOM_MINTS: "",
  MAX_TOKENS: 500,
  SCAN_BATCH_SIZE: 25,
  MIN_LIQUIDITY_USD: 50000,
  MIN_VOLUME_24H_USD: 10000,
  DRY_RUN: true,
  AUTO_DISCOVER_MEME: true,
  SPY_WALLET_ADDRESS: "",
  AUTO_SPY_WALLET: false
};



// Eğer yerel veya üst klasörde config.json varsa dinamik olarak yükle (panel ile tam senkronizasyon için)
try {
  const possiblePaths = process.env.SOLARB_CONFIG_FILE ? [process.env.SOLARB_CONFIG_FILE] : [];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const fileData = JSON.parse(process.env.SOLARB_PANEL_SCANNER === 'true' ? fs.readFileSync(p, "utf8") : readPrivateFile(p));
      if (fileData) {
        for (const [key, field] of Object.entries({ maxTokens: 'MAX_TOKENS', scanBatchSize: 'SCAN_BATCH_SIZE', minLiquidityUsd: 'MIN_LIQUIDITY_USD', minVolume24hUsd: 'MIN_VOLUME_24H_USD' })) {
          if (fileData[key] !== undefined) (CONFIG as any)[field] = Number(fileData[key]);
        }
        if (fileData.dryRun !== undefined) CONFIG.DRY_RUN = fileData.dryRun !== false && fileData.dryRun !== 'false';
        if (fileData.startToken) CONFIG.START_TOKEN = fileData.startToken;
        if (fileData.interToken) CONFIG.INTER_TOKEN = fileData.interToken;
        if (fileData.amount !== undefined) {
          CONFIG.TRADE_AMOUNT = Number(fileData.amount);
          CONFIG.TRADE_AMOUNT_RAW = Math.round(Number(fileData.amount) * Math.pow(10, CONFIG.START_DECIMALS));
        }
        if (fileData.minProfitPct !== undefined) CONFIG.MIN_PROFIT_PCT = Number(fileData.minProfitPct);
        if (fileData.slippagePct !== undefined) CONFIG.SLIPPAGE_BPS = Math.round(Number(fileData.slippagePct) * 100);
        if (fileData.priorityFeeSol !== undefined) CONFIG.PRIORITY_FEE_SOL = Number(fileData.priorityFeeSol);
        if (fileData.scanInterval !== undefined) CONFIG.SCAN_INTERVAL = Number(fileData.scanInterval) * 1000;
        if (fileData.useJito !== undefined) CONFIG.USE_JITO = fileData.useJito === true || fileData.useJito === "true";
        if (fileData.jupiterApiUrl !== undefined) CONFIG.JUPITER_API_URL = fileData.jupiterApiUrl;
        if (fileData.customMints !== undefined) CONFIG.CUSTOM_MINTS = fileData.customMints;
        if (fileData.autoDiscoverMeme !== undefined) CONFIG.AUTO_DISCOVER_MEME = fileData.autoDiscoverMeme === true || fileData.autoDiscoverMeme === "true";
        if (fileData.spyWalletAddress !== undefined) CONFIG.SPY_WALLET_ADDRESS = fileData.spyWalletAddress;
        if (fileData.autoSpyWallet !== undefined) CONFIG.AUTO_SPY_WALLET = fileData.autoSpyWallet === true || fileData.autoSpyWallet === "true";

        console.log("📂 Konfigürasyon başarıyla config.json dosyasından yüklendi: " + p);
        break;
      }
    }
  }
} catch { throw new Error('Yapılandırma dosyası okunamadı.'); }

// Ortam değişkenleri ezme kontrolü (.env)
if (process.env.SOLANA_RPC_URL) CONFIG.RPC_URL = process.env.SOLANA_RPC_URL;
if (process.env.SOLANA_PRIVATE_KEY) throw new Error('Özel anahtarı ortam değeri olarak kullanmayın; SOLANA_KEYPAIR_FILE gerekli.');
if (process.env.TELEGRAM_TOKEN) CONFIG.TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
if (process.env.TELEGRAM_CHAT_ID) CONFIG.TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;
if (process.env.JUPITER_API_URL) CONFIG.JUPITER_API_URL = process.env.JUPITER_API_URL;
if (process.env.SOLANA_CUSTOM_MINTS) CONFIG.CUSTOM_MINTS = process.env.SOLANA_CUSTOM_MINTS;
if (process.env.SOLANA_AUTO_DISCOVER_MEME) CONFIG.AUTO_DISCOVER_MEME = process.env.SOLANA_AUTO_DISCOVER_MEME === "true";
if (process.env.SOLANA_SPY_WALLET_ADDRESS) CONFIG.SPY_WALLET_ADDRESS = process.env.SOLANA_SPY_WALLET_ADDRESS;
if (process.env.SOLANA_AUTO_SPY_WALLET) CONFIG.AUTO_SPY_WALLET = process.env.SOLANA_AUTO_SPY_WALLET === "true";

const knownTokens: Record<string, { mint: string; decimals: number }> = {"SOL":{"mint":"So11111111111111111111111111111111111111112","decimals":9},"USDC":{"mint":"EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v","decimals":6},"USDT":{"mint":"Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB","decimals":6},"BONK":{"mint":"DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263","decimals":5},"JUP":{"mint":"JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN","decimals":6},"WIF":{"mint":"EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm","decimals":6}};
if (!knownTokens[CONFIG.START_TOKEN] || (CONFIG.INTER_TOKEN !== 'ALL' && !knownTokens[CONFIG.INTER_TOKEN])) throw new Error('Bilinmeyen başlangıç/ara token');
CONFIG.START_MINT = knownTokens[CONFIG.START_TOKEN].mint;
CONFIG.START_DECIMALS = knownTokens[CONFIG.START_TOKEN].decimals;
if (CONFIG.INTER_TOKEN !== 'ALL') CONFIG.INTER_MINT = knownTokens[CONFIG.INTER_TOKEN].mint;
CONFIG.TRADE_AMOUNT_RAW = Math.round(CONFIG.TRADE_AMOUNT * 10 ** CONFIG.START_DECIMALS);
if (!Number.isSafeInteger(CONFIG.TRADE_AMOUNT_RAW) || CONFIG.TRADE_AMOUNT_RAW <= 0) throw new Error('İşlem miktarı pozitif ve güvenli tamsayı olmalıdır');
if (!Number.isFinite(CONFIG.MIN_PROFIT_PCT) || CONFIG.MIN_PROFIT_PCT < 0 || !Number.isFinite(CONFIG.SLIPPAGE_BPS) || CONFIG.SLIPPAGE_BPS < 0 || CONFIG.SLIPPAGE_BPS > 10000) throw new Error('Geçersiz kâr/slipaj ayarı');
if (!Number.isFinite(CONFIG.PRIORITY_FEE_SOL) || CONFIG.PRIORITY_FEE_SOL < 0) throw new Error('Geçersiz ücret');
if (!Number.isFinite(CONFIG.SCAN_INTERVAL) || CONFIG.SCAN_INTERVAL < 100) throw new Error('Geçersiz tarama aralığı');

type ScanTarget = { symbol: string; mint: string };
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function setting(value: unknown, fallback: number, min: number, max: number) {
  const n = Number(value);
  return value === undefined || value === null || value === '' || !Number.isFinite(n)
    ? fallback : Math.min(max, Math.max(min, n));
}
const SCANNER = {
  maxTokens: Math.floor(setting(process.env.SOLANA_MAX_TOKENS ?? CONFIG.MAX_TOKENS, 500, 1, 5000)),
  batchSize: Math.floor(setting(process.env.SOLANA_SCAN_BATCH_SIZE ?? CONFIG.SCAN_BATCH_SIZE, 25, 1, 500)),
  minLiquidity: setting(process.env.SOLANA_MIN_LIQUIDITY_USD ?? CONFIG.MIN_LIQUIDITY_USD, 50000, 0, 1e12),
  minVolume: setting(process.env.SOLANA_MIN_VOLUME_24H_USD ?? CONFIG.MIN_VOLUME_24H_USD, 10000, 0, 1e12),
  refreshMs: setting(process.env.SOLANA_DISCOVERY_REFRESH_MS, 300000, 60000, 86400000),
  requestMs: setting(process.env.JUPITER_REQUEST_INTERVAL_MS, 1100, 50, 60000),
  timeoutMs: setting(process.env.HTTP_TIMEOUT_MS, 10000, 100, 60000),
  maxQuoteAgeMs: setting(process.env.MAX_QUOTE_AGE_MS, 10000, 100, 60000),
  maxImpactPct: setting(process.env.MAX_PRICE_IMPACT_PCT, 1, 0, 100),
  dryRun: process.env.SOLARB_PANEL_SCANNER === 'true' || process.env.SOLANA_DRY_RUN !== 'false',
};
const jupiterKey = process.env.JUPITER_API_KEY || '';
let nextJupiterRequest = 0;
let nextDexRequest = 0;
async function requestJson(url: string, init: RequestInit = {}, jupiter = false): Promise<any> {
  for (let attempt = 0; attempt < 3; attempt++) {
    // All scanner requests are sequential. Quotes and discovery share the same budget.
    const next = jupiter ? nextJupiterRequest : nextDexRequest;
    await sleep(Math.max(0, next - Date.now()));
    if (jupiter) nextJupiterRequest = Date.now() + SCANNER.requestMs;
    else nextDexRequest = Date.now() + 1100;
    const headers = new Headers(init.headers);
    // Never forward the official API key to a custom endpoint.
    if (jupiter && jupiterKey && new URL(url).origin === 'https://api.jup.ag') headers.set('x-api-key', jupiterKey);
    try {
      const response = await fetch(url, { ...init, headers, redirect: 'error', signal: AbortSignal.timeout(SCANNER.timeoutMs) });
      if (response.status === 429 || response.status >= 500) {
        const retry = response.headers.get('retry-after');
        const seconds = Number(retry);
        const retryMs = retry ? (Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retry) - Date.now()) : 0;
        const delay = Math.max(1000 * 2 ** attempt, Number.isFinite(retryMs) ? retryMs : 0);
        if (jupiter) nextJupiterRequest = Math.max(nextJupiterRequest, Date.now() + delay);
        else nextDexRequest = Math.max(nextDexRequest, Date.now() + delay);
        if (attempt < 2) continue;
      }
      if (!response.ok) throw new Error('HTTP ' + response.status + ' (' + new URL(url).pathname + ')');
      return await response.json();
    } catch (error: any) {
      if (attempt < 2 && (error.name === 'TimeoutError' || error instanceof TypeError)) continue;
      throw error;
    }
  }
}
function validMint(mint: unknown): mint is string {
  if (typeof mint !== 'string') return false;
  try { return new PublicKey(mint).toBase58() === mint; } catch { return false; }
}
function uniqueTargets(targets: ScanTarget[], exclude: string, limit: number): ScanTarget[] {
  const result = new Map<string, ScanTarget>();
  for (const target of targets) {
    if (target.mint !== exclude && validMint(target.mint) && !result.has(target.mint)) result.set(target.mint, target);
    if (result.size >= limit) break;
  }
  return [...result.values()];
}
function selectJupiterTokens(data: any): ScanTarget[] {
  if (!Array.isArray(data)) throw new Error('Invalid Jupiter token list');
  return data.filter(t => validMint(t.id) && Number.isFinite(Number(t.liquidity)) && t.liquidity >= SCANNER.minLiquidity
    && Number.isFinite(Number(t.stats24h?.buyVolume)) && Number.isFinite(Number(t.stats24h?.sellVolume))
    && Number(t.stats24h.buyVolume) + Number(t.stats24h.sellVolume) >= SCANNER.minVolume
    && t.isBanned !== true)
    .sort((a, b) => Number(b.liquidity) - Number(a.liquidity))
    .map(t => ({ mint: t.id, symbol: String(t.symbol || t.id.slice(0, 6)).slice(0, 24) }));
}
const discoveryCache = new Map<string, { at: number; tokens: ScanTarget[] }>();
let lastDiscoveryAttempt = -Infinity;
let cachedMemeTokens: ScanTarget[] = [];
async function fetchTrendingMemeTokens(): Promise<ScanTarget[]> {
  const now = Date.now();
  if (now - lastDiscoveryAttempt < SCANNER.refreshMs) return cachedMemeTokens;
  lastDiscoveryAttempt = now; // Cache failures too, including an empty initial result.
  const sources = [
    'https://api.jup.ag/tokens/v2/tag?query=verified',
    'https://api.jup.ag/tokens/v2/toptraded/24h?limit=100',
    'https://api.jup.ag/tokens/v2/toptrending/1h?limit=100',
  ];
  for (const url of sources) {
    try { discoveryCache.set(url, { at: now, tokens: selectJupiterTokens(await requestJson(url, {}, true)) }); }
    catch (error: any) { console.warn('[Keşif] ' + error.message + '; geçerli önbellek korunuyor.'); }
  }
  const dexSource = 'dexscreener';
  try {
    const profiles = await requestJson('https://api.dexscreener.com/token-profiles/latest/v1');
    if (!Array.isArray(profiles)) throw new Error('Invalid DexScreener profiles');
    const mints = [...new Set<string>(profiles.filter(t => t.chainId === 'solana' && validMint(t.tokenAddress)).map(t => t.tokenAddress))];
    const tokens: ScanTarget[] = [];
    for (let i = 0; i < mints.length; i += 30) {
      const batch = mints.slice(i, i + 30);
      const pairs = await requestJson('https://api.dexscreener.com/tokens/v1/solana/' + batch.join(','));
      if (!Array.isArray(pairs)) throw new Error('Invalid DexScreener pairs');
      for (const pair of pairs) {
        if (pair.chainId === 'solana' && batch.includes(pair.baseToken?.address)
          && Number(pair.liquidity?.usd) >= SCANNER.minLiquidity && Number(pair.volume?.h24) >= SCANNER.minVolume) {
          tokens.push({ mint: pair.baseToken.address, symbol: String(pair.baseToken.symbol || 'SPL').slice(0, 24) });
        }
      }
    }
    discoveryCache.set(dexSource, { at: now, tokens });
  } catch (error: any) { console.warn('[Keşif] DexScreener: ' + error.message); }
  // Failed sources keep their own previous tokens for at most one hour.
  cachedMemeTokens = uniqueTargets([...discoveryCache.values()].filter(c => now - c.at < 3600000).flatMap(c => c.tokens), CONFIG.START_MINT, SCANNER.maxTokens);
  console.log('[Keşif] ' + cachedMemeTokens.length + ' filtrelenmiş token / hedef ' + SCANNER.maxTokens);
  if (!jupiterKey && cachedMemeTokens.length === 0) console.warn('[Keşif] Token listesi boş. Jupiter erişimi için sunucuda JUPITER_API_KEY ayarlayın.');
  return cachedMemeTokens;
}
const scanTargets: ScanTarget[] = [];
let scanCursor = 0;
function updateScanTargets(discovered: ScanTarget[] = []) {
  const defaults = [
    { symbol: 'SOL', mint: 'So11111111111111111111111111111111111111112' },
    { symbol: 'USDC', mint: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v' },
    { symbol: 'USDT', mint: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB' },
  ];
  const manual = CONFIG.CUSTOM_MINTS.split(/[\s,;]+/).filter(Boolean).map(mint => ({ mint, symbol: 'SPL_' + mint.slice(0, 6) }));
  const base = CONFIG.INTER_TOKEN === 'ALL' ? defaults : [{ symbol: CONFIG.INTER_TOKEN, mint: CONFIG.INTER_MINT }];
  const nextMint = scanTargets[scanCursor % Math.max(1, scanTargets.length)]?.mint;
  const next = uniqueTargets([...base, ...manual, ...discovered], CONFIG.START_MINT, SCANNER.maxTokens);
  scanTargets.splice(0, scanTargets.length, ...next);
  const preservedIndex = scanTargets.findIndex(t => t.mint === nextMint);
  scanCursor = preservedIndex < 0 ? 0 : preservedIndex;
}
function nextScanBatch(): ScanTarget[] {
  const batch: ScanTarget[] = [];
  const count = Math.min(SCANNER.batchSize, scanTargets.length);
  for (let i = 0; i < count; i++) batch.push(scanTargets[(scanCursor + i) % scanTargets.length]);
  scanCursor = scanTargets.length ? (scanCursor + count) % scanTargets.length : 0;
  return batch;
}
function quoteIsValid(q: any, inputMint: string, outputMint: string, amount: number | string) {
  return q && q.inputMint === inputMint && q.outputMint === outputMint && q.inAmount === String(amount)
    && /^\d+$/.test(q.outAmount) && BigInt(q.outAmount) > 0n
    && /^\d+$/.test(q.otherAmountThreshold) && BigInt(q.otherAmountThreshold) > 0n
    && BigInt(q.otherAmountThreshold) <= BigInt(q.outAmount)
    && Array.isArray(q.routePlan) && q.routePlan.length > 0
    && Number.isFinite(Number(q.priceImpactPct)) && Math.abs(Number(q.priceImpactPct)) <= SCANNER.maxImpactPct;
}


let lastSpyFetchTime = 0;
let cachedSpyTokens: { symbol: string; mint: string }[] = [];

async function discoverSpyWalletTokens() {
  const now = Date.now();
  if (now - lastSpyFetchTime < 600000 && cachedSpyTokens.length > 0) {
    return cachedSpyTokens;
  }

  if (!CONFIG.SPY_WALLET_ADDRESS) {
    return [];
  }

  try {
    console.log("🕵️ [Cüzdan Casusu] " + CONFIG.SPY_WALLET_ADDRESS + " cüzdanı için yedekli tarama başlatılıyor...");
    const pubKey = new PublicKey(CONFIG.SPY_WALLET_ADDRESS);
    const uniqueMints = new Set<string>();

    const rpcUrls = [
      CONFIG.RPC_URL,
      "https://api.ankr.com/solana",
      "https://rpc.ankr.com/solana",
      "https://solana.public-rpc.com",
      "https://solana-mainnet.g.allthatnode.com",
      "https://api.mainnet-beta.solana.com"
    ].filter(url => url && url.startsWith("http"));

    const uniqueRpcUrls = Array.from(new Set(rpcUrls));

    const runWithRpcFallback = async (fn: (conn: Connection) => Promise<void>) => {
      let lastError: any = null;
      for (const url of uniqueRpcUrls) {
        try {
          const conn = new Connection(url, "confirmed");
          await fn(conn);
          return; // Başarılı ise döngüden çık
        } catch (err: any) {
          lastError = err;
        }
      }
      throw lastError || new Error("Tüm Solana RPC sunucuları başarısız oldu.");
    };

    // 1. Cüzdan Token Hesaplarını Çek (Hızlı ve Güvenilir)
    try {
      await runWithRpcFallback(async (conn) => {
        const TOKEN_PROGRAM_ID = new PublicKey("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA");
        const tokenAccounts = await conn.getParsedTokenAccountsByOwner(pubKey, {
          programId: TOKEN_PROGRAM_ID
        });
        if (tokenAccounts && tokenAccounts.value) {
          for (const acc of tokenAccounts.value) {
            const info = acc.account.data.parsed?.info;
            if (info && info.mint) {
              const mint = info.mint;
              if (
                mint !== "So11111111111111111111111111111111111111112" &&
                mint !== "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" &&
                mint !== "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
              ) {
                uniqueMints.add(mint);
              }
            }
          }
        }
      });
    } catch (err: any) {
      console.warn("⚠️ [Cüzdan Casusu] Token hesapları alınamadı.");
    }

    // 2. Son İşlemleri Çek (Geçmiş İşlemler)
    try {
      await runWithRpcFallback(async (conn) => {
        const signatures = await conn.getSignaturesForAddress(pubKey, { limit: 12 });
        if (signatures && signatures.length > 0) {
          const txSignatures = signatures.map((s) => s.signature);
          const parsedTxes = await conn.getParsedTransactions(txSignatures, {
            maxSupportedTransactionVersion: 0,
            commitment: "confirmed"
          });
          for (const tx of parsedTxes) {
            if (!tx || !tx.meta) continue;
            const preBalances = tx.meta.preTokenBalances || [];
            const postBalances = tx.meta.postTokenBalances || [];
            for (const balance of [...preBalances, ...postBalances]) {
              if (balance && balance.mint) {
                const mint = balance.mint;
                if (
                  mint !== "So11111111111111111111111111111111111111112" &&
                  mint !== "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" &&
                  mint !== "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"
                ) {
                  uniqueMints.add(mint);
                }
              }
            }
          }
        }
      });
    } catch (err: any) {
      console.warn("⚠️ [Cüzdan Casusu] Son işlemler alınamadı.");
    }

    const mintList = Array.from(uniqueMints).filter(validMint).slice(0, SCANNER.maxTokens);
    const discovered: { symbol: string; mint: string }[] = [];

    if (mintList.length > 0) {
      try {
        for (let offset = 0; offset < mintList.length; offset += 30) {
          const pairs = await requestJson("https://api.dexscreener.com/tokens/v1/solana/" + mintList.slice(offset, offset + 30).join(","));
          const dexData = { pairs };
          if (dexData && dexData.pairs) {
            const added = new Set<string>();
            for (const pair of dexData.pairs) {
              if (pair.chainId === "solana" && pair.baseToken) {
                const mint = pair.baseToken.address;
                if (!added.has(mint) && mintList.includes(mint)) {
                  added.add(mint);
                  const name = pair.baseToken.symbol || "MEME";
                  const symbol = name.length > 8 ? name.substring(0, 8) : name;
                  discovered.push({
                    symbol: "🕵️_" + symbol,
                    mint: mint
                  });
                }
              }
            }
          }
        }
      } catch (e) {
        // DexScreener zenginleştirme başarısız olsa da devam et
      }

      for (const mint of mintList) {
        if (!discovered.some((t) => t.mint === mint)) {
          discovered.push({
            symbol: "🕵️_" + mint.substring(0, 4),
            mint: mint
          });
        }
      }
    }

    if (discovered.length > 0) {
      cachedSpyTokens = discovered;
      lastSpyFetchTime = now;
      console.log("✅ [Cüzdan Casusu] Başarıyla " + cachedSpyTokens.length + " adet aktif balina cüzdanı tokeni keşfedildi ve dairesel taramaya beslendi.");
    }
  } catch (error: any) {
    console.warn("⚠️ [Cüzdan Casusu] Genel takip hatası (eski veriler kullanılacak).");
  }
  return cachedSpyTokens;
}

updateScanTargets();

// RPC URL Güvenlik Kontrolü ve Fallback
if (!CONFIG.RPC_URL || typeof CONFIG.RPC_URL !== "string" || !CONFIG.RPC_URL.startsWith("http")) {
  console.warn("⚠️ Geçersiz RPC URL tespit edildi. Varsayılan Solana Mainnet RPC adresine dönülüyor.");
  CONFIG.RPC_URL = "https://api.mainnet-beta.solana.com";
}

// Only the isolated Linux live service can load a private key.
if (process.env.SOLARB_PANEL_SCANNER === 'true' && !SCANNER.dryRun) throw new Error('Panel yalnızca tarama yapabilir.');
const liveRisk = SCANNER.dryRun ? null : initializeLiveRisk();
const wallet: Keypair = SCANNER.dryRun ? Keypair.generate() : walletFromFile();
if (!SCANNER.dryRun) console.log('İşlem cüzdanı: ' + wallet.publicKey.toBase58());

// Solana Bağlantısı
const connection = new Connection(CONFIG.RPC_URL, {
  commitment: 'confirmed', disableRetryOnRateLimit: true,
  fetch: (url, init) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) }),
});

/**
 * Telegram Botu üzerinden bildirim mesajı gönderir
 */
async function sendTelegramNotification(message: string) {
  if (!CONFIG.TELEGRAM_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) return;
  const url = "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/sendMessage";
  try {
    await fetch(url, {
      redirect: 'error', signal: AbortSignal.timeout(10000),
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CONFIG.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown"
      })
    });
  } catch (error) {
    console.error("Telegram bildirimi gönderilemedi.");
  }
}

// Entegre Jupiter API İletişim Durumu ve Rotalama Noktası
let ACTIVE_JUPITER_API = CONFIG.JUPITER_API_URL || "https://api.jup.ag/swap/v1";

/**
 * Jupiter API üzerinden teklif (quote) alır
 */
async function getJupiterQuote(inputMint: string, outputMint: string, amount: number | string, slippageBps: number) {
  const endpoint = ACTIVE_JUPITER_API.endsWith('/') ? ACTIVE_JUPITER_API.slice(0, -1) : ACTIVE_JUPITER_API;
  const query = new URLSearchParams({ inputMint, outputMint, amount: String(amount), slippageBps: String(slippageBps), onlyDirectRoutes: 'false', restrictIntermediateTokens: 'true' });
  const quote = await requestJson(endpoint + '/quote?' + query, {}, true);
  return quoteIsValid(quote, inputMint, outputMint, amount) ? quote : null;
}

/**
 * Teklifi (quote) Solana işlemine (Transaction) dönüştürür
 */
async function getSwapTransaction(quoteResponse: any, userPublicKey: string) {
  const endpoints = CONFIG.JUPITER_API_URL
    ? [CONFIG.JUPITER_API_URL]
    : [ACTIVE_JUPITER_API];

  for (const endpoint of endpoints) {
    const cleanEndpoint = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
    const url = cleanEndpoint + "/swap";
    try {
      const swapData = await requestJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey,
          wrapAndUnwrapSol: true,
          computeUnitPriceMicroLamports: Math.round((CONFIG.PRIORITY_FEE_SOL * 10**9 * 10**6) / 1400000),
          dynamicComputeUnitLimit: true
        })
      }, true);

      if (swapData.swapTransaction) {
        const { swapTransaction } = swapData;
        return swapTransaction;
      }
    } catch (error) {
      // Denemeye devam et
    }
  }
  return null;
}

/**
 * İşlemleri Jito MEV Blok Motoruna tek bir atomik bundle (paket) olarak gönderir
 */
async function jitoRequest(method: string, params: any[]) {
  const response = await fetch('https://mainnet.block-engine.jito.wtf/api/v1/bundles', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(10000),
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error('Jito isteği başarısız.');
  const result = await response.json();
  if (result.error || !result.result) throw new Error('Jito sonucu geçersiz.');
  return result.result;
}
async function validateTransaction(tx: VersionedTransaction, quote: any) {
  if (tx.message.header.numRequiredSignatures !== 1 || !tx.message.staticAccountKeys[0].equals(wallet.publicKey)) throw new Error('Beklenmeyen imzalayan/ücret ödeyen.');
  const tables = [];
  for (const lookup of tx.message.addressTableLookups) {
    const table = await connection.getAddressLookupTable(lookup.accountKey);
    if (!table.value) throw new Error('Adres tablosu bulunamadı.');
    tables.push(table.value);
  }
  const message = TransactionMessage.decompile(tx.message, { addressLookupTableAccounts: tables });
  const allowed = new Set(['JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4', 'ComputeBudget111111111111111111111111111111', '11111111111111111111111111111111', 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL']);
  const tokenProgram = new PublicKey('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA');
  const ataProgram = new PublicKey('ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL');
  const associated = (mint: string) => PublicKey.findProgramAddressSync([wallet.publicKey.toBuffer(), tokenProgram.toBuffer(), new PublicKey(mint).toBuffer()], ataProgram)[0];
  const wrappedSol = associated('So11111111111111111111111111111111111111112');
  let jupiterInstructions = 0;
  for (const instruction of message.instructions) {
    const program = instruction.programId.toBase58();
    if (program === 'JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4') jupiterInstructions++;
    if (program === SystemProgram.programId.toBase58()) {
      if (instruction.data.length !== 12 || instruction.data.readUInt32LE(0) !== 2 || !instruction.keys[0]?.pubkey.equals(wallet.publicKey) || !instruction.keys[1]?.pubkey.equals(wrappedSol) || instruction.data.readBigUInt64LE(4) > BigInt(CONFIG.TRADE_AMOUNT_RAW)) throw new Error('İzin verilmeyen SOL transferi.');
    }
    if (program === ataProgram.toBase58()) {
      const mint = instruction.keys[3]?.pubkey.toBase58();
      if (!mint || ![quote.inputMint,quote.outputMint].includes(mint) || !instruction.keys[0]?.pubkey.equals(wallet.publicKey) || !instruction.keys[2]?.pubkey.equals(wallet.publicKey) || !instruction.keys[1]?.pubkey.equals(associated(mint)) || !(instruction.data.length === 0 || (instruction.data.length === 1 && instruction.data[0] === 1))) throw new Error('Beklenmeyen token hesabı.');
    }
    if (program === 'ComputeBudget111111111111111111111111111111') {
      if (!((instruction.data[0] === 2 && instruction.data.length === 5 && instruction.data.readUInt32LE(1) <= 1400000) || (instruction.data[0] === 3 && instruction.data.length === 9))) throw new Error('Beklenmeyen hesaplama bütçesi.');
    }
    if (!allowed.has(instruction.programId.toBase58())) throw new Error('İzin verilmeyen işlem programı.');
    if (instruction.programId.toBase58() === 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA') {
      // No approvals, authority changes, token transfers or arbitrary mint/burn operations.
      if (![9,17,18].includes(instruction.data[0])) throw new Error('İzin verilmeyen token talimatı.');
      if (instruction.data[0] === 9 && (!instruction.keys[1]?.pubkey.equals(wallet.publicKey) || !instruction.keys[2]?.pubkey.equals(wallet.publicKey))) throw new Error('Hesap kapatma alıcısı farklı.');
      if (instruction.data[0] === 17 && !instruction.keys[0]?.pubkey.equals(wrappedSol)) throw new Error('Beklenmeyen SOL hesabı.');
      if (instruction.data[0] === 18 && (instruction.data.length !== 33 || !instruction.data.subarray(1).equals(wallet.publicKey.toBuffer()))) throw new Error('Beklenmeyen hesap sahibi.');
    }
  }
  if (jupiterInstructions !== 1) throw new Error('Tam olarak bir Jupiter takası gerekli.');
  const fee = await connection.getFeeForMessage(tx.message, 'confirmed');
  if (fee.value === null || fee.value / 1e9 > liveRisk!.maxFees / 2) throw new Error('İşlem ücreti sınırı aşıyor.');
}

/**
 * Ana Arbitraj Tarama Fonksiyonu
 */
async function checkArbitrage() {
  let discovered: { symbol: string; mint: string }[] = [];

  if (CONFIG.AUTO_DISCOVER_MEME) {
    const trending = await fetchTrendingMemeTokens();
    discovered = [...discovered, ...trending];
  }

  if (CONFIG.AUTO_SPY_WALLET && CONFIG.SPY_WALLET_ADDRESS) {
    const spyTokens = await discoverSpyWalletTokens();
    discovered = [...discovered, ...spyTokens];
  }

  updateScanTargets(discovered);

  console.log("\n🔍 [" + new Date().toLocaleTimeString() + "] Arbitraj taranıyor... Toplam Rota Sayısı: " + scanTargets.length);

  const batch = nextScanBatch();
  console.log("[Tarama] Bu tur: " + batch.length + " / " + scanTargets.length + " token");
  for (const target of batch) {
    try {
      const quoteStarted = Date.now();
      const route1 = await getJupiterQuote(
        CONFIG.START_MINT,
        target.mint,
        CONFIG.TRADE_AMOUNT_RAW,
        CONFIG.SLIPPAGE_BPS
      );

      if (!route1) {
        continue;
      }

      const route2 = await getJupiterQuote(
        target.mint,
        CONFIG.START_MINT,
        route1.otherAmountThreshold,
        CONFIG.SLIPPAGE_BPS
      );

      if (!route2) {
        continue;
      }

      if (Date.now() - quoteStarted > SCANNER.maxQuoteAgeMs) continue;
      // Independently quoted legs sharing a pool ignore the first leg's price impact.
      const firstPools = new Set(route1.routePlan.map((r: any) => r.swapInfo?.ammKey));
      if (route2.routePlan.some((r: any) => firstPools.has(r.swapInfo?.ammKey))) continue;
      const conservativeRaw = BigInt(route2.otherAmountThreshold);
      const finalAmountRaw = Number(conservativeRaw);
      const finalAmountHuman = finalAmountRaw / (10 ** CONFIG.START_DECIMALS);

      const profitRaw = conservativeRaw - BigInt(CONFIG.TRADE_AMOUNT_RAW);
      const grossProfitHuman = Number(profitRaw) / 10 ** CONFIG.START_DECIMALS;
      // Network fees are paid in SOL. Non-SOL starts need an explicit conversion estimate.
      const solPrice = CONFIG.START_TOKEN === 'SOL' ? 1 : Number(process.env.SOL_PRICE_IN_START_TOKEN);
      const feeKnown = Number.isFinite(solPrice) && solPrice > 0;
      const feeSol = 2 * CONFIG.PRIORITY_FEE_SOL + 0.00001 + (CONFIG.USE_JITO ? Number(process.env.JITO_TIP_SOL || 0.00001) : 0);
      if (!Number.isFinite(feeSol) || feeSol < 0) throw new Error('Geçersiz ücret tahmini');
      const profitHuman = feeKnown ? grossProfitHuman - feeSol * solPrice : grossProfitHuman;
      const profitPct = (profitHuman / CONFIG.TRADE_AMOUNT) * 100;

      const logSign = profitHuman > 0 ? "📈" : "📉";
      console.log("   " + logSign + " Rota: " + CONFIG.START_TOKEN + " ➔ " + target.symbol + " ➔ " + CONFIG.START_TOKEN + " | Sonuç: " + (profitHuman > 0 ? "+" : "") + profitHuman.toFixed(6) + " " + CONFIG.START_TOKEN + " (%" + profitPct.toFixed(3) + ")");

      if (!feeKnown) { console.log('[Tarama] Ücret dönüşümü eksik; SOL_PRICE_IN_START_TOKEN ayarlayın. Brüt fark: ' + grossProfitHuman); continue; }
      if (profitHuman > 0 && profitPct >= CONFIG.MIN_PROFIT_PCT) {
        if (SCANNER.dryRun) {
          console.log('[FIRSAT ADAYI / TARAMA] ' + target.symbol + ' | ücret ve slipaj sonrası tahmin: ' + profitHuman.toFixed(6) + ' ' + CONFIG.START_TOKEN + ' (%' + profitPct.toFixed(3) + ') | işlem gönderilmedi');
          continue;
        }
        liveRisk!.check();
        await liveRisk!.reserve(connection, wallet);
        const swap1 = await getSwapTransaction(route1, wallet.publicKey.toBase58());
        const swap2 = await getSwapTransaction(route2, wallet.publicKey.toBase58());
        if (!swap1 || !swap2) throw new Error('Takas oluşturulamadı.');
        const tx1 = VersionedTransaction.deserialize(Buffer.from(swap1, 'base64'));
        const tx2 = VersionedTransaction.deserialize(Buffer.from(swap2, 'base64'));
        const { blockhash } = await connection.getLatestBlockhash('confirmed');
        tx1.message.recentBlockhash = blockhash; tx2.message.recentBlockhash = blockhash;
        await validateTransaction(tx1, route1); await validateTransaction(tx2, route2);
        const tipAccounts = await jitoRequest('getTipAccounts', []);
        if (!Array.isArray(tipAccounts) || !tipAccounts.length || !tipAccounts.every(validMint)) throw new Error('Jito tip hesapları geçersiz.');
        // Put the tip into the second swap itself. Never send an independent tip transaction.
        const tables = [];
        for (const lookup of tx2.message.addressTableLookups) {
          const table = await connection.getAddressLookupTable(lookup.accountKey);
          if (!table.value) throw new Error('Adres tablosu bulunamadı.'); tables.push(table.value);
        }
        const message = TransactionMessage.decompile(tx2.message, {addressLookupTableAccounts:tables});
        message.instructions.push(SystemProgram.transfer({fromPubkey:wallet.publicKey,toPubkey:new PublicKey(tipAccounts[0]),lamports:Math.ceil(liveRisk!.tip * 1e9)}));
        const tippedTx2 = new VersionedTransaction(message.compileToV0Message(tables));
        if (tx1.serialize().length > 1232 || tippedTx2.serialize().length > 1232) throw new Error('İşlem boyutu sınırı aşıyor.');
        if (Date.now() - quoteStarted > SCANNER.maxQuoteAgeMs) throw new Error('İmzalamadan önce teklif eskidi.');
        liveRisk!.check();
        tx1.sign([wallet]); tippedTx2.sign([wallet]);
        const signatures = [bs58.encode(tx1.signatures[0]), bs58.encode(tippedTx2.signatures[0])];
        console.log('İşlem imzaları (sonuç kontrolü için): ' + signatures.join(', '));
        const bundleId = await jitoRequest('sendBundle', [[Buffer.from(tx1.serialize()).toString('base64'), Buffer.from(tippedTx2.serialize()).toString('base64')], {encoding:'base64'}]);
        if (typeof bundleId !== 'string') throw new Error('Bundle kimliği geçersiz.');
        console.log('Bundle gönderildi; zincir onayı bekleniyor.');
        let confirmed = false;
        for (let attempt=0; attempt<30; attempt++) {
          await sleep(2000);
          const result = await connection.getSignatureStatuses(signatures, {searchTransactionHistory:true});
          if (result.value.some(s => s?.err)) throw new Error('Zincirde başarısız işlem; operatör kontrolü gerekli.');
          if (result.value.every(s => s && ['confirmed','finalized'].includes(s.confirmationStatus || ''))) { confirmed=true; break; }
        }
        if (!confirmed) throw new Error('Onay belirsiz; otomatik yeniden gönderim yapılmaz.');
        liveRisk!.complete();
        console.log('İki işlem zincirde onaylandı. Gerçek kâr için bakiye değişimlerini kontrol edin.');
        await sendTelegramNotification('SOLArb: İki işlem onaylandı. Tahmini fark gerçekleşmiş kâr değildir.');
        break;
      }
    } catch (err: any) {
      if (!SCANNER.dryRun) throw new Error('Canlı işlem durduruldu; risk kaydını ve zincir sonucunu kontrol edin.');
      console.warn('[Tarama] Rota sorgusu başarısız.');
    }
  }
}

// Botu başlat
async function main() {
  console.log("==================================================");
  console.log("🚀 SOLArb ÇOKLU PARİTE BOTU BAŞLATILIYOR...");
  console.log("📌 Başlangıç Varlığı: " + CONFIG.TRADE_AMOUNT + " " + CONFIG.START_TOKEN);
  console.log("📌 Ara Birim Modu: " + (CONFIG.INTER_TOKEN === 'ALL' ? 'Tüm Tanımlı Pariteler' : CONFIG.INTER_TOKEN));
  console.log("📌 Hedef Minimum Kâr: %" + CONFIG.MIN_PROFIT_PCT);
  console.log("📌 Slipaj Toleransı: %" + (CONFIG.SLIPPAGE_BPS / 100));
  console.log("📌 Tarama Periyodu: " + (CONFIG.SCAN_INTERVAL / 1000) + " saniye");
  console.log("📌 Jito MEV Koruması: " + (CONFIG.USE_JITO ? "AKTİF" : "PASİF"));
  console.log("==================================================");

  console.log("Mod: " + (SCANNER.dryRun ? "TARAMA (işlem göndermez)" : "CANLI"));
  while (true) {
    try {
      await checkArbitrage();
    } catch (e) {
      if (!SCANNER.dryRun) throw e;
      console.error('Tarama döngüsü başarısız.');
    }
    if (process.env.SOLANA_SCAN_ONCE === 'true') break;
    await sleep(CONFIG.SCAN_INTERVAL);
  }
}

main().catch((err) => {
  console.error('Bot durdu. Yapılandırmayı, limitleri ve bekleyen işlemi kontrol edin.');
  process.exitCode = 1;
});
