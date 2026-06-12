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

// ─────────────────────────────────────────────────────────────────
//  USUÁRIOS PRÉ-CADASTRADOS
//  Adicione/remova nomes nesta lista conforme a equipe do setor.
// ─────────────────────────────────────────────────────────────────
export const USUARIOS = [
  "Vitor Silva",
  "Francinele Machado",
  "Amanda Santos",
];

// ─────────────────────────────────────────────────────────────────
//  HISTÓRICO DE MOVIMENTAÇÕES
//  Estrutura de cada registro: [Data/Hora, Usuário, Nome do EPI, CA, Qtd Anterior, Qtd Nova, Diferença]
// ─────────────────────────────────────────────────────────────────
export function rowsToHistorico(rows) {
  if (!rows || rows.length <= 1) return [];
  return rows.slice(1).filter(r => r[0]).map(r => ({
    data:        String(r[0]||""),
    usuario:     String(r[1]||""),
    nome:        String(r[2]||""),
    ca:          String(r[3]||""),
    qtdAnterior: parseInt(r[4],10) || 0,
    qtdNova:     parseInt(r[5],10) || 0,
    diferenca:   parseInt(r[6],10) || 0,
  })).reverse(); // mais recentes primeiro
}

// Gera as novas linhas de log a partir da comparação entre estado antigo e novo
export function buildHistoricoEntries(oldEpis, newEpis, usuario) {
  const agora = new Date();
  const dataStr = agora.toLocaleString("pt-BR", { dateStyle:"short", timeStyle:"medium" });
  const entries = [];
  newEpis.forEach(novo => {
    const antigo = oldEpis.find(e => epiKey(e.nome,e.ca) === epiKey(novo.nome,novo.ca));
    const qtdAnterior = antigo ? antigo.quantidade : 0;
    const diff = novo.quantidade - qtdAnterior;
    if (diff !== 0) {
      entries.push([dataStr, usuario, novo.nome, novo.ca, qtdAnterior, novo.quantidade, diff]);
    }
  });
  return entries;
}

// ─────────────────────────────────────────────────────────────────
//  DASHBOARD — estatísticas agregadas
// ─────────────────────────────────────────────────────────────────
export function computeDashboard(epis) {
  const total = epis.length;
  const alertas = epis.filter(e => isEmAlerta(e, epis));
  const porLocal = {};
  epis.forEach(e => {
    porLocal[e.local] = (porLocal[e.local] || 0) + 1;
  });
  // Top 5 mais críticos: ordena por (quantidade - mínimoCompartilhado), menor primeiro
  const criticos = [...epis]
    .map(e => ({ ...e, gap: e.quantidade - minimoCompartilhado(e.nome, epis) }))
    .filter(e => isEmAlerta(e, epis))
    .sort((a,b) => a.gap - b.gap)
    .slice(0, 5);
  return { total, totalAlertas: alertas.length, porLocal, criticos };
}
