// /api/gas.js — Vercel Serverless Function (Node 18+)
// Proxy entre o front e o Web App do Google Apps Script (GAS).
// Lê op (e demais query params) e encaminha para o GAS, devolvendo a resposta “como veio”.

export default async function handler(req, res) {
  try {
    const GAS_WEBAPP_URL = process.env.GAS_WEBAPP_URL;
    if (!GAS_WEBAPP_URL) {
      res.status(500).json({ error: 'GAS_WEBAPP_URL não configurada' });
      return;
    }

    // Monta a URL final para o GAS preservando querystring (?op=... & ...)
    const target = new URL(GAS_WEBAPP_URL);
    // Copia todos os query params recebidos
    for (const [k, v] of Object.entries(req.query || {})) {
      target.searchParams.set(k, Array.isArray(v) ? v[0] : v);
    }

    // Prepara init da requisição
    const init = { method: req.method, redirect: 'follow', headers: {} };

    // Body: apenas se não for GET/HEAD
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // O front envia 'text/plain' + JSON.stringify(body). Mantemos isso por compatibilidade com o GAS.
      const contentType = req.headers['content-type'] || 'text/plain';
      init.headers['Content-Type'] = contentType;

      // Em Vercel, req.body pode vir string (text/plain) ou objeto (application/json)
      const rawBody =
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      init.body = rawBody;
    }

    // Encaminha ao GAS
    const upstream = await fetch(target.toString(), init);

    // Repasse do status e do corpo
    const ct = upstream.headers.get('content-type') || 'text/plain; charset=utf-8';
    const text = await upstream.text();
    res.status(upstream.status).setHeader('Content-Type', ct).send(text);
  } catch (err) {
    console.error('Proxy GAS error:', err);
    res.status(500).json({ error: 'Proxy error', detail: String(err) });
  }
}