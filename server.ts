import express from "express";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '10mb' }));

  // API Health Check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "DermAI Backend Running" });
  });

  // Mock Medical Glossary API
  app.get("/api/glossary/:condition", (req, res) => {
    const { condition } = req.params;
    const glossary: Record<string, string> = {
      "eczema": "Atopic dermatitis is a condition that makes your skin red and itchy.",
      "psoriasis": "Psoriasis is a skin disease that causes red, itchy scaly patches.",
      "acne": "A skin condition that occurs when hair follicles become plugged with oil and dead skin cells."
    };
    res.json({ 
      condition, 
      description: glossary[condition.toLowerCase()] || "Information not found in local cache." 
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
