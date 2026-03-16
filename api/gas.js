// /api/gas.js
// Proxy para Google Apps Script (GAS) com suporte a:
// - Variável de ambiente GAS_ENDPOINT (recomendada)
// - Fallback automático para GAS_WEBAPP_URL (se já existir no projeto)
// - GET / POST / OPTIONS (CORS) com follow-redirect para 302 do GAS
// - Body em text/plain (compatível com doPost do GAS)
// - Pass-through de JSON e cache leve para GET

export const config = {
  runtime: 'nodejs18.x',
};

// Ajuste se quiser restringir CORS ao seu domínio Vercel:
// ex.: const allowOrigin = 'https://rhseg-gig.vercel.app';
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

  // 🔑 Usa GAS_ENDPOINT se existir; caso contrário, tenta GAS_WEBAPP_URL
  const GAS =
    process.env.GAS_ENDPOINT?.trim() ||
    process.env.GAS_WEBAPP_URL?.trim() ||
    '';

  if (!GAS) {
    return res.status(500).json({
      error:
        'Defina a variável de ambiente GAS_ENDPOINT (ou GAS_WEBAPP_URL) na Vercel com a URL do Web App do Apps Script.',
    });
  }

  try {
    const { method, query } = req;

    // Monta a URL final preservando todos os parâmetros (incluindo op)
    const params = new URLSearchParams(query);
    const url = `${GAS}?${params.toString()}`;

    let upstreamResp;

    if (method === 'GET') {
      upstreamResp = await fetch(url, { redirect: 'follow' });
    } else if (method === 'POST') {
      // GAS espera text/plain no doPost
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

    // Normalmente o GAS devolve JSON como texto; tentamos parsear
    try {
      const json = JSON.parse(text);
      res.setHeader('Content-Type', 'application/json; charset=utf-8');

      // Cache leve em edge/CDN para GET (remova se não quiser)
      if (method === 'GET') {
        res.setHeader('Cache-Control', 's-maxage=15, stale-while-revalidate=60');
      }

      return res
        .status(upstreamResp.ok ? upstreamResp.status : 502)
        .send(json);
    } catch {
      // Não era JSON — devolve texto bruto para diagnóstico
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      return res.status(502).send(text);
    }
  } catch (err) {
    console.error('[api/gas] error:', err);
    return res.status(502).json({ error: 'Falha ao contatar GAS', detail: String(err) });
  }
}