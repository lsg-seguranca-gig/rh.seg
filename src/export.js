import * as XLSX from "xlsx";
import { isEmAlerta, minimoCompartilhado } from "./utils";

// ─────────────────────────────────────────────────────────────────
//  EXPORTAÇÃO EXCEL (.xlsx) — Estoque completo + Alertas
// ─────────────────────────────────────────────────────────────────
export function exportarExcel(epis) {
  const wb = XLSX.utils.book_new();

  // Aba 1: Estoque completo
  const estoqueData = [
    ["Nome do EPI","CA","Local","Quantidade","Mínimo","Status"],
    ...epis.map(e => [
      e.nome, e.ca, e.local, e.quantidade, e.minimo,
      isEmAlerta(e, epis) ? "BAIXO" : "OK"
    ])
  ];
  const wsEstoque = XLSX.utils.aoa_to_sheet(estoqueData);
  wsEstoque["!cols"] = [{wch:32},{wch:10},{wch:20},{wch:12},{wch:10},{wch:10}];
  XLSX.utils.book_append_sheet(wb, wsEstoque, "Estoque");

  // Aba 2: Alertas
  const alertas = epis.filter(e => isEmAlerta(e, epis));
  const alertasData = [
    ["Nome do EPI","CA","Local","Quantidade Atual","Mínimo","Faltam"],
    ...alertas.map(e => {
      const min = minimoCompartilhado(e.nome, epis);
      return [e.nome, e.ca, e.local, e.quantidade, min, Math.max(0, min - e.quantidade)];
    })
  ];
  const wsAlertas = XLSX.utils.aoa_to_sheet(alertasData);
  wsAlertas["!cols"] = [{wch:32},{wch:10},{wch:20},{wch:14},{wch:10},{wch:10}];
  XLSX.utils.book_append_sheet(wb, wsAlertas, "Alertas para Compra");

  const dataStr = new Date().toLocaleDateString("pt-BR").replace(/\//g,"-");
  XLSX.writeFile(wb, `Relatorio_EPIs_LSG_${dataStr}.xlsx`);
}

// ─────────────────────────────────────────────────────────────────
//  EXPORTAÇÃO PDF — via janela de impressão do navegador
//  Gera HTML formatado e abre o diálogo de impressão (salvar como PDF)
// ─────────────────────────────────────────────────────────────────
export function exportarPDF(epis) {
  const alertas = epis.filter(e => isEmAlerta(e, epis));
  const dataStr = new Date().toLocaleString("pt-BR", { dateStyle:"long", timeStyle:"short" });

  const linhaEstoque = (e) => {
    const baixo = isEmAlerta(e, epis);
    return `<tr style="${baixo ? "background:#fff5f5;" : ""}">
      <td>${escapeHtml(e.nome)}</td>
      <td>${escapeHtml(e.ca)}</td>
      <td>${escapeHtml(e.local)}</td>
      <td style="text-align:center;font-weight:700;${baixo ? "color:#e8000d;" : ""}">${e.quantidade}</td>
      <td style="text-align:center;">${e.minimo}</td>
      <td style="text-align:center;${baixo ? "color:#e8000d;font-weight:700;" : "color:#276749;"}">${baixo ? "BAIXO" : "OK"}</td>
    </tr>`;
  };

  const linhaAlerta = (e) => {
    const min = minimoCompartilhado(e.nome, epis);
    const faltam = Math.max(0, min - e.quantidade);
    return `<tr>
      <td>${escapeHtml(e.nome)}</td>
      <td>${escapeHtml(e.ca)}</td>
      <td>${escapeHtml(e.local)}</td>
      <td style="text-align:center;">${e.quantidade}</td>
      <td style="text-align:center;">${min}</td>
      <td style="text-align:center;font-weight:700;color:#e8000d;">${faltam}</td>
    </tr>`;
  };

  const html = `
  <!DOCTYPE html>
  <html lang="pt-BR">
  <head>
    <meta charset="UTF-8">
    <title>Relatório de EPIs — LSG Sky Chefs</title>
    <style>
      * { box-sizing:border-box; margin:0; padding:0; font-family: Arial, Helvetica, sans-serif; }
      body { padding: 32px; color:#1a2233; }
      h1 { color:#003087; font-size:22px; margin-bottom:4px; }
      .sub { color:#5a6a82; font-size:13px; margin-bottom:24px; }
      h2 { color:#003087; font-size:16px; margin:24px 0 8px; border-bottom:2px solid #003087; padding-bottom:4px; }
      table { width:100%; border-collapse:collapse; font-size:12px; margin-bottom:8px; }
      th { background:#003087; color:#fff; padding:8px; text-align:left; font-size:11px; text-transform:uppercase; }
      td { padding:6px 8px; border-bottom:1px solid #dde3ec; }
      .empty { text-align:center; color:#276749; font-weight:600; padding:16px; background:#f0fff4; border-radius:8px; }
      @media print { body { padding:12px; } }
    </style>
  </head>
  <body>
    <h1>📋 Relatório de Controle de EPIs</h1>
    <p class="sub">LSG Sky Chefs — Gestão de Equipamentos de Proteção Individual<br>Gerado em: ${dataStr}</p>

    <h2>Estoque Completo (${epis.length} itens)</h2>
    <table>
      <thead><tr><th>Nome do EPI</th><th>CA</th><th>Local</th><th>Qtd.</th><th>Mín.</th><th>Status</th></tr></thead>
      <tbody>${epis.map(linhaEstoque).join("")}</tbody>
    </table>

    <h2>⚠️ Itens para Compra (${alertas.length} alertas)</h2>
    ${alertas.length === 0
      ? `<div class="empty">🎉 Nenhum item abaixo do mínimo.</div>`
      : `<table>
          <thead><tr><th>Nome do EPI</th><th>CA</th><th>Local</th><th>Qtd. Atual</th><th>Mínimo</th><th>Faltam</th></tr></thead>
          <tbody>${alertas.map(linhaAlerta).join("")}</tbody>
        </table>`}
  </body>
  </html>`;

  const win = window.open("", "_blank");
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => win.print(), 350);
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;")
    .replace(/"/g,"&quot;").replace(/'/g,"&#39;");
}
