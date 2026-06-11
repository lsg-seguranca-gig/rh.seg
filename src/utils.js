// ── Chave única por EPI ───────────────────────
export function epiKey(nome, ca) {
  return `${String(nome).trim().toLowerCase()}||${String(ca).trim()}`;
}

// ── Planilha → EPIs ───────────────────────────
export function rowsToEpis(rows) {
  return rows.slice(1).filter(r => r[0]).map(r => ({
    nome:       String(r[0]||"").trim(),
    ca:         String(r[1]||"").trim(),
    local:      String(r[2]||"Almoxarifado").trim(),
    quantidade: parseInt(r[3], 10) || 0,
    minimo:     parseInt(r[4], 10) || 0,
  }));
}

// ── EPIs → linhas planilha ────────────────────
export function episToRows(epis) {
  return [
    ["Nome do EPI","CA","Local","Quantidade","Mínimo"],
    ...epis.map(e => [e.nome, e.ca, e.local, e.quantidade, e.minimo])
  ];
}

// ── Mínimo compartilhado por nome ─────────────
export function minimoCompartilhado(nome, epis) {
  return epis
    .filter(e => e.nome.trim().toLowerCase() === nome.trim().toLowerCase())
    .reduce((max, e) => Math.max(max, e.minimo), 0);
}

// ── Alerta individual ─────────────────────────
export function isEmAlerta(epi, epis) {
  const minimo = minimoCompartilhado(epi.nome, epis);
  // Se o mínimo for zero, só alerta quando a quantidade também for zero
  if (minimo === 0) return epi.quantidade === 0;
  return epi.quantidade <= minimo;
}

// ── Filtro de lista ───────────────────────────
export function applyFilters(list, { text, local, status }, allEpis) {
  return list.filter(e => {
    const t = text.toLowerCase();
    const matchText   = !t || e.nome.toLowerCase().includes(t) || e.ca.toLowerCase().includes(t);
    const matchLocal  = !local || e.local === local;
    const emAlerta    = isEmAlerta(e, allEpis);
    const matchStatus = !status
      || (status === "baixo" && emAlerta)
      || (status === "ok"    && !emAlerta);
    return matchText && matchLocal && matchStatus;
  });
}

// ── Dados de demo ─────────────────────────────
export const DEMO_EPIS = [
  { nome:"Capacete de Segurança",   ca:"12345", local:"Almoxarifado",          quantidade:12, minimo:10 },
  { nome:"Óculos de Ampla Visão",   ca:"6874",  local:"Almoxarifado",          quantidade:2,  minimo:3  },
  { nome:"Óculos de Ampla Visão",   ca:"6136",  local:"Segurança do Trabalho", quantidade:1,  minimo:3  },
  { nome:"Protetor Auricular",      ca:"45678", local:"Segurança do Trabalho", quantidade:4,  minimo:10 },
  { nome:"Luva de Raspa",           ca:"23456", local:"Almoxarifado",          quantidade:3,  minimo:8  },
  { nome:"Bota de Segurança",       ca:"56789", local:"Almoxarifado",          quantidade:6,  minimo:5  },
];

export const BLANK_FILTER = { text:"", local:"", status:"" };
