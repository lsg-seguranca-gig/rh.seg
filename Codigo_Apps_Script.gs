// ═══════════════════════════════════════════════════════════════════
//  SISTEMA DE CONTROLE DE EPIs — LSG Sky Chefs
//  Google Apps Script
//  Aba "EPIs":      Nome do EPI | CA | Local | Quantidade | Mínimo
//  Aba "Historico": Data/Hora | Usuário | Nome do EPI | CA | Qtd Anterior | Qtd Nova | Diferença
// ═══════════════════════════════════════════════════════════════════

const SHEET_ID = "1UmtuYXLFAVGhihO_rhZSda4b-BsXVe0UM4zn3wlGfS0";

const HIST_HEADER = ["Data/Hora","Usuário","Nome do EPI","CA","Qtd Anterior","Qtd Nova","Diferença"];

// ── GET: leitura ──────────────────────────────────────────────────
// Parâmetro opcional ?sheet=NomeDaAba (padrão: "EPIs")
function doGet(e) {
  try {
    const sheetName = (e.parameter && e.parameter.sheet) || "EPIs";
    const ss    = SpreadsheetApp.openById(SHEET_ID);
    const sheet = ss.getSheetByName(sheetName);

    if (!sheet) {
      // Aba Historico pode não existir ainda — retorna vazio sem erro
      if (sheetName === "Historico") return jsonResponse({ status:"ok", values:[] });
      return jsonResponse({ status:"error", message:"Aba '"+sheetName+"' não encontrada." });
    }

    const values = sheet.getDataRange().getValues();
    return jsonResponse({ status:"ok", values:values });
  } catch(err) {
    return jsonResponse({ status:"error", message:err.toString() });
  }
}

// ── POST: gravação / acréscimo ─────────────────────────────────────
// Body: { values: [[...]], sheet: "EPIs" }            → substitui toda a aba
// Body: { append: [[...]], sheet: "Historico" }       → adiciona linhas ao final
function doPost(e) {
  try {
    const payload   = JSON.parse(e.postData.contents);
    const sheetName = payload.sheet || "EPIs";
    const ss = SpreadsheetApp.openById(SHEET_ID);

    // ── Modo ACRÉSCIMO (histórico) ──
    if (payload.append && Array.isArray(payload.append)) {
      let sheet = ss.getSheetByName(sheetName);
      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        sheet.getRange(1, 1, 1, HIST_HEADER.length).setValues([HIST_HEADER]);
        formatHeader(sheet, HIST_HEADER.length);
      }
      payload.append.forEach(row => sheet.appendRow(row));
      return jsonResponse({ status:"ok", message:"Histórico atualizado." });
    }

    // ── Modo SUBSTITUIÇÃO (estoque) ──
    const values = payload.values;
    if (!values || !Array.isArray(values))
      return jsonResponse({ status:"error", message:"Dados inválidos." });

    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);

    sheet.clearContents();

    if (values.length > 0) {
      const range = sheet.getRange(1, 1, values.length, values[0].length);
      range.setValues(values);
      formatHeader(sheet, values[0].length);
      sheet.autoResizeColumns(1, values[0].length);
    }

    return jsonResponse({ status:"ok", message:"Planilha atualizada com sucesso!" });
  } catch(err) {
    return jsonResponse({ status:"error", message:err.toString() });
  }
}

function formatHeader(sheet, numCols) {
  const header = sheet.getRange(1, 1, 1, numCols);
  header.setBackground("#003087");
  header.setFontColor("#ffffff");
  header.setFontWeight("bold");
}

function jsonResponse(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
