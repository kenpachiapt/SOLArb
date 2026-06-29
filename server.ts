import express from "express";
import path from "path";
import fs from "fs";
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

  app.post("/api/save-bot", (req, res) => {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ error: "Kod parametresi eksik." });
      }

      // Create SOLArb directory if it does not exist
      const folderPath = path.join(process.cwd(), "SOLArb");
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      // Write bot.ts to SOLArb directory
      const filePath = path.join(folderPath, "bot.ts");
      fs.writeFileSync(filePath, code, "utf8");

      console.log(`[SOLArb] bot.ts dosyası başarıyla sunucuya kaydedildi: ${filePath}`);
      res.json({ success: true, path: "SOLArb/bot.ts" });
    } catch (error: any) {
      console.error("bot.ts kaydedilirken hata oluştu:", error);
      res.status(500).json({ error: error.message || "Dosya yazma hatası." });
    }
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
