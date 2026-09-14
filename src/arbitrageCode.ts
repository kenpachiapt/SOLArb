import { botSecurityRuntime } from './botSecurityRuntime.ts';
import { scannerRuntime } from './scannerRuntime.ts';
export interface BotOptions {
  rpcUrl: string;
  startToken: string;
  interToken: string;
  amount: number;
  minProfitPct: number;
  slippagePct: number;
  useJito: boolean;
  priorityFeeSol: number;
  scanIntervalMs: number;
  telegramToken?: string;
  telegramChatId?: string;
  privateKey?: string;
  jupiterApiUrl?: string;
  customMints?: string;
  autoDiscoverMeme?: boolean;
  maxTokens?: number;
  scanBatchSize?: number;
  minLiquidityUsd?: number;
  minVolume24hUsd?: number;
  dryRun?: boolean;
  spyWalletAddress?: string;
  autoSpyWallet?: boolean;
}

export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wXBoRgixCa6xjnB7YaB1pPB263',
  JUP: 'JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN',
  WIF: 'EKpQGSJtjMFqKZ9KQanSqYXRcF8fBopzLHYxdM65zcjm'
};

export const TOKEN_DECIMALS = {
  SOL: 9,
  USDC: 6,
  USDT: 6,
  BONK: 5,
  JUP: 6,
  WIF: 6
};

export function generateArbitrageCode(options: BotOptions): string {
  const {
    rpcUrl,
    startToken,
    interToken,
    amount,
    minProfitPct,
    slippagePct,
    useJito,
    priorityFeeSol,
    scanIntervalMs,
    telegramToken,
    telegramChatId,
    privateKey,
    jupiterApiUrl,
    customMints,
    autoDiscoverMeme,
    spyWalletAddress,
    autoSpyWallet
  } = options;

  const startMint = TOKEN_MINTS[startToken] || TOKEN_MINTS.SOL;
  const interMint = TOKEN_MINTS[interToken] || TOKEN_MINTS.USDC;
  const decimals = TOKEN_DECIMALS[startToken] || 9;
  const interDecimals = TOKEN_DECIMALS[interToken] || 6;
  const lamportsAmount = Math.round(amount * Math.pow(10, decimals));
  const minProfitBps = Math.round(minProfitPct * 100);
  const slippageBps = Math.round(slippagePct * 100);

  return `/**
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

${botSecurityRuntime}
// No implicit .env loading. The panel scanner cannot import the live bot environment.
if (process.env.BOT_ENV_FILE && process.env.SOLARB_PANEL_SCANNER !== 'true') {
  const entries = dotenv.parse(readPrivateFile(process.env.BOT_ENV_FILE));
  for (const [key, value] of Object.entries(entries)) if (process.env[key] === undefined) process.env[key] = value;
}

// Yapılandırma Parametreleri
const CONFIG = {
  RPC_URL: ${JSON.stringify(rpcUrl || 'https://api.mainnet-beta.solana.com')},

  START_TOKEN: ${JSON.stringify(startToken)},
  START_MINT: "${startMint}",
  START_DECIMALS: ${decimals},

  INTER_TOKEN: ${JSON.stringify(interToken)},
  INTER_MINT: "${interMint}",
  INTER_DECIMALS: ${interDecimals},

  TRADE_AMOUNT: ${amount},
  TRADE_AMOUNT_RAW: ${lamportsAmount},

  SLIPPAGE_BPS: ${slippageBps},
  MIN_PROFIT_PCT: ${minProfitPct},

  PRIORITY_FEE_SOL: ${priorityFeeSol},
  SCAN_INTERVAL: ${scanIntervalMs},

  USE_JITO: ${useJito},
  JITO_BLOCK_ENGINE_URL: process.env.JITO_BLOCK_ENGINE_URL || "https://mainnet.block-engine.jito.wtf/api/v1/bundles",

  JUPITER_API_URL: ${JSON.stringify(jupiterApiUrl || '')},

  TELEGRAM_TOKEN: "",
  TELEGRAM_CHAT_ID: "",

  CUSTOM_MINTS: ${JSON.stringify(customMints || '')},
  MAX_TOKENS: ${options.maxTokens ?? 500},
  SCAN_BATCH_SIZE: ${options.scanBatchSize ?? 25},
  MIN_LIQUIDITY_USD: ${options.minLiquidityUsd ?? 50000},
  MIN_VOLUME_24H_USD: ${options.minVolume24hUsd ?? 10000},
  DRY_RUN: true,
  AUTO_DISCOVER_MEME: ${autoDiscoverMeme === undefined ? true : autoDiscoverMeme},
  SPY_WALLET_ADDRESS: ${JSON.stringify(spyWalletAddress || '')},
  AUTO_SPY_WALLET: ${autoSpyWallet === undefined ? false : autoSpyWallet}
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

const knownTokens: Record<string, { mint: string; decimals: number }> = ${JSON.stringify(Object.fromEntries(Object.entries(TOKEN_MINTS).map(([symbol, mint]) => [symbol, { mint, decimals: TOKEN_DECIMALS[symbol] }])))};
if (!knownTokens[CONFIG.START_TOKEN] || (CONFIG.INTER_TOKEN !== 'ALL' && !knownTokens[CONFIG.INTER_TOKEN])) throw new Error('Bilinmeyen başlangıç/ara token');
CONFIG.START_MINT = knownTokens[CONFIG.START_TOKEN].mint;
CONFIG.START_DECIMALS = knownTokens[CONFIG.START_TOKEN].decimals;
if (CONFIG.INTER_TOKEN !== 'ALL') CONFIG.INTER_MINT = knownTokens[CONFIG.INTER_TOKEN].mint;
CONFIG.TRADE_AMOUNT_RAW = Math.round(CONFIG.TRADE_AMOUNT * 10 ** CONFIG.START_DECIMALS);
if (!Number.isSafeInteger(CONFIG.TRADE_AMOUNT_RAW) || CONFIG.TRADE_AMOUNT_RAW <= 0) throw new Error('İşlem miktarı pozitif ve güvenli tamsayı olmalıdır');
if (!Number.isFinite(CONFIG.MIN_PROFIT_PCT) || CONFIG.MIN_PROFIT_PCT < 0 || !Number.isFinite(CONFIG.SLIPPAGE_BPS) || CONFIG.SLIPPAGE_BPS < 0 || CONFIG.SLIPPAGE_BPS > 10000) throw new Error('Geçersiz kâr/slipaj ayarı');
if (!Number.isFinite(CONFIG.PRIORITY_FEE_SOL) || CONFIG.PRIORITY_FEE_SOL < 0) throw new Error('Geçersiz ücret');
if (!Number.isFinite(CONFIG.SCAN_INTERVAL) || CONFIG.SCAN_INTERVAL < 100) throw new Error('Geçersiz tarama aralığı');
${scannerRuntime}

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

  console.log("\\n🔍 [" + new Date().toLocaleTimeString() + "] Arbitraj taranıyor... Toplam Rota Sayısı: " + scanTargets.length);

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
`;
}
