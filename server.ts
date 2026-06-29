import express from "express";
import path from "path";
import fs from "fs";
import { spawn } from "child_process";
import { createServer as createViteServer } from "vite";

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

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
