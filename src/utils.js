// ── Chave única por EPI ───────────────────────
export function epiKey(nome, ca) {
  return `${String(nome).trim().toLowerCase()}||${String(ca).trim()}`;
}

// ── Normaliza valores de "Local" vindos da planilha ───
// Aceita variações como "ALMOXARIFADO", "Almoxarifado", "S. DO TRABALHO",
// "Segurança do Trabalho", "ST", etc., e converte para os 2 valores canônicos.
export function normalizeLocal(raw) {
  const v = String(raw || "").trim().toLowerCase();
  if (v.includes("seguran") || v === "st" || v.includes("s. do trabalho") || v.includes("trabalho")) {
    return "Segurança do Trabalho";
  }
  return "Almoxarifado";
}

// ── Planilha → EPIs ───────────────────────────
const stripInvisible = (s) => String(s || "").replace(/^\uFEFF/, "").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();

export function rowsToEpis(rows) {
  return rows.slice(1).filter(r => r[0]).map(r => ({
    nome:       stripInvisible(r[0]),
    ca:         stripInvisible(r[1]),
    local:      normalizeLocal(r[2]),
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
  // Se o MÍNIMO DESTA LINHA é 0 (item sem rotatividade nesse local),
  // o status depende apenas da quantidade desta linha: baixo só se for 0.
  if (epi.minimo === 0) return epi.quantidade === 0;
  // Caso contrário, usa o mínimo compartilhado entre linhas do mesmo nome.
  const minimo = minimoCompartilhado(epi.nome, epis);
  return epi.quantidade <= minimo;
}

// ── Filtro de lista ───────────────────────────
export function applyFilters(list, { text, local, status }, allEpis) {
  const t = String(text || "").trim().toLowerCase();
  return list.filter(e => {
    const nome = String(e.nome || "").toLowerCase();
    const ca   = String(e.ca   || "").toLowerCase();
    const matchText   = !t || nome.includes(t) || ca.includes(t);
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
  "Equipe Segurança do Trabalho",
  "Almoxarifado",
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

// ─────────────────────────────────────────────────────────────────
//  CADASTRO — agrupamento por nome (para tela de Cadastro de EPIs)
//  Cada grupo reúne todas as linhas (CAs diferentes) do mesmo nome.
// ─────────────────────────────────────────────────────────────────
export function groupEpisByName(epis) {
  const map = {};
  epis.forEach(e => {
    const key = e.nome.trim().toLowerCase();
    if (!map[key]) map[key] = { nome:e.nome, linhas:[], totalQtd:0, minimo:0 };
    map[key].linhas.push(e);
    map[key].totalQtd += e.quantidade;
    map[key].minimo = Math.max(map[key].minimo, e.minimo);
  });
  return Object.values(map).sort((a,b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
