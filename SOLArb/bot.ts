/**
 * ====================================================================
 * SOLArb - ÇOKLU PARİTE VE MEME COIN ARBİTRAJ BOTU (GÜNCEL SÜRÜM)
 * ====================================================================
 * Bu bot, Solana Mainnet üzerinde dairesel arbitraj fırsatlarını arar.
 * "Tüm Pariteler" modu seçildiğinde, cüzdanınızdaki başlangıç varlığını koruyarak
 * JUP, BONK, WIF, USDC, USDT ve eklediğiniz pump.fun tokenlerinde fırsat kovalayıp
 * gerçek teklifler üzerinden fırsat adaylarını tarar. Varsayılan mod işlem göndermez.
 */

import { Connection, Keypair, VersionedTransaction, PublicKey } from "@solana/web3.js";
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

// Ortam değişkenlerini yükle (.env)
dotenv.config();

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

let privateKeyString = "";

// Eğer yerel veya üst klasörde config.json varsa dinamik olarak yükle (panel ile tam senkronizasyon için)
try {
  const possiblePaths = [
    path.join(process.cwd(), "config.json"),
    path.join(process.cwd(), "SOLArb", "config.json"),
    path.join(__dirname, "config.json"),
    path.join(__dirname, "..", "config.json")
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      const fileData = JSON.parse(fs.readFileSync(p, "utf8"));
      if (fileData) {
        for (const [key, field] of Object.entries({ maxTokens: 'MAX_TOKENS', scanBatchSize: 'SCAN_BATCH_SIZE', minLiquidityUsd: 'MIN_LIQUIDITY_USD', minVolume24hUsd: 'MIN_VOLUME_24H_USD' })) {
          if (fileData[key] !== undefined) (CONFIG as any)[field] = Number(fileData[key]);
        }
        if (fileData.dryRun !== undefined) CONFIG.DRY_RUN = fileData.dryRun !== false && fileData.dryRun !== 'false';
        if (fileData.rpcUrl) CONFIG.RPC_URL = fileData.rpcUrl;
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
        if (fileData.telegramToken) CONFIG.TELEGRAM_TOKEN = fileData.telegramToken;
        if (fileData.telegramChatId) CONFIG.TELEGRAM_CHAT_ID = fileData.telegramChatId;
        if (fileData.privateKey) privateKeyString = fileData.privateKey;
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
} catch (e) {
  // Sessizce geç
}

// Ortam değişkenleri ezme kontrolü (.env)
if (process.env.SOLANA_RPC_URL) CONFIG.RPC_URL = process.env.SOLANA_RPC_URL;
if (process.env.SOLANA_PRIVATE_KEY) privateKeyString = process.env.SOLANA_PRIVATE_KEY;
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
  dryRun: process.env.SOLANA_DRY_RUN === undefined ? CONFIG.DRY_RUN !== false : process.env.SOLANA_DRY_RUN !== 'false',
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
      const response = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(SCANNER.timeoutMs) });
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
      console.warn("⚠️ [Cüzdan Casusu] Token hesapları alınamadı:", err.message || err);
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
      console.warn("⚠️ [Cüzdan Casusu] Son işlemler alınamadı:", err.message || err);
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
    console.warn("⚠️ [Cüzdan Casusu] Genel takip hatası (eski veriler kullanılacak):", error.message);
  }
  return cachedSpyTokens;
}

updateScanTargets();

// RPC URL Güvenlik Kontrolü ve Fallback
if (!CONFIG.RPC_URL || typeof CONFIG.RPC_URL !== "string" || !CONFIG.RPC_URL.startsWith("http")) {
  console.warn("⚠️ Geçersiz RPC URL tespit edildi. Varsayılan Solana Mainnet RPC adresine dönülüyor.");
  CONFIG.RPC_URL = "https://api.mainnet-beta.solana.com";
}

// Cüzdan Kurulumu
let wallet: Keypair;
if (SCANNER.dryRun) {
  wallet = Keypair.generate(); // No signing or broadcasting in scan mode.
} else {
if (!privateKeyString) {
  console.error("❌ HATA: SOLANA_PRIVATE_KEY ortam değişkeni tanımlanmamış!");
  process.exit(1);
}

try {
  wallet = Keypair.fromSecretKey(bs58.decode(privateKeyString));
  console.log("🔑 Cüzdan başarıyla yüklendi:", wallet.publicKey.toBase58());
} catch (e) {
  try {
    const arr = JSON.parse(privateKeyString);
    wallet = Keypair.fromSecretKey(Uint8Array.from(arr));
    console.log("🔑 Cüzdan başarıyla yüklendi (Dizi formatı):", wallet.publicKey.toBase58());
  } catch (err) {
    console.error("❌ HATA: Özel anahtar (Private Key) çözümlenemedi!");
    process.exit(1);
  }
}

}

// Solana Bağlantısı
const connection = new Connection(CONFIG.RPC_URL, "confirmed");

/**
 * Telegram Botu üzerinden bildirim mesajı gönderir
 */
async function sendTelegramNotification(message: string) {
  if (!CONFIG.TELEGRAM_TOKEN || !CONFIG.TELEGRAM_CHAT_ID) return;
  const url = "https://api.telegram.org/bot" + CONFIG.TELEGRAM_TOKEN + "/sendMessage";
  try {
    await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: CONFIG.TELEGRAM_CHAT_ID,
        text: message,
        parse_mode: "Markdown"
      })
    });
  } catch (error) {
    console.error("⚠️ Telegram bildirimi gönderilirken hata oluştu:", error.message);
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
async function sendBundleToJito(txs: VersionedTransaction[]) {
  const base64Txs = txs.map(tx => Buffer.from(tx.serialize()).toString("base64"));

  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "sendBundle",
    params: [base64Txs, { encoding: "base64" }]
  };

  try {
    const response = await fetch(CONFIG.JITO_BLOCK_ENGINE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    return result;
  } catch (error) {
    console.error("⚠️ Jito'ya bundle gönderilirken hata oluştu:", error.message);
    return null;
  }
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
        console.log("   🎉 🎉 ARBİTRAJ FIRSATI BULUNDU! [" + target.symbol + "] Kâr Hedefi (%" + CONFIG.MIN_PROFIT_PCT + ") aşıldı! %" + profitPct.toFixed(3) + " kâr oranı.");

        console.log("   [1/4] İlk takas işlemi oluşturuluyor...");
        const swapTx1Base64 = await getSwapTransaction(route1, wallet.publicKey.toBase58());

        console.log("   [2/4] İkinci takas işlemi oluşturuluyor...");
        const swapTx2Base64 = await getSwapTransaction(route2, wallet.publicKey.toBase58());

        if (!swapTx1Base64 || !swapTx2Base64) {
          console.log("   ❌ İşlemler oluşturulamadı. Es geçiliyor.");
          continue;
        }

        const tx1 = VersionedTransaction.deserialize(Buffer.from(swapTx1Base64, "base64"));
        const tx2 = VersionedTransaction.deserialize(Buffer.from(swapTx2Base64, "base64"));

        const { blockhash } = await connection.getLatestBlockhash("confirmed");
        tx1.message.recentBlockhash = blockhash;
        tx2.message.recentBlockhash = blockhash;

        tx1.sign([wallet]);
        tx2.sign([wallet]);

        console.log("   [3/4] İşlemler imzalandı. Yayınlanıyor...");

        if (CONFIG.USE_JITO) {
          console.log("   [JITO] Jito MEV Blok Motoru ile atomik bundle gönderiliyor...");
          const res = await sendBundleToJito([tx1, tx2]);
          if (!res?.result || res.error) throw new Error("Jito bundle kabul edilmedi");
          console.log("   Jito bundle kabul edildi, zincir onayı doğrulanmadı:", res.result);
          await sendTelegramNotification("🔔 *SOLArb BUNDLE GÖNDERİLDİ (ONAY BEKLİYOR)*\n\n💸 *Rota:* " + CONFIG.START_TOKEN + " ➔ " + target.symbol + " ➔ " + CONFIG.START_TOKEN + "\n💵 *Sermaye:* " + CONFIG.TRADE_AMOUNT + " " + CONFIG.START_TOKEN + "\n📈 *Tahmini Kâr:* +" + profitHuman.toFixed(6) + " " + CONFIG.START_TOKEN + " (%" + profitPct.toFixed(3) + ")\n🛡️ *Jito MEV Koruması:* Aktif (Bundle)");
        } else {
          const sig1 = await connection.sendTransaction(tx1, { skipPreflight: false });
          const confirmed1 = await connection.confirmTransaction(sig1, "confirmed");
          if (confirmed1.value.err) throw new Error("İlk takas başarısız");
          const sig2 = await connection.sendTransaction(tx2, { skipPreflight: false });
          console.log("   [4/4] Onay bekleniyor...");
          const confirmed2 = await connection.confirmTransaction(sig2, "confirmed");
          if (confirmed2.value.err) throw new Error("İkinci takas başarısız; ara token bakiyesini kontrol edin");
          console.log("   ✅ İşlemler başarıyla onaylandı!");
          await sendTelegramNotification("🔔 *SOLArb ARBİTRAJ BAŞARILI!*\n\n💸 *Rota:* " + CONFIG.START_TOKEN + " ➔ " + target.symbol + " ➔ " + CONFIG.START_TOKEN + "\n💵 *Sermaye:* " + CONFIG.TRADE_AMOUNT + " " + CONFIG.START_TOKEN + "\n📈 *Tahmini Kâr:* +" + profitHuman.toFixed(6) + " " + CONFIG.START_TOKEN + " (%" + profitPct.toFixed(3) + ")\n🛡️ *Jito MEV Koruması:* Pasif\n🔗 *Tx1:* https://solscan.io/tx/" + sig1 + "\n🔗 *Tx2:* https://solscan.io/tx/" + sig2);
        }

        break;
      }
    } catch (err: any) {
      console.warn("[Tarama] " + target.symbol + ": " + err.message);
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
      console.error("Döngü hatası:", e.message);
    }
    if (process.env.SOLANA_SCAN_ONCE === 'true') break;
    await sleep(CONFIG.SCAN_INTERVAL);
  }
}

main().catch((err) => {
  console.error("Uygulama başlatma hatası:", err);
});
