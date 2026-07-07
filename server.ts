import express from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";
import dns from "dns";
import { Connection, PublicKey } from "@solana/web3.js";

// Node's IPv6 DNS bug fix for some containers
if (dns && typeof dns.setDefaultResultOrder === "function") {
  dns.setDefaultResultOrder("ipv4first");
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Body parser for JSON
  app.use(express.json({ limit: '10mb' }));

  // API routes FIRST
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Helper to resolve paths dynamically depending on where PM2/node is started
  const getPaths = () => {
    const cwd = process.cwd();
    // Check if we are already inside the SOLArb folder
    const isInsideSOLArb = path.basename(cwd).toLowerCase() === "solarb";

    let folderPath = cwd;
    if (!isInsideSOLArb) {
      folderPath = path.join(cwd, "SOLArb");
    }

    const botFile = path.join(folderPath, "bot.ts");
    const configFile = path.join(folderPath, "config.json");
    const relativeBotPath = isInsideSOLArb ? "bot.ts" : "SOLArb/bot.ts";

    return {
      folderPath,
      botFile,
      configFile,
      relativeBotPath
    };
  };

  app.post("/api/save-bot", (req, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ error: "Kod parametresi eksik." });
      }

      const paths = getPaths();
      if (!fs.existsSync(paths.folderPath)) {
        fs.mkdirSync(paths.folderPath, { recursive: true });
      }

      fs.writeFileSync(paths.botFile, code, "utf8");
      console.log(`[SOLArb] bot.ts dosyası başarıyla sunucuya kaydedildi: ${paths.botFile}`);
      res.json({ success: true, path: paths.relativeBotPath });
    } catch (error: any) {
      console.error("bot.ts kaydedilirken hata oluştu:", error);
      res.status(500).json({ error: error.message || "Dosya yazma hatası." });
    }
  });

  app.post("/api/save-config", (req, res) => {
    try {
      const config = req.body;
      const paths = getPaths();
      if (!fs.existsSync(paths.folderPath)) {
        fs.mkdirSync(paths.folderPath, { recursive: true });
      }
      fs.writeFileSync(paths.configFile, JSON.stringify(config, null, 2), "utf8");

      console.log(`[SOLArb] config.json dosyası başarıyla sunucuya kaydedildi: ${paths.configFile}`);
      res.json({ success: true });
    } catch (error: any) {
      console.error("config.json kaydedilirken hata oluştu:", error);
      res.status(500).json({ error: error.message || "Dosya yazma hatası." });
    }
  });

  app.get("/api/load-config", (req, res) => {
    try {
      const paths = getPaths();
      if (fs.existsSync(paths.configFile)) {
        const data = fs.readFileSync(paths.configFile, "utf8");
        res.json({ success: true, config: JSON.parse(data) });
      } else {
        res.json({ success: false, message: "Henüz kaydedilmiş ayar bulunamadı." });
      }
    } catch (error: any) {
      console.error("config.json yüklenirken hata oluştu:", error);
      res.status(500).json({ error: error.message || "Dosya okuma hatası." });
    }
  });

  app.get("/api/spy-wallet", async (req, res) => {
    try {
      const { walletAddress, rpcUrl } = req.query;
      if (!walletAddress) {
        return res.status(400).json({ error: "walletAddress parametresi gerekli." });
      }

      let connectionUrl = (rpcUrl as string) || "";
      if (connectionUrl === "undefined" || connectionUrl === "null") {
        connectionUrl = "";
      }
      
      connectionUrl = connectionUrl.trim();
      
      if (!connectionUrl) {
        connectionUrl = "https://api.mainnet-beta.solana.com";
      } else if (!connectionUrl.startsWith("http://") && !connectionUrl.startsWith("https://")) {
        connectionUrl = "https://" + connectionUrl;
      }

      const connection = new Connection(connectionUrl, "confirmed");
      let pubKey: PublicKey;
      
      try {
        pubKey = new PublicKey(walletAddress as string);
      } catch (err) {
        return res.status(400).json({ error: "Geçersiz Solana cüzdan adresi formatı." });
      }

      // Get recent transaction signatures
      console.log(`[Cüzdan Casusu] ${pubKey.toBase58()} cüzdanı için son işlemler çekiliyor...`);
      const signatures = await connection.getSignaturesForAddress(pubKey, { limit: 12 });
      if (signatures.length === 0) {
        return res.json({ success: true, tokens: [] });
      }

      const txSignatures = signatures.map((s) => s.signature);
      
      // Fetch detailed parsed transactions
      const parsedTxes = await connection.getParsedTransactions(txSignatures, {
        maxSupportedTransactionVersion: 0,
        commitment: "confirmed"
      });

      const uniqueMints = new Set<string>();

      for (const tx of parsedTxes) {
        if (!tx || !tx.meta) continue;

        // Extract from token balances
        const preBalances = tx.meta.preTokenBalances || [];
        const postBalances = tx.meta.postTokenBalances || [];

        for (const balance of [...preBalances, ...postBalances]) {
          if (balance && balance.mint) {
            const mint = balance.mint;
            // Ignore SOL and standard stablecoins
            if (
              mint !== "So11111111111111111111111111111111111111112" && // SOL
              mint !== "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v" && // USDC
              mint !== "Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB"    // USDT
            ) {
              uniqueMints.add(mint);
            }
          }
        }
      }

      // Now, query DexScreener to get symbols and names of these mints in bulk
      const mintList = Array.from(uniqueMints).slice(0, 30); // limit to top 30
      const discoveredTokens: { symbol: string; mint: string; name: string; price?: string }[] = [];

      if (mintList.length > 0) {
        try {
          const dexRes = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${mintList.join(",")}`);
          if (dexRes.ok) {
            const dexData = await dexRes.json();
            if (dexData && dexData.pairs) {
              const addedMints = new Set<string>();
              for (const pair of dexData.pairs) {
                if (pair.chainId === "solana" && pair.baseToken) {
                  const mint = pair.baseToken.address;
                  if (!addedMints.has(mint) && mintList.includes(mint)) {
                    addedMints.add(mint);
                    discoveredTokens.push({
                      symbol: pair.baseToken.symbol || "UNKNOWN",
                      name: pair.baseToken.name || "Unknown Token",
                      mint: mint,
                      price: pair.priceUsd ? `$${parseFloat(pair.priceUsd).toLocaleString()}` : undefined
                    });
                  }
                }
              }
            }
          }
        } catch (e) {
          console.warn("[Cüzdan Casusu] DexScreener API zenginleştirme hatası:", e);
        }
        
        // For any mints that DexScreener didn't return, add them with default UNKNOWN symbol
        for (const mint of mintList) {
          const alreadyAdded = discoveredTokens.some((t) => t.mint === mint);
          if (!alreadyAdded) {
            discoveredTokens.push({
              symbol: "SPY",
              name: "Discovered Token",
              mint: mint
            });
          }
        }
      }

      console.log(`[Cüzdan Casusu] İşlem tamamlandı. ${discoveredTokens.length} adet benzersiz aktif token keşfedildi.`);
      res.json({
        success: true,
        tokens: discoveredTokens
      });
    } catch (error: any) {
      console.error("[Cüzdan Casusu] Hata oluştu:", error);
      res.status(500).json({ error: error.message || "Casus cüzdan verileri çekilemedi." });
    }
  });

  // Background Bot Runner Process Store
  let botProcess: any = null;
  const botLogs: { text: string; type: string; timestamp: string }[] = [];

  function addBotLog(text: string, type = "info") {
    const timestamp = new Date().toLocaleTimeString("tr-TR");
    botLogs.push({ text, type, timestamp });
    if (botLogs.length > 300) {
      botLogs.shift();
    }
  }

  app.post("/api/bot/start", (req, res) => {
    try {
      if (botProcess) {
        return res.json({ success: false, error: "Bot zaten çalışıyor." });
      }

      const paths = getPaths();
      if (!fs.existsSync(paths.botFile)) {
        return res.json({
          success: false,
          error: "Öncelikle 'Sunucuya Kaydet' butonuna basarak bot.ts dosyasını sunucuya yazmalısınız."
        });
      }

      addBotLog("🚀 Gerçek Solana botu başlatılıyor...", "info");
      
      // Determine the best execution method
      let command = "npx";
      let args = ["-y", "tsx", paths.relativeBotPath];
      
      const localTsxPath = path.join(process.cwd(), "node_modules", ".bin", "tsx");
      const localTsxMjs = path.join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

      if (fs.existsSync(localTsxPath)) {
        command = localTsxPath;
        args = [paths.relativeBotPath];
        addBotLog(`📌 Yerel TSX ikilisi tespit edildi: ${command}`, "info");
      } else if (fs.existsSync(localTsxMjs)) {
        command = process.execPath; // Absolute path to node
        args = [localTsxMjs, paths.relativeBotPath];
        addBotLog(`📌 Yerel TSX cli modülü tespit edildi, node ile çalıştırılıyor: ${command}`, "info");
      } else {
        addBotLog(`📌 Yerel TSX bulunamadı, npx -y tsx ile çalıştırılıyor...`, "info");
      }

      const isWin = process.platform === "win32";
      
      // Spawn TSX process to run the TypeScript bot
      botProcess = spawn(command, args, {
        cwd: process.cwd(),
        shell: isWin,
        env: { ...process.env, NODE_ENV: "production" }
      });

      botProcess.on("error", (err: any) => {
        console.error("Bot spawn error:", err);
        addBotLog(`❌ Başlatma Hatası: ${err.message}`, "error");
      });

      botProcess.stdout?.on("data", (data: any) => {
        const text = data.toString().trim();
        if (text) {
          const lines = text.split("\n");
          lines.forEach((line: string) => {
            let type = "info";
            const lower = line.toLowerCase();
            if (lower.includes("error") || lower.includes("hata") || lower.includes("❌")) {
              type = "error";
            } else if (lower.includes("success") || lower.includes("başarı") || lower.includes("✅") || lower.includes("kâr") || lower.includes("+")) {
              type = "success";
            } else if (lower.includes("warn") || lower.includes("uyarı") || lower.includes("⚠️")) {
              type = "warning";
            }
            addBotLog(line, type);
          });
        }
      });

      botProcess.stderr?.on("data", (data: any) => {
        const text = data.toString().trim();
        if (text) {
          const lines = text.split("\n");
          lines.forEach((line: string) => {
            addBotLog(line, "error");
          });
        }
      });

      botProcess.on("close", (code: any) => {
        addBotLog(`🤖 Bot süreci durdu. Çıkış kodu: ${code}`, "warning");
        botProcess = null;
      });

      res.json({ success: true, message: "Bot süreci başarıyla başlatıldı." });
    } catch (err: any) {
      console.error("Bot başlatılırken hata:", err);
      res.status(500).json({ error: err.message || "Bot başlatılamadı." });
    }
  });

  app.post("/api/bot/stop", (req, res) => {
    try {
      if (botProcess) {
        botProcess.kill("SIGTERM");
        botProcess = null;
        addBotLog("🛑 Bot süreci durduruldu.", "warning");
        res.json({ success: true, message: "Bot başarıyla durduruldu." });
      } else {
        res.json({ success: false, error: "Zaten çalışan aktif bir bot yok." });
      }
    } catch (err: any) {
      console.error("Bot durdurulurken hata:", err);
      res.status(500).json({ error: err.message || "Bot durdurulamadı." });
    }
  });

  app.get("/api/bot/status", (req, res) => {
    res.json({
      success: true,
      running: botProcess !== null,
      logs: botLogs
    });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
