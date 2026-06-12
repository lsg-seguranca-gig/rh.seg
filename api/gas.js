// ═══════════════════════════════════════════════════════════════════
//  api/gas.js — Proxy Serverless para Google Apps Script
//  Hospedado no Vercel. Contorna bloqueios corporativos de rede
//  fazendo todas as chamadas ao GAS pelo servidor, não pelo browser.
// ═══════════════════════════════════════════════════════════════════

const GAS_URL = process.env.GAS_URL; // Definido nas variáveis de ambiente do Vercel

export default async function handler(req, res) {
  // ── CORS — permite chamadas do próprio site hospedado no Vercel ──
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Preflight OPTIONS
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (!GAS_URL) {
    return res.status(500).json({
      status: "error",
      message: "Variável de ambiente GAS_URL não configurada no Vercel.",
    });
  }

  try {
    // ── GET → leitura da planilha ──────────────────────────────────
    if (req.method === "GET") {
      const sheet = req.query && req.query.sheet ? `?sheet=${encodeURIComponent(req.query.sheet)}` : "";
      const gasRes = await fetch(GAS_URL + sheet, {
        method: "GET",
        redirect: "follow",
      });

      if (!gasRes.ok) {
        throw new Error(`GAS respondeu com status ${gasRes.status}`);
      }

      const data = await gasRes.json();
      return res.status(200).json(data);
    }

    // ── POST → gravação na planilha ────────────────────────────────
    if (req.method === "POST") {
      const body = typeof req.body === "string" ? req.body : JSON.stringify(req.body);

      const gasRes = await fetch(GAS_URL, {
        method: "POST",
        redirect: "follow",
        headers: { "Content-Type": "application/json" },
        body,
      });

      if (!gasRes.ok) {
        throw new Error(`GAS respondeu com status ${gasRes.status}`);
      }

      const data = await gasRes.json();
      return res.status(200).json(data);
    }

    // Método não permitido
    return res.status(405).json({ status: "error", message: "Método não permitido." });

  } catch (err) {
    console.error("[gas.js proxy error]", err);
    return res.status(502).json({
      status: "error",
      message: "Erro ao comunicar com o Google Apps Script: " + err.message,
    });
  }
}
