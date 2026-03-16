// /api/gas.js
// Proxy para Google Apps Script (GAS) com suporte a:
// - GAS_ENDPOINT (recomendada) e fallback para GAS_WEBAPP_URL
// - GET / POST / OPTIONS (CORS)
// - Follow redirect (302) do GAS
// - Body text/plain (compatível com doPost)
// - Pass-through de JSON e cache leve para GET

// Se quiser restringir CORS ao domínio do seu projeto, troque '*' pelo seu domínio Vercel:
const allowOrigin = '*';

export default async function handler(req, res) {
  // --- CORS preflight ---
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', allowOrigin);
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return res.status(204).end();
  }

  res.setHeader('Access-Control-Allow-Origin', allowOrigin);

  // Preferencialmente GAS_ENDPOINT; fallback para GAS_WEBAPP_URL
  const GAS =
    (process.env.GAS_ENDPOINT && process.env.GAS_ENDPOINT.trim()) ||
    (process.env.GAS_WEBAPP_URL && process.env.GAS_WEBAPP_URL.trim()) ||
    '';

  if (!GAS) {
    return res.status(500).json({
      error:
        'Defina a variável de ambiente GAS_ENDPOINT (ou GAS_WEBAPP_URL) na Vercel com a URL do Web App do Apps Script.',
    });
  }

  try {
    const { method, query } = req;
    const params = new URLSearchParams(query);
    const url = `${GAS}?${params.toString()}`;

    let upstreamResp;

    if (method === 'GET') {
      upstreamResp = await fetch(url, { redirect: 'follow' });
    } else if (method === 'POST') {
      const bodyText =
        typeof req.body === 'string' ? req.body : JSON.stringify(req.body ?? {});
      upstreamResp = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: bodyText,
        redirect: 'follow',
      });
    } else {
      return res.status(405).json({ error: `Método não suportado: ${method}` });
    }

    const text = await upstreamResp.text();

    // GAS normalmente envia JSON como texto
    try {
      const json = JSON.parse(text);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');

      // Cache leve para GET
      if (method === 'GET') {
        res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
      }

      return res
        .status(upstreamResp.ok ? upstreamResp.status : 502)
        .send(json);
    } catch {
      // texto bruto se não for JSON
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(502).send(text);
    }
  } catch (err) {
    console.error('[api/gas] error:', err);
    return res.status(502).json({ error: 'Falha ao contatar GAS', detail: String(err) });
  }
}