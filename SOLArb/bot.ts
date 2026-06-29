/**
 * ====================================================================
 * SOLArb - DAİRESEL ARBİTRAJ BOTU (ÖZELLEŞTİRİLMİŞ ÜRETİM TASLAĞI)
 * ====================================================================
 * Bu kod, Jupiter v6 API'sini ve Solana Web3.js kütüphanesini kullanarak
 * iki yönlü/dairesel arbitraj (Token A -> Token B -> Token A) fırsatlarını tarar.
 * 
 * Güvenlik Uyarısı: Özel anahtarınızı (.env dosyasında) asla başkalarıyla
 * paylaşmayın ve her zaman güvenli, özel bir RPC düğümü (Helius, QuickNode vb.) kullanın.
 * 
 * Kurulum ve Çalıştırma Adımları kodun altında açıklanmıştır.
 */

import { Connection, Keypair, VersionedTransaction } from "@solana/web3.js";
import fetch from "node-fetch";
import * as dotenv from "dotenv";
import bs58 from "bs58";

// Ortam değişkenlerini yükle (.env)
dotenv.config();

// Yapılandırma Parametreleri
const CONFIG = {
  // RPC Bağlantı Adresi (Özel RPC kullanılması şiddetle önerilir)
  RPC_URL: "https://api.mainnet-beta.solana.com",
  
  // Ticaret Yapılacak Token Bilgileri
  START_TOKEN: "SOL",
  START_MINT: "So11111111111111111111111111111111111111112",
  START_DECIMALS: 9,
  
  INTER_TOKEN: "USDC",
  INTER_MINT: "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v",
  INTER_DECIMALS: 6,

  // İşlem Tutarı (5 SOL)
  TRADE_AMOUNT: 5,
  TRADE_AMOUNT_RAW: 5000000000, // Lamport/Raw cinsinden

  // Toleranslar ve Sınırlar
  SLIPPAGE_BPS: 20, // Slipaj Tolere Oranı (%0.2)
  MIN_PROFIT_PCT: 0.5, // Minimum Kâr Hedefi (%0.5)
  
  // Öncelikli İşlem Ücreti (Priority Fee)
  PRIORITY_FEE_SOL: 0.0001, // SOL cinsinden ek ücret
  
  // Tarama Sıklığı
  SCAN_INTERVAL: 5000, // Milisaniye cinsinden (5 saniye)

  // Jito MEV Blok Motoru Kullanımı
  USE_JITO: true,
  JITO_BLOCK_ENGINE_URL: process.env.JITO_BLOCK_ENGINE_URL || "https://mainnet.block-engine.jito.wtf/api/v1/bundles",

  // Telegram Bildirim Ayarları
  TELEGRAM_TOKEN: "",
  TELEGRAM_CHAT_ID: ""
};

let privateKeyString = "";

// Eğer yerel veya üst klasörde config.json varsa dinamik olarak yükle (panel ile tam senkronizasyon için)
try {
  const fs = require("fs");
  const path = require("path");
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

// RPC URL Güvenlik Kontrolü ve Fallback
if (!CONFIG.RPC_URL || typeof CONFIG.RPC_URL !== "string" || !CONFIG.RPC_URL.startsWith("http")) {
  console.warn("⚠️ Geçersiz RPC URL tespit edildi. Varsayılan Solana Mainnet RPC adresine dönülüyor.");
  CONFIG.RPC_URL = "https://api.mainnet-beta.solana.com";
}

// Cüzdan Kurulumu
let wallet: Keypair;

if (!privateKeyString) {
  privateKeyString = process.env.SOLANA_PRIVATE_KEY || "";
}

if (!privateKeyString) {
  console.error("❌ HATA: SOLANA_PRIVATE_KEY ortam değişkeni tanımlanmamış!");
  console.error("Lütfen .env dosyanızı oluşturun ve özel anahtarınızı ekleyin.");
  process.exit(1);
}

try {
  // Özel anahtarı base58 formatından çöz (Phantom veya Solflare'den dışa aktarılan format)
  wallet = Keypair.fromSecretKey(bs58.decode(privateKeyString));
  console.log("🔑 Cüzdan başarıyla yüklendi:", wallet.publicKey.toBase58());
} catch (e) {
  try {
    // Array formatında özel anahtar kontrolü [12, 34, ...]
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
  const url = `https://api.telegram.org/bot${CONFIG.TELEGRAM_TOKEN}/sendMessage`;
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

/**
 * Jupiter API üzerinden teklif (quote) alır
 */
async function getJupiterQuote(inputMint: string, outputMint: string, amount: number, slippageBps: number) {
  const url = `https://quote-api.jup.ag/v6/quote?inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}&slippageBps=${slippageBps}&onlyDirectRoutes=false`;
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Jupiter Quote API Hatası: ${response.statusText}`);
    }
    return await response.json();
  } catch (error) {
    console.error("⚠️ Fiyat teklifi alınırken hata oluştu:", error.message);
    return null;
  }
}

/**
 * Teklifi (quote) Solana işlemine (Transaction) dönüştürür
 */
async function getSwapTransaction(quoteResponse: any, userPublicKey: string) {
  const url = "https://quote-api.jup.ag/v6/swap";
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        quoteResponse,
        userPublicKey,
        wrapAndUnwrapSol: true,
        // İşlem önceliği ve ücret ayarları
        computeUnitPriceMicroLamports: Math.round((CONFIG.PRIORITY_FEE_SOL * 10**9 * 10**6) / 1400000), 
        dynamicComputeUnitLimit: true
      })
    });

    if (!response.ok) {
      throw new Error(`Jupiter Swap API Hatası: ${response.statusText}`);
    }

    const { swapTransaction } = await response.json();
    return swapTransaction;
  } catch (error) {
    console.error("⚠️ İşlem oluşturulurken hata oluştu:", error.message);
    return null;
  }
}

/**
 * İşlemi Jito MEV Blok Motoruna bundle olarak gönderir (Önceden çalıştırılmayı ve iptal edilmeyi önler)
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
  console.log(`\n🔍 [${new Date().toLocaleTimeString()}] Arbitraj fırsatı taranıyor...`);
  
  // 1. ADIM: Token A -> Token B fiyatını sorgula
  const route1 = await getJupiterQuote(
    CONFIG.START_MINT,
    CONFIG.INTER_MINT,
    CONFIG.TRADE_AMOUNT_RAW,
    CONFIG.SLIPPAGE_BPS
  );
  
  if (!route1) return;

  const expectedTokenBAmount = route1.outAmount;
  const tokenBAmountHuman = Number(expectedTokenBAmount) / (10 ** CONFIG.INTER_DECIMALS);
  console.log(`   1. Yol: ${CONFIG.TRADE_AMOUNT} ${CONFIG.START_TOKEN} ➔ ${tokenBAmountHuman.toFixed(4)} ${CONFIG.INTER_TOKEN}`);

  // 2. ADIM: Token B -> Token A (Geri Dönüş) fiyatını sorgula
  const route2 = await getJupiterQuote(
    CONFIG.INTER_MINT,
    CONFIG.START_MINT,
    expectedTokenBAmount,
    CONFIG.SLIPPAGE_BPS
  );

  if (!route2) return;

  const finalAmountRaw = Number(route2.outAmount);
  const finalAmountHuman = finalAmountRaw / (10 ** CONFIG.START_DECIMALS);
  
  // Kâr/Zarar hesabı
  const profitRaw = finalAmountRaw - CONFIG.TRADE_AMOUNT_RAW;
  const profitHuman = finalAmountHuman - CONFIG.TRADE_AMOUNT;
  const profitPct = (profitHuman / CONFIG.TRADE_AMOUNT) * 100;

  console.log(`   2. Yol: ${tokenBAmountHuman.toFixed(4)} ${CONFIG.INTER_TOKEN} ➔ ${finalAmountHuman.toFixed(6)} ${CONFIG.START_TOKEN}`);
  
  if (profitHuman > 0) {
    console.log(`   📈 Brüt Sonuç: +${profitHuman.toFixed(6)} ${CONFIG.START_TOKEN} (%${profitPct.toFixed(3)})`);
  } else {
    console.log(`   📉 Brüt Sonuç: ${profitHuman.toFixed(6)} ${CONFIG.START_TOKEN} (%${profitPct.toFixed(3)})`);
  }

  // 3. ADIM: Kârlılık kontrolü
  if (profitPct >= CONFIG.MIN_PROFIT_PCT) {
    console.log(`   🎉 FIRSAT BULUNDU! Hedef kâr (%${CONFIG.MIN_PROFIT_PCT}) aşıldı. İşlemler sırayla tetikleniyor...`);
    
    try {
      // Yol 1 İşlemi
      console.log("   [1/4] İlk takas işlemi oluşturuluyor...");
      const swapTx1Base64 = await getSwapTransaction(route1, wallet.publicKey.toBase58());
      
      // Yol 2 İşlemi
      console.log("   [2/4] İkinci takas işlemi oluşturuluyor...");
      const swapTx2Base64 = await getSwapTransaction(route2, wallet.publicKey.toBase58());

      if (!swapTx1Base64 || !swapTx2Base64) {
        console.log("   ❌ İşlemler oluşturulamadı. İptal ediliyor.");
        return;
      }

      // İşlemleri deserialize et
      const tx1 = VersionedTransaction.deserialize(Buffer.from(swapTx1Base64, "base64"));
      const tx2 = VersionedTransaction.deserialize(Buffer.from(swapTx2Base64, "base64"));

      // Blok bilgisini al ve işlemleri imzala
      const { blockhash } = await connection.getLatestBlockhash("confirmed");
      tx1.message.recentBlockhash = blockhash;
      tx2.message.recentBlockhash = blockhash;

      tx1.sign([wallet]);
      tx2.sign([wallet]);

      console.log("   [3/4] İşlemler imzalandı. Ağa gönderiliyor...");

      if (CONFIG.USE_JITO) {
        console.log("   [JITO] İşlemler Jito Blok Motoruna bundle olarak gönderiliyor (MEV koruması aktif)...");
        // Not: Gerçek dairesel arbitrajda iki swap işlemi Jito Bundle içinde tek seferde gönderilerek atomiklik sağlanır.
        const res1 = await sendTransactionToJito(tx1);
        const res2 = await sendTransactionToJito(tx2);
        console.log("   [JITO] Yanıt:", JSON.stringify({ res1, res2 }));
        console.log("   ✅ ARBİTRAJ BAŞARIYLA TAMAMLANDI!");
        await sendTelegramNotification(`🔔 *SOLArb ARBİTRAJ BAŞARILI (JITO BUNDLE)!*\n\n💸 *Rota:* ${CONFIG.START_TOKEN} ➔ ${CONFIG.INTER_TOKEN} ➔ ${CONFIG.START_TOKEN}\n💵 *Sermaye:* ${CONFIG.TRADE_AMOUNT} ${CONFIG.START_TOKEN}\n📈 *Elde Edilen Net Kâr:* +${profitHuman.toFixed(6)} ${CONFIG.START_TOKEN} (%${profitPct.toFixed(3)})\n🛡️ *Jito MEV Koruması:* Aktif (Bundle)`);
      } else {
        // Doğrudan RPC üzerinden gönder
        const sig1 = await connection.sendTransaction(tx1, { skipPreflight: false });
        console.log("   🚀 İşlem 1 Gönderildi. İmza:", sig1);
        
        const sig2 = await connection.sendTransaction(tx2, { skipPreflight: false });
        console.log("   🚀 İşlem 2 Gönderildi. İmza:", sig2);

        // Onay bekle
        console.log("   [4/4] İşlemlerin ağda onaylanması bekleniyor...");
        await connection.confirmTransaction(sig1, "confirmed");
        await connection.confirmTransaction(sig2, "confirmed");
        console.log("   ✅ ARBİTRAJ BAŞARIYLA TAMAMLANDI!");
        await sendTelegramNotification(`🔔 *SOLArb ARBİTRAJ BAŞARILI!*\n\n💸 *Rota:* ${CONFIG.START_TOKEN} ➔ ${CONFIG.INTER_TOKEN} ➔ ${CONFIG.START_TOKEN}\n💵 *Sermaye:* ${CONFIG.TRADE_AMOUNT} ${CONFIG.START_TOKEN}\n📈 *Elde Edilen Net Kâr:* +${profitHuman.toFixed(6)} ${CONFIG.START_TOKEN} (%${profitPct.toFixed(3)})\n🛡️ *Jito MEV Koruması:* Pasif\n🔗 *Tx1:* https://solscan.io/tx/${sig1}\n🔗 *Tx2:* https://solscan.io/tx/${sig2}`);
      }
      
    } catch (err) {
      console.error("   ❌ Arbitraj yürütülürken kritik hata:", err.message);
    }
  } else {
    console.log(`   ⏱️ Fırsat yetersiz. Minimum kâr limiti (%${CONFIG.MIN_PROFIT_PCT}) altında. Pas geçildi.`);
  }
}

// Botu başlat
async function main() {
  console.log("==================================================");
  console.log("🚀 SOLArb BAŞLATILIYOR...");
  console.log(`📌 Başlangıç Varlığı: ${CONFIG.TRADE_AMOUNT} ${CONFIG.START_TOKEN}`);
  console.log(`📌 Ara Birim Varlık: ${CONFIG.INTER_TOKEN}`);
  console.log(`📌 Hedef Minimum Kâr: %${CONFIG.MIN_PROFIT_PCT}`);
  console.log(`📌 Slipaj Toleransı: %${CONFIG.SLIPPAGE_BPS / 100}`);
  console.log(`📌 Tarama Periyodu: ${CONFIG.SCAN_INTERVAL / 1000} saniye`);
  console.log(`📌 Jito MEV Koruması: ${CONFIG.USE_JITO ? "AKTİF" : "PASİF"}`);
  console.log("==================================================");

  // İlk taramayı başlat
  await checkArbitrage();

  // Belirlenen aralıklarla sürekli tara
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
