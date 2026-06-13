import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";
import { LIGHT, DARK, makeStyles } from "./styles";
import { epiKey, rowsToEpis, episToRows, isEmAlerta, minimoCompartilhado,
         applyFilters, DEMO_EPIS, BLANK_FILTER, groupEpisByName, normalizeLocal,
         rowsToHistorico, buildHistoricoEntries, computeDashboard } from "./utils";
import { exportarExcel, exportarPDF } from "./export";
import { LogoImg, LoginScreen, Field, FilterBar,
         TableEstoque, CardEpi, TableInventario, CardInventario,
         SplashScreen, ToastContainer, DashboardTab, HistoricoTab, CadastroTab } from "./components";

const ADMIN_PASSWORD = "SegurancaLSG2026";
const PROXY = "/api/gas";
const BUILD_TAG = "2026-06-13-filterfix2";

async function sheetRead(sheet) {
  const r = await fetch(`${PROXY}?sheet=${encodeURIComponent(sheet||"")}`, { method:"GET" });
  if (!r.ok) throw new Error(`Proxy respondeu ${r.status}`);
  const data = await r.json();
  if (data.status === "error") throw new Error(data.message);
  return data.values || [];
}
async function sheetWrite(values, sheet) {
  const r = await fetch(PROXY, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ values, sheet }),
  });
  if (!r.ok) throw new Error(`Proxy respondeu ${r.status}`);
  const data = await r.json();
  if (data.status === "error") throw new Error(data.message);
}
async function sheetAppend(values, sheet) {
  const r = await fetch(PROXY, {
    method:"POST",
    headers:{ "Content-Type":"application/json" },
    body: JSON.stringify({ append: values, sheet }),
  });
  if (!r.ok) throw new Error(`Proxy respondeu ${r.status}`);
  const data = await r.json();
  if (data.status === "error") throw new Error(data.message);
}

let toastId = 0;

export default function App() {
  const [booting, setBooting]             = useState(true);
  const [authed, setAuthed]               = useState(false);
  const [pwInput, setPwInput]             = useState("");
  const [pwError, setPwError]             = useState(false);
  const [userSel, setUserSel]             = useState("");
  const [usuario, setUsuario]             = useState("");
  const [epis, setEpis]                   = useState([]);
  const [historico, setHistorico]         = useState([]);
  const [loading, setLoading]             = useState(false);
  const [toasts, setToasts]               = useState([]);
  const [tab, setTab]                     = useState("dashboard");
  const [dark, setDark]                   = useState(() => localStorage.getItem("epi-dark") === "1");
  const [editIdx, setEditIdx]             = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [estFil, setEstFil]               = useState(BLANK_FILTER);
  const [invFil, setInvFil]               = useState(BLANK_FILTER);
  const [invDraft, setInvDraft]           = useState({});
  const [invDirty, setInvDirty]           = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadError, setUploadError]     = useState("");
  const fileInputRef                      = useRef(null);

  const blankForm = { nome:"", ca:"", local:"Almoxarifado", quantidade:0, minimo:0 };
  const [form, setForm]       = useState(blankForm);
  const [formErr, setFormErr] = useState({});

  useEffect(() => { localStorage.setItem("epi-dark", dark ? "1" : "0"); }, [dark]);
  const C = dark ? DARK : LIGHT;
  const s = makeStyles(C);

  // ── Splash screen — simula carregamento inicial ──
  useEffect(() => {
    const t = setTimeout(() => setBooting(false), 900);
    return () => clearTimeout(t);
  }, []);

  // ── Toasts ────────────────────────────────
  const notify = (msg, type = "ok", icon) => {
    const id = ++toastId;
    setToasts(ts => [...ts, { id, msg, type, icon }]);
    setTimeout(() => setToasts(ts => ts.filter(t => t.id !== id)), 4000);
  };

  // ── Carregar planilha (estoque + histórico) ──
  const loadSheet = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await sheetRead("EPIs");
      const loaded = rows.length <= 1 ? DEMO_EPIS : rowsToEpis(rows);
      setEpis(loaded);
      const draft = {};
      loaded.forEach(e => { draft[epiKey(e.nome, e.ca)] = e.quantidade; });
      setInvDraft(draft); setInvDirty(false);
      if (rows.length <= 1) notify("Planilha vazia — exibindo dados de demonstração.", "info");
      else notify("Dados carregados da planilha.");
    } catch (err) {
      setEpis(DEMO_EPIS);
      const draft = {};
      DEMO_EPIS.forEach(e => { draft[epiKey(e.nome, e.ca)] = e.quantidade; });
      setInvDraft(draft);
      notify("Não foi possível conectar: " + err.message, "error");
    } finally { setLoading(false); }

    // Histórico — tolera erro/ausência da aba sem travar o app
    try {
      const hRows = await sheetRead("Historico");
      setHistorico(rowsToHistorico(hRows));
    } catch { /* aba pode não existir ainda */ }
  }, []);

  useEffect(() => { if (authed) loadSheet(); }, [authed, loadSheet]);

  const saveSheet = async (newEpis) => {
    setLoading(true);
    try { await sheetWrite(episToRows(newEpis), "EPIs"); notify("Planilha atualizada com sucesso!"); }
    catch (e) { notify("Erro ao salvar: " + e.message, "error"); }
    finally { setLoading(false); }
  };

  // Registra movimentações no histórico (best-effort)
  const logHistorico = async (oldEpis, newEpis) => {
    const entries = buildHistoricoEntries(oldEpis, newEpis, usuario || "—");
    if (entries.length === 0) return;
    try {
      await sheetAppend(entries, "Historico");
      // Atualiza histórico local (mais recentes primeiro)
      const novos = entries.map(e => ({
        data:e[0], usuario:e[1], nome:e[2], ca:e[3], qtdAnterior:e[4], qtdNova:e[5], diferenca:e[6]
      })).reverse();
      setHistorico(h => [...novos, ...h]);
    } catch { /* não bloqueia o fluxo principal */ }
  };

  // ── Login ──────────────────────────────────
  const handleLogin = (e) => {
    e.preventDefault();
    if (userSel && pwInput === ADMIN_PASSWORD) {
      setAuthed(true); setPwError(false); setUsuario(userSel);
    } else { setPwError(true); setPwInput(""); }
  };

  // ── CRUD ───────────────────────────────────
  const validateForm = () => {
    const err = {};
    if (!form.nome.trim()) err.nome = "Nome obrigatório";
    if (!form.ca.trim())   err.ca   = "CA obrigatório";
    if (form.quantidade < 0) err.quantidade = "Quantidade inválida";
    if (form.minimo < 0)     err.minimo     = "Mínimo inválido";
    const dup = epis.find((e, i) =>
      epiKey(e.nome, e.ca) === epiKey(form.nome, form.ca) && i !== editIdx
    );
    if (dup) err.ca = "Já existe um EPI com este nome e CA";
    setFormErr(err);
    return Object.keys(err).length === 0;
  };

  const handleSaveEpi = () => {
    if (!validateForm()) return;
    const oldEpis = epis;
    const newEpis = editIdx !== null
      ? epis.map((e, i) => i === editIdx ? { ...form } : e)
      : [...epis, { ...form }];
    setEpis(newEpis); saveSheet(newEpis); logHistorico(oldEpis, newEpis);
    const draft = {};
    newEpis.forEach(e => { draft[epiKey(e.nome, e.ca)] = e.quantidade; });
    setInvDraft(draft); setInvDirty(false);
    setForm(blankForm); setEditIdx(null); setTab("estoque");
  };

  const handleEdit   = (epi, idx) => { setForm({ ...epi }); setEditIdx(idx); setTab("adicionar"); };
  const handleDelete = (idx) => {
    const oldEpis = epis;
    const newEpis = epis.filter((_, i) => i !== idx);
    setEpis(newEpis); saveSheet(newEpis); logHistorico(oldEpis, newEpis);
    const draft = {};
    newEpis.forEach(e => { draft[epiKey(e.nome, e.ca)] = e.quantidade; });
    setInvDraft(draft); setDeleteConfirm(null);
  };

  // ── Inventário ─────────────────────────────
  const handleInvChange = (nome, ca, val) => {
    setInvDraft(d => ({ ...d, [epiKey(nome, ca)]: Math.max(0, parseInt(val, 10) || 0) }));
    setInvDirty(true);
  };
  const handleInvSave = () => {
    const oldEpis = epis;
    const newEpis = epis.map(e => ({ ...e, quantidade: invDraft[epiKey(e.nome, e.ca)] ?? e.quantidade }));
    setEpis(newEpis); saveSheet(newEpis); logHistorico(oldEpis, newEpis);
    setInvDirty(false); setUploadPreview(null); setUploadError("");
  };
  const handleInvCancel = () => {
    const draft = {};
    epis.forEach(e => { draft[epiKey(e.nome, e.ca)] = e.quantidade; });
    setInvDraft(draft); setInvDirty(false);
    setUploadPreview(null); setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Upload de planilha ─────────────────────
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadError(""); setUploadPreview(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb   = XLSX.read(evt.target.result, { type:"array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });
        if (rows.length < 2) { setUploadError("A planilha está vazia."); return; }

        const header = rows[0].map(h => String(h).toLowerCase().trim());
        const hasId  = header[0] === "id";
        const offset = hasId ? 1 : 0;
        if (!header[offset] || !header[offset].includes("nome")) {
          setUploadError("Cabeçalho inválido. Coluna A deve ser 'Nome do EPI'."); return;
        }

        const imported = rows.slice(1).filter(r => r[offset]).map(r => ({
          nome:       String(r[offset]     || "").trim(),
          ca:         String(r[offset + 1] || "").trim(),
          local:      normalizeLocal(r[offset + 2]),
          quantidade: parseInt(r[offset + 3], 10) || 0,
          minimo:     parseInt(r[offset + 4], 10) || 0,
        }));
        if (imported.length === 0) { setUploadError("Nenhum dado válido encontrado."); return; }

        setEpis(imported);
        const draft = {};
        imported.forEach(e => { draft[epiKey(e.nome, e.ca)] = e.quantidade; });
        setInvDraft(draft);
        setInvDirty(true);
        setUploadPreview(imported);
        if (fileInputRef.current) fileInputRef.current.value = "";
        notify(`${imported.length} EPIs carregados — revise e clique em Salvar Inventário.`, "info");
      } catch (err) { setUploadError("Erro ao ler o arquivo: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  // ── Exportação ──────────────────────────────
  const handleExportExcel = () => {
    try { exportarExcel(epis); notify("Relatório Excel gerado!", "ok", "📊"); }
    catch (e) { notify("Erro ao gerar Excel: " + e.message, "error"); }
  };
  const handleExportPDF = () => {
    try { exportarPDF(epis); notify("Relatório PDF gerado!", "ok", "🧾"); }
    catch (e) { notify("Erro ao gerar PDF: " + e.message, "error"); }
  };

  // ── Listas filtradas ───────────────────────
  const estFiltered = applyFilters(epis, estFil, epis);
  const invFiltered = applyFilters(epis, invFil, epis);
  const alertaEpis  = epis.filter(e => isEmAlerta(e, epis));
  const dashboard   = computeDashboard(epis);
  const grupos      = groupEpisByName(epis);

  // ── Atalhos de teclado ──────────────────────
  useEffect(() => {
    const handler = (e) => {
      // Esc fecha modal de exclusão
      if (e.key === "Escape" && deleteConfirm !== null) {
        setDeleteConfirm(null);
      }
      // Ctrl+S salva inventário (se autenticado e na aba inventário)
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        if (authed && tab === "inventario" && invDirty) {
          e.preventDefault();
          handleInvSave();
        } else {
          e.preventDefault();
        }
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [authed, tab, invDirty, deleteConfirm, invDraft, epis]);

  // ── RENDER ─────────────────────────────────
  if (booting) return <SplashScreen s={s} />;

  return (
    <div style={s.root}>
      <header style={s.header}>
        <div style={s.headerInner}><LogoImg style={s.logo} /></div>
        <button style={s.darkBtn} onClick={() => setDark(d => !d)}
          title={dark ? "Modo claro" : "Modo escuro"}>
          {dark ? "☀️" : "🌙"}
        </button>
      </header>

      {!authed
        ? <LoginScreen pwInput={pwInput} setPwInput={setPwInput} pwError={pwError}
            userSel={userSel} setUserSel={setUserSel} handleLogin={handleLogin} C={C} s={s} />
        : (
        <div style={s.pageWrap}>

          {/* Título */}
          <div style={s.titleStrip}>

            <div style={s.rightActions}>
              {alertaEpis.length > 0 && (
                <button style={s.alertBadge} onClick={() => setTab("alertas")}>
                  ⚠️ {alertaEpis.length} alerta{alertaEpis.length > 1 ? "s" : ""}
                </button>
              )}
              <button style={s.logoutBtn} onClick={() => setAuthed(false)}>Sair</button>
            </div>
          </div>

          {/* Abas */}
          <nav style={s.tabs}>
            {[
              { key:"dashboard",  label:"🏠 Visão Geral" },
              { key:"estoque",    label:"📦 Estoque"   },
              { key:"inventario", label:"📋 Inventário" },
              { key:"cadastro",   label:"🗂️ Cadastro de EPIs" },
              { key:"historico",  label:"🕒 Histórico" },
              { key:"adicionar",  label: editIdx !== null ? "✏️ Editar EPI" : "➕ Novo EPI" },
            ].map(t => (
              <button key={t.key}
                style={{ ...s.tab, ...(tab === t.key ? s.tabActive : {}) }}
                onClick={() => {
                  setTab(t.key);
                  if (t.key !== "adicionar") { setForm(blankForm); setEditIdx(null); setFormErr({}); }
                }}>
                {t.label}
              </button>
            ))}
          </nav>

          <main>
            {loading && (
              <div style={s.loadingBar}>
                <span style={s.spinner} />
                <span style={s.loadingText}>Comunicando com a planilha…</span>
              </div>
            )}

            {/* ══ VISÃO GERAL ══ */}
            {tab === "dashboard" && (
              <DashboardTab epis={epis} dashboard={dashboard} s={s} C={C}
                onGoToAlertas={() => setTab("alertas")} />
            )}

            {/* ══ ESTOQUE ══ */}
            {tab === "estoque" && (
              <div style={s.tabContent}>
                <FilterBar fil={estFil} setFil={setEstFil} s={s} onReload={loadSheet} showReload />
                <div style={{ ...s.exportRow, marginBottom:14 }}>
                  <button style={s.exportBtn} onClick={handleExportExcel}>📊 Exportar Excel</button>
                  <button style={s.exportBtn} onClick={handleExportPDF}>🧾 Exportar PDF</button>
                </div>
                <div className="epi-desktop-only" style={s.desktopOnly}>
                  <TableEstoque epis={estFiltered} allEpis={epis} s={s} C={C}
                    onEdit={handleEdit} onDelete={setDeleteConfirm} />
                </div>
                <div className="epi-mobile-only" style={s.mobileOnly}>
                  {estFiltered.map(epi => (
                    <CardEpi key={epiKey(epi.nome, epi.ca)} epi={epi} allEpis={epis}
                      s={s} C={C} onEdit={handleEdit} onDelete={setDeleteConfirm} />
                  ))}
                  {estFiltered.length === 0 && <p style={s.emptyMobile}>Nenhum EPI encontrado.</p>}
                </div>
                <p style={s.countNote}>{estFiltered.length} de {epis.length} linhas exibidas</p>
              </div>
            )}

            {/* ══ INVENTÁRIO ══ */}
            {tab === "inventario" && (
              <div style={s.tabContent}>
                <div style={s.invHeader}>
                  <div>
                    <h2 style={s.invTitle}>📋 Inventário de Estoque</h2>
                    <p style={s.invSubtitle}>Edite manualmente ou importe uma planilha (.xlsx / .csv). Atalho: Ctrl+S salva.</p>
                  </div>
                  <div style={s.invActions}>
                    <button
                      style={{ ...s.saveBtn, opacity: invDirty ? 1 : 0.45,
                        cursor: invDirty ? "pointer" : "default" }}
                      onClick={invDirty ? handleInvSave : undefined}>
                      💾 Salvar Inventário
                    </button>
                    <button style={s.cancelBtn} onClick={handleInvCancel}>↺ Descartar</button>
                  </div>
                </div>

                {/* Painel upload */}
                <div style={s.uploadPanel}>
                  <div style={s.uploadLeft}>
                    <span style={s.uploadIcon}>📂</span>
                    <div>
                      <div style={s.uploadLabel}>Importar planilha de inventário</div>
                      <div style={s.uploadHint}>
                        .xlsx ou .csv — colunas: <strong>Nome do EPI | CA | Local | Quantidade | Mínimo</strong>
                      </div>
                    </div>
                  </div>
                  <label style={s.uploadBtn}>
                    📁 Escolher arquivo
                    <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
                      style={{ display:"none" }} onChange={handleFileUpload} />
                  </label>
                </div>

                {uploadError && (
                  <div style={{ ...s.saveMsg, ...s.saveMsgErr, marginBottom:14 }}>
                    ❌ {uploadError}
                  </div>
                )}

                {uploadPreview && (
                  <div style={s.previewBox}>
                    <div style={s.previewHeader}>
                      <strong style={{ color:C.primary }}>📊 Planilha carregada</strong>
                      <span style={s.previewCount}> — {uploadPreview.length} EPIs prontos para salvar</span>
                    </div>
                    <div style={s.previewWarn}>
                      ⚠️ Revise os dados abaixo e clique em <strong>💾 Salvar Inventário</strong> para gravar no Google Sheets.
                    </div>
                  </div>
                )}

                {invDirty && (
                  <div style={s.invDirtyBanner}>
                    ✏️ Há alterações não salvas — clique em <strong>Salvar Inventário</strong> (ou Ctrl+S) para confirmar.
                  </div>
                )}

                <FilterBar fil={invFil} setFil={setInvFil} s={s} />
                <div className="epi-desktop-only" style={s.desktopOnly}>
                  <TableInventario epis={invFiltered} allEpis={epis} invDraft={invDraft}
                    s={s} C={C} onChange={handleInvChange} />
                </div>
                <div className="epi-mobile-only" style={s.mobileOnly}>
                  {invFiltered.map(epi => (
                    <CardInventario key={epiKey(epi.nome, epi.ca)} epi={epi} allEpis={epis}
                      novaQtd={invDraft[epiKey(epi.nome, epi.ca)] ?? epi.quantidade}
                      s={s} C={C} onChange={handleInvChange} />
                  ))}
                  {invFiltered.length === 0 && <p style={s.emptyMobile}>Nenhum EPI encontrado.</p>}
                </div>
                <p style={s.countNote}>{invFiltered.length} de {epis.length} linhas exibidas</p>
              </div>
            )}

            {/* ══ CADASTRO DE EPIs ══ */}
            {tab === "cadastro" && (
              <div style={s.tabContent}>
                <h2 style={s.invTitle}>🗂️ Cadastro de EPIs</h2>
                <p style={{ ...s.sysSub, marginBottom:16 }}>
                  EPIs agrupados por nome. Clique em um item para ver todos os CAs cadastrados.
                </p>
                <CadastroTab grupos={grupos} allEpis={epis} s={s} C={C}
                  onEdit={handleEdit} onDelete={setDeleteConfirm} />
              </div>
            )}

            {/* ══ HISTÓRICO ══ */}
            {tab === "historico" && (
              <div style={s.tabContent}>
                <h2 style={s.invTitle}>🕒 Histórico de Movimentações</h2>
                <p style={{ ...s.sysSub, marginBottom:16 }}>
                  Registro de todas as alterações de quantidade feitas no Inventário.
                </p>
                <HistoricoTab historico={historico} s={s} C={C} />
              </div>
            )}

            {/* ══ NOVO / EDITAR EPI ══ */}
            {tab === "adicionar" && (
              <div style={{ ...s.formCard, ...s.tabContent }}>
                <h2 style={s.formTitle}>{editIdx !== null ? `Editando: ${form.nome}` : "Novo EPI"}</h2>
                <div style={s.formGrid}>
                  <Field label="Nome do EPI *" error={formErr.nome} s={s}>
                    <input style={s.input} value={form.nome}
                      onChange={e => setForm(f => ({ ...f, nome:e.target.value }))}
                      placeholder="Ex: Luva Nitrílica" />
                  </Field>
                  <Field label="Certificado de Aprovação (CA) *" error={formErr.ca} s={s}>
                    <input style={s.input} value={form.ca}
                      onChange={e => setForm(f => ({ ...f, ca:e.target.value }))}
                      placeholder="Ex: 12345" />
                  </Field>
                  <Field label="Local de Armazenamento" s={s}>
                    <select style={s.input} value={form.local}
                      onChange={e => setForm(f => ({ ...f, local:e.target.value }))}>
                      <option>Almoxarifado</option>
                      <option>Segurança do Trabalho</option>
                    </select>
                  </Field>
                  <Field label="Quantidade em Estoque" error={formErr.quantidade} s={s}>
                    <input style={s.input} type="number" min="0" value={form.quantidade}
                      onChange={e => setForm(f => ({ ...f, quantidade:parseInt(e.target.value)||0 }))} />
                  </Field>
                  <Field label="Estoque Mínimo" error={formErr.minimo} s={s}>
                    <input style={s.input} type="number" min="0" value={form.minimo}
                      onChange={e => setForm(f => ({ ...f, minimo:parseInt(e.target.value)||0 }))} />
                  </Field>
                </div>
                <div style={s.formActions}>
                  <button style={s.saveBtn} onClick={handleSaveEpi}>
                    {editIdx !== null ? "💾 Salvar Alterações" : "✅ Adicionar EPI"}
                  </button>
                  <button style={s.cancelBtn}
                    onClick={() => { setForm(blankForm); setEditIdx(null); setTab("estoque"); setFormErr({}); }}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}

            {/* ══ ALERTAS ══ */}
            {tab === "alertas" && (
              <div style={s.tabContent}>
                <h2 style={s.alertTitle}>EPIs com Estoque Abaixo do Mínimo</h2>
                <p style={{ ...s.sysSub, marginBottom:16 }}>
                  Cada EPI é avaliado individualmente. EPIs com mesmo nome compartilham o mínimo (não somado).
                </p>
                <div style={{ ...s.exportRow, marginBottom:16 }}>
                  <button style={s.exportBtn} onClick={handleExportExcel}>📊 Exportar Excel</button>
                  <button style={s.exportBtn} onClick={handleExportPDF}>🧾 Exportar PDF</button>
                </div>
                {alertaEpis.length === 0
                  ? <div style={s.noAlerts}>🎉 Todos os estoques estão dentro do limite mínimo!</div>
                  : (
                    <div style={s.alertGrid}>
                      {alertaEpis.map(epi => {
                        const minComp = minimoCompartilhado(epi.nome, epis);
                        return (
                          <div key={epiKey(epi.nome, epi.ca)} style={s.alertCard}>
                            <div style={s.alertCardTop}>
                              <span style={{ fontSize:28 }}>⚠️</span>
                              <div style={{ flex:1 }}>
                                <div style={s.alertNome}>{epi.nome}</div>
                                <div style={s.alertCa}>CA: {epi.ca || "—"}</div>
                              </div>
                            </div>
                            <div style={s.alertStats}>
                              {[
                                { label:"Local",  val: epi.local === "Segurança do Trabalho" ? "Seg. Trabalho" : "Almoxarifado", color:null },
                                { label:"Atual",  val: epi.quantidade,                         color:C.accent   },
                                { label:"Mínimo", val: minComp,                                color:null       },
                                { label:"Faltam", val: Math.max(0, minComp - epi.quantidade),  color:"#dd6b20"  },
                              ].map(({ label, val, color }) => (
                                <div key={label} style={s.alertStat}>
                                  <span style={s.alertStatLabel}>{label}</span>
                                  <span style={{ ...s.alertStatVal, ...(color ? { color, fontWeight:700 } : {}) }}>{val}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
              </div>
            )}
          </main>
        </div>
      )}

      {/* Modal exclusão */}
      {deleteConfirm !== null && (
        <div style={s.overlay} onClick={() => setDeleteConfirm(null)}>
          <div style={s.modal} onClick={e => e.stopPropagation()}>
            <h3 style={s.modalTitle}>Confirmar Exclusão</h3>
            <p style={s.modalText}>
              Deseja realmente excluir <strong>{epis[deleteConfirm]?.nome}</strong> (CA: {epis[deleteConfirm]?.ca})?
              <br />Esta ação não pode ser desfeita. <em>(Esc para cancelar)</em>
            </p>
            <div style={s.modalActions}>
              <button style={s.deleteBtn} onClick={() => handleDelete(deleteConfirm)}>Sim, excluir</button>
              <button style={s.cancelBtn} onClick={() => setDeleteConfirm(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}

      <ToastContainer toasts={toasts} s={s} />
    </div>
  );
}
