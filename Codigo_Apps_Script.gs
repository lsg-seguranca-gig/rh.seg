// ═══════════════════════════════════════════════════════════════════
//  SISTEMA DE CONTROLE DE EPIs — LSG Sky Chefs
//  Google Apps Script — Cole este código no Apps Script da planilha
// ═══════════════════════════════════════════════════════════════════

const SHEET_NAME = "EPIs"; // Nome da aba na planilha

// ── Responde a requisições GET (leitura) ──────────────────────────
function doGet(e) {
  try {
    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAME);

    if (!sheet) {
      return jsonResponse({ status: "error", message: "Aba '" + SHEET_NAME + "' não encontrada." });
    }

    const values = sheet.getDataRange().getValues();
    return jsonResponse({ status: "ok", values: values });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// ── Responde a requisições POST (gravação) ────────────────────────
function doPost(e) {
  try {
    const payload = JSON.parse(e.postData.contents);
    const values  = payload.values; // array de arrays [ [linha1col1, ...], ... ]

    if (!values || !Array.isArray(values)) {
      return jsonResponse({ status: "error", message: "Dados inválidos." });
    }

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    let sheet   = ss.getSheetByName(SHEET_NAME);

    // Cria a aba se não existir
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
    }

    // Limpa o conteúdo atual e reescreve tudo
    sheet.clearContents();

    if (values.length > 0) {
      const range = sheet.getRange(1, 1, values.length, values[0].length);
      range.setValues(values);

      // Formata o cabeçalho (linha 1)
      const headerRange = sheet.getRange(1, 1, 1, values[0].length);
      headerRange.setBackground("#003087");
      headerRange.setFontColor("#ffffff");
      headerRange.setFontWeight("bold");

      // Ajusta largura das colunas automaticamente
      sheet.autoResizeColumns(1, values[0].length);
    }

    return jsonResponse({ status: "ok", message: "Planilha atualizada com sucesso!" });

  } catch (err) {
    return jsonResponse({ status: "error", message: err.toString() });
  }
}

// ── Helper: retorna JSON com CORS ─────────────────────────────────
function jsonResponse(obj) {
  const output = ContentService.createTextOutput(JSON.stringify(obj));
  output.setMimeType(ContentService.MimeType.JSON);
  return output;
}
