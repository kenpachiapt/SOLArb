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
}

export const TOKEN_MINTS = {
  SOL: 'So11111111111111111111111111111111111111112',
  USDC: 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v',
  USDT: 'Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB',
  BONK: 'DezXAZ8z7PnrnRJjz3wX4mTy3eUVVB8G3R6U47Hrkigw',
  JUP: 'JUPyiwrYJF1m4F9C6SrxadSZm8V7uhcFM637vMhXCm7',
  WIF: 'EKpQGSJtjMFqKZ98GWST69vThTZEgTUMmKW66m8zg1yO'
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
    autoDiscoverMeme
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
 * anında kârı cüzdanınıza ekler.
 */

import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import fetch from "node-fetch";
import * as dotenv from "dotenv";
import bs58 from "bs58";
import dns from "dns";
import fs from "fs";
import path from "path";
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
  RPC_URL: "${rpcUrl || 'https://api.mainnet-beta.solana.com'}",
  
  START_TOKEN: "${startToken}",
  START_MINT: "${startMint}",
  START_DECIMALS: ${decimals},
  
  INTER_TOKEN: "${interToken}",
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

  JUPITER_API_URL: "${jupiterApiUrl || ''}",

  TELEGRAM_TOKEN: "${telegramToken || ''}",
  TELEGRAM_CHAT_ID: "${telegramChatId || ''}",
  
  CUSTOM_MINTS: "${customMints || ''}",
  AUTO_DISCOVER_MEME: ${autoDiscoverMeme === undefined ? true : autoDiscoverMeme}
};

let privateKeyString = "${privateKey || ''}";

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

// Tarama yapılacak pariteleri belirleyen liste
const scanTargets: { symbol: string; mint: string }[] = [];

// DexScreener trend meme coinleri için önbellek ve fonksiyon
let lastDexScreenerFetchTime = 0;
let cachedMemeTokens: { symbol: string; mint: string }[] = [];

async function fetchTrendingMemeTokens() {
  const now = Date.now();
  if (now - lastDexScreenerFetchTime < 300000 && cachedMemeTokens.length > 0) {
    return cachedMemeTokens;
  }
  try {
    console.log("🔍 [DexScreener] Solana trend meme coinleri otomatik keşfediliyor...");
    const response = await fetch("https://api.dexscreener.com/token-profiles/latest/v1");
    if (!response.ok) {
      throw new Error("HTTP hata kodu: " + response.status);
    }
    const data = await response.json();
    if (Array.isArray(data)) {
      const solanaTokens = data
        .filter((item: any) => item.chainId === "solana" && item.tokenAddress)
        .map((item: any) => {
          const mint = item.tokenAddress;
          const name = item.symbol || "MEME";
          const symbol = name.length > 8 ? name.substring(0, 8) : name;
          return {
            symbol: "🔥_" + symbol,
            mint: mint
          };
        });
      
      if (solanaTokens.length > 0) {
        cachedMemeTokens = solanaTokens.slice(0, 15);
        lastDexScreenerFetchTime = now;
        console.log("✅ [DexScreener] Başarıyla " + cachedMemeTokens.length + " adet trend meme token keşfedildi.");
      }
    }
  } catch (error: any) {
    console.warn("⚠️ [DexScreener] Trend meme coin keşfinde geçici hata (cache kullanılacak):", error.message);
  }
  return cachedMemeTokens;
}

function updateScanTargets(discoveredMemeTokens: { symbol: string; mint: string }[] = []) {
  scanTargets.length = 0; // Temizle
  
  const defaultTargets = [
    { symbol: "USDC", mint: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" },
    { symbol: "USDT", mint: "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB" },
    { symbol: "BONK", mint: "DezXAZ8z7PnrnRJjz3wX4mTy3eUVVB8G3R6U47Hrkigw" },
    { symbol: "JUP", mint: "JUPyiwrYJF1m4F9C6SrxadSZm8V7uhcFM637vMhXCm7" },
    { symbol: "WIF", mint: "EKpQGSJtjMFqKZ98GWST69vThTZEgTUMmKW66m8zg1yO" },
    { symbol: "SOL", mint: "So11111111111111111111111111111111111111112" }
  ];

  if (CONFIG.INTER_TOKEN === "ALL") {
    for (const target of defaultTargets) {
      if (target.mint !== CONFIG.START_MINT) {
        scanTargets.push(target);
      }
    }
  } else {
    scanTargets.push({
      symbol: CONFIG.INTER_TOKEN,
      mint: CONFIG.INTER_MINT
    });
  }

  // Özel eklenen mint adreslerini (pump.fun vb.) ayrıştır ve listeye ekle
  if (CONFIG.CUSTOM_MINTS) {
    const mints = CONFIG.CUSTOM_MINTS.split(",")
      .map((m: any) => m.trim())
      .filter((m: any) => m.length > 30);
      
    mints.forEach((mint, index) => {
      if (!scanTargets.some(t => t.mint === mint)) {
        const label = mint.toLowerCase().endsWith("pump") ? "PUMP" : "SPL";
        scanTargets.push({
          symbol: label + "_" + mint.substring(0, 4) + "..." + mint.substring(mint.length - 4),
          mint: mint
        });
      }
    });
  }

  // Otomatik keşfedilen trend meme coinleri ekle
  if (discoveredMemeTokens && discoveredMemeTokens.length > 0) {
    for (const token of discoveredMemeTokens) {
      if (token.mint !== CONFIG.START_MINT && !scanTargets.some(t => t.mint === token.mint)) {
        scanTargets.push(token);
      }
    }
  }
}

// Listeyi oluştur (başlangıçta boş trend ile)
updateScanTargets();

// RPC URL Güvenlik Kontrolü ve Fallback
if (!CONFIG.RPC_URL || typeof CONFIG.RPC_URL !== "string" || !CONFIG.RPC_URL.startsWith("http")) {
  console.warn("⚠️ Geçersiz RPC URL tespit edildi. Varsayılan Solana Mainnet RPC adresine dönülüyor.");
  CONFIG.RPC_URL = "https://api.mainnet-beta.solana.com";
}

// Cüzdan Kurulumu
let wallet: Keypair;
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
let ACTIVE_JUPITER_API = CONFIG.JUPITER_API_URL || "https://quote-api.jup.ag/v6";

/**
 * Jupiter API üzerinden teklif (quote) alır
 */
async function getJupiterQuote(inputMint: string, outputMint: string, amount: number | string, slippageBps: number) {
  const endpoints = CONFIG.JUPITER_API_URL 
    ? [CONFIG.JUPITER_API_URL] 
    : [ACTIVE_JUPITER_API, "https://quote-api.jup.ag/v6", "https://api.jup.ag/v6"];

  for (const endpoint of endpoints) {
    const cleanEndpoint = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
    const url = cleanEndpoint + "/quote?inputMint=" + inputMint + "&outputMint=" + outputMint + "&amount=" + amount + "&slippageBps=" + slippageBps + "&onlyDirectRoutes=false";
    try {
      const response = await fetch(url);
      if (response.ok) {
        if (!CONFIG.JUPITER_API_URL && endpoint !== ACTIVE_JUPITER_API) {
          ACTIVE_JUPITER_API = endpoint;
          console.log("🔄 JUPITER_API adresi otomatik olarak çalışan adrese çevrildi: " + ACTIVE_JUPITER_API);
        }
        return await response.json();
      }
    } catch (error) {
      // Denemeye devam et
    }
  }
  return null;
}

/**
 * Teklifi (quote) Solana işlemine (Transaction) dönüştürür
 */
async function getSwapTransaction(quoteResponse: any, userPublicKey: string) {
  const endpoints = CONFIG.JUPITER_API_URL 
    ? [CONFIG.JUPITER_API_URL] 
    : [ACTIVE_JUPITER_API, "https://quote-api.jup.ag/v6", "https://api.jup.ag/v6"];

  for (const endpoint of endpoints) {
    const cleanEndpoint = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
    const url = cleanEndpoint + "/swap";
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          quoteResponse,
          userPublicKey,
          wrapAndUnwrapSol: true,
          computeUnitPriceMicroLamports: Math.round((CONFIG.PRIORITY_FEE_SOL * 10**9 * 10**6) / 1400000), 
          dynamicComputeUnitLimit: true
        })
      });

      if (response.ok) {
        const { swapTransaction } = await response.json();
        return swapTransaction;
      }
    } catch (error) {
      // Denemeye devam et
    }
  }
  return null;
}

/**
 * İşlemi Jito MEV Blok Motoruna bundle olarak gönderir
 */
async function sendTransactionToJito(signedTx: VersionedTransaction) {
  const rawTx = signedTx.serialize();
  const base64Tx = Buffer.from(rawTx).toString("base64");
  
  const payload = {
    jsonrpc: "2.0",
    id: 1,
    method: "sendBundle",
    params: [[base64Tx]]
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
    console.error("⚠️ Jito'ya gönderim yapılırken hata oluştu:", error.message);
    return null;
  }
}

/**
 * Ana Arbitraj Tarama Fonksiyonu
 */
async function checkArbitrage() {
  if (CONFIG.AUTO_DISCOVER_MEME) {
    const discovered = await fetchTrendingMemeTokens();
    updateScanTargets(discovered);
  } else {
    updateScanTargets([]);
  }
  
  console.log("\n🔍 [" + new Date().toLocaleTimeString() + "] Arbitraj taranıyor... Toplam Rota Sayısı: " + scanTargets.length);
  
  for (const target of scanTargets) {
    try {
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
        route1.outAmount,
        CONFIG.SLIPPAGE_BPS
      );

      if (!route2) {
        continue;
      }

      const finalAmountRaw = Number(route2.outAmount);
      const finalAmountHuman = finalAmountRaw / (10 ** CONFIG.START_DECIMALS);
      
      const profitRaw = finalAmountRaw - CONFIG.TRADE_AMOUNT_RAW;
      const profitHuman = finalAmountHuman - CONFIG.TRADE_AMOUNT;
      const profitPct = (profitHuman / CONFIG.TRADE_AMOUNT) * 100;

      const logSign = profitHuman > 0 ? "📈" : "📉";
      console.log("   " + logSign + " Rota: " + CONFIG.START_TOKEN + " ➔ " + target.symbol + " ➔ " + CONFIG.START_TOKEN + " | Sonuç: " + (profitHuman > 0 ? "+" : "") + profitHuman.toFixed(6) + " " + CONFIG.START_TOKEN + " (%" + profitPct.toFixed(3) + ")");
      
      if (profitPct >= CONFIG.MIN_PROFIT_PCT) {
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
          console.log("   [JITO] Jito MEV Blok Motoru ile gönderiliyor...");
          const res1 = await sendTransactionToJito(tx1);
          const res2 = await sendTransactionToJito(tx2);
          console.log("   ✅ JITO Gönderimi yapıldı. Sonuç:", JSON.stringify({ res1, res2 }));
          await sendTelegramNotification("🔔 *SOLArb ARBİTRAJ BAŞARILI (JITO BUNDLE)!*\n\n💸 *Rota:* " + CONFIG.START_TOKEN + " ➔ " + target.symbol + " ➔ " + CONFIG.START_TOKEN + "\n💵 *Sermaye:* " + CONFIG.TRADE_AMOUNT + " " + CONFIG.START_TOKEN + "\n📈 *Elde Edilen Net Kâr:* +" + profitHuman.toFixed(6) + " " + CONFIG.START_TOKEN + " (%" + profitPct.toFixed(3) + ")\n🛡️ *Jito MEV Koruması:* Aktif (Bundle)");
        } else {
          const sig1 = await connection.sendTransaction(tx1, { skipPreflight: false });
          const sig2 = await connection.sendTransaction(tx2, { skipPreflight: false });
          console.log("   [4/4] Onay bekleniyor...");
          await connection.confirmTransaction(sig1, "confirmed");
          await connection.confirmTransaction(sig2, "confirmed");
          console.log("   ✅ İşlemler başarıyla onaylandı!");
          await sendTelegramNotification("🔔 *SOLArb ARBİTRAJ BAŞARILI!*\n\n💸 *Rota:* " + CONFIG.START_TOKEN + " ➔ " + target.symbol + " ➔ " + CONFIG.START_TOKEN + "\n💵 *Sermaye:* " + CONFIG.TRADE_AMOUNT + " " + CONFIG.START_TOKEN + "\n📈 *Elde Edilen Net Kâr:* +" + profitHuman.toFixed(6) + " " + CONFIG.START_TOKEN + " (%" + profitPct.toFixed(3) + ")\n🛡️ *Jito MEV Koruması:* Pasif\n🔗 *Tx1:* https://solscan.io/tx/" + sig1 + "\n🔗 *Tx2:* https://solscan.io/tx/" + sig2);
        }
        
        break; 
      }
    } catch (err) {
      // Devam et
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

  await checkArbitrage();

  setInterval(async () => {
    try {
      await checkArbitrage();
    } catch (e) {
      console.error("Döngü hatası:", e.message);
    }
  }, CONFIG.SCAN_INTERVAL);
}

main().catch((err) => {
  console.error("Uygulama başlatma hatası:", err);
});
`;
}
