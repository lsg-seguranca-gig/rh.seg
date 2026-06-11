import { useState, useEffect, useCallback, useRef } from "react";
import * as XLSX from "xlsx";

const ADMIN_PASSWORD = "SegurancaLSG2026";
const PROXY = "/api/gas";

// ─────────────────────────────────────────────────────────────────
//  Comunicação com planilha
//  Nova estrutura (sem ID): [Nome do EPI, CA, Local, Quantidade, Mínimo]
// ─────────────────────────────────────────────────────────────────
async function sheetRead() {
  const r = await fetch(PROXY, { method: "GET" });
  if (!r.ok) throw new Error(`Proxy respondeu ${r.status}`);
  const data = await r.json();
  if (data.status === "error") throw new Error(data.message);
  return data.values || [];
}
async function sheetWrite(values) {
  const r = await fetch(PROXY, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
  if (!r.ok) throw new Error(`Proxy respondeu ${r.status}`);
  const data = await r.json();
  if (data.status === "error") throw new Error(data.message);
}

// Chave única por EPI: nome+CA (normalizado)
function epiKey(nome, ca) {
  return `${String(nome).trim().toLowerCase()}||${String(ca).trim()}`;
}

// Converte linhas da planilha → array de EPIs
// Colunas: A=Nome do EPI, B=CA, C=Local, D=Quantidade, E=Mínimo
function rowsToEpis(rows) {
  return rows.slice(1).filter(r => r[0]).map(r => ({
    nome:       String(r[0]||"").trim(),
    ca:         String(r[1]||"").trim(),
    local:      String(r[2]||"Almoxarifado").trim(),
    quantidade: parseInt(r[3], 10) || 0,
    minimo:     parseInt(r[4], 10) || 0,
  }));
}

function episToRows(epis) {
  return [
    ["Nome do EPI", "CA", "Local", "Quantidade", "Mínimo"],
    ...epis.map(e => [e.nome, e.ca, e.local, e.quantidade, e.minimo])
  ];
}

// ─────────────────────────────────────────────────────────────────
//  Regra de alerta:
//  - Cada linha é avaliada individualmente (sem somar quantidades)
//  - EPIs com mesmo nome compartilham o mínimo: usa o MAIOR entre eles
//  - Uma linha está em alerta se sua quantidade < mínimo compartilhado
//
//  Exemplo:
//  Óculos CA-6874: qtd=2, min=3 → mínimo compartilhado=3 → 2<3 → ALERTA
//  Óculos CA-6136: qtd=4, min=3 → mínimo compartilhado=3 → 4≥3 → OK
// ─────────────────────────────────────────────────────────────────
function minimoCompartilhado(nome, epis) {
  // Retorna o maior mínimo entre todas as linhas com o mesmo nome
  return epis
    .filter(e => e.nome.trim().toLowerCase() === nome.trim().toLowerCase())
    .reduce((max, e) => Math.max(max, e.minimo), 0);
}

function isEmAlerta(epi, epis) {
  const minimo = minimoCompartilhado(epi.nome, epis);
  return epi.quantidade <= minimo;
}

// ─────────────────────────────────────────────────────────────────
//  Filtros
// ─────────────────────────────────────────────────────────────────
function applyFilters(list, { text, local, status }, epis) {
  return list.filter(e => {
    const t = text.toLowerCase();
    const matchText   = !t || e.nome.toLowerCase().includes(t) || e.ca.toLowerCase().includes(t);
    const matchLocal  = !local || e.local === local;
    const emAlerta    = isEmAlerta(e, epis);
    const matchStatus = !status || (status === "baixo" && emAlerta) || (status === "ok" && !emAlerta);
    return matchText && matchLocal && matchStatus;
  });
}
const BLANK_FILTER = { text: "", local: "", status: "" };

// ─────────────────────────────────────────────────────────────────
//  App
// ─────────────────────────────────────────────────────────────────
export default function App() {
  const [authed, setAuthed]               = useState(false);
  const [pwInput, setPwInput]             = useState("");
  const [pwError, setPwError]             = useState(false);
  const [epis, setEpis]                   = useState([]);
  const [loading, setLoading]             = useState(false);
  const [saveMsg, setSaveMsg]             = useState("");
  const [saveMsgType, setSaveMsgType]     = useState("ok");
  const [tab, setTab]                     = useState("estoque");
  const [dark, setDark]                   = useState(() => localStorage.getItem("epi-dark") === "1");
  const [editIdx, setEditIdx]             = useState(null); // índice no array (sem ID)
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [estFil, setEstFil]               = useState(BLANK_FILTER);
  const [invFil, setInvFil]               = useState(BLANK_FILTER);
  const [invDraft, setInvDraft]           = useState({});   // chave: epiKey(nome,ca)
  const [invDirty, setInvDirty]           = useState(false);
  const [uploadPreview, setUploadPreview] = useState(null);
  const [uploadError, setUploadError]     = useState("");
  const fileInputRef                      = useRef(null);

  const blankForm = { nome: "", ca: "", local: "Almoxarifado", quantidade: 0, minimo: 0 };
  const [form, setForm]       = useState(blankForm);
  const [formErr, setFormErr] = useState({});

  useEffect(() => { localStorage.setItem("epi-dark", dark ? "1" : "0"); }, [dark]);
  const C = dark ? DARK : LIGHT;
  const s = makeStyles(C);

  const notify = (msg, type = "ok") => {
    setSaveMsg(msg); setSaveMsgType(type);
    setTimeout(() => setSaveMsg(""), 5000);
  };

  // ── Carregar ────────────────────────────────
  const loadSheet = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await sheetRead();
      const loaded = rows.length <= 1 ? DEMO_EPIS : rowsToEpis(rows);
      setEpis(loaded);
      const draft = {};
      loaded.forEach(e => { draft[epiKey(e.nome, e.ca)] = e.quantidade; });
      setInvDraft(draft); setInvDirty(false);
      if (rows.length <= 1) notify("ℹ️ Planilha vazia — exibindo dados de demonstração.", "info");
      else notify("✅ Dados carregados da planilha.");
    } catch (err) {
      setEpis(DEMO_EPIS);
      const draft = {};
      DEMO_EPIS.forEach(e => { draft[epiKey(e.nome, e.ca)] = e.quantidade; });
      setInvDraft(draft);
      notify("⚠️ Não foi possível conectar: " + err.message, "error");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) loadSheet(); }, [authed, loadSheet]);

  const saveSheet = async (newEpis) => {
    setLoading(true);
    try { await sheetWrite(episToRows(newEpis)); notify("✅ Planilha atualizada com sucesso!"); }
    catch (e) { notify("⚠️ Erro ao salvar: " + e.message, "error"); }
    finally { setLoading(false); }
  };

  // ── Login ────────────────────────────────────
  const handleLogin = (e) => {
    e.preventDefault();
    if (pwInput === ADMIN_PASSWORD) { setAuthed(true); setPwError(false); }
    else { setPwError(true); setPwInput(""); }
  };

  // ── CRUD ─────────────────────────────────────
  const validateForm = () => {
    const err = {};
    if (!form.nome.trim()) err.nome = "Nome obrigatório";
    if (!form.ca.trim())   err.ca   = "CA obrigatório";
    if (form.quantidade < 0) err.quantidade = "Quantidade inválida";
    if (form.minimo < 0)     err.minimo     = "Mínimo inválido";
    // Verifica duplicata nome+CA (exceto ao editar o próprio)
    const dup = epis.find((e, i) =>
      epiKey(e.nome, e.ca) === epiKey(form.nome, form.ca) && i !== editIdx
    );
    if (dup) err.ca = "Já existe um EPI com este nome e CA";
    setFormErr(err);
    return Object.keys(err).length === 0;
  };

  const handleSaveEpi = () => {
    if (!validateForm()) return;
    let newEpis;
    if (editIdx !== null) {
      newEpis = epis.map((e, i) => i === editIdx ? { ...form } : e);
    } else {
      newEpis = [...epis, { ...form }];
    }
    setEpis(newEpis); saveSheet(newEpis);
    const draft = {}; newEpis.forEach(e => { draft[epiKey(e.nome, e.ca)] = e.quantidade; });
    setInvDraft(draft); setInvDirty(false);
    setForm(blankForm); setEditIdx(null); setTab("estoque");
  };

  const handleEdit = (epi, idx) => { setForm({ ...epi }); setEditIdx(idx); setTab("adicionar"); };

  const handleDelete = (idx) => {
    const newEpis = epis.filter((_, i) => i !== idx);
    setEpis(newEpis); saveSheet(newEpis);
    const draft = {}; newEpis.forEach(e => { draft[epiKey(e.nome, e.ca)] = e.quantidade; });
    setInvDraft(draft);
    setDeleteConfirm(null);
  };

  // ── Inventário ───────────────────────────────
  const handleInvChange = (nome, ca, val) => {
    setInvDraft(d => ({ ...d, [epiKey(nome, ca)]: Math.max(0, parseInt(val, 10) || 0) }));
    setInvDirty(true);
  };
  const handleInvSave = () => {
    const newEpis = epis.map(e => ({ ...e, quantidade: invDraft[epiKey(e.nome, e.ca)] ?? e.quantidade }));
    setEpis(newEpis); saveSheet(newEpis);
    setInvDirty(false); setUploadPreview(null); setUploadError("");
  };
  const handleInvCancel = () => {
    const draft = {}; epis.forEach(e => { draft[epiKey(e.nome, e.ca)] = e.quantidade; });
    setInvDraft(draft); setInvDirty(false);
    setUploadPreview(null); setUploadError("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  // ── Upload de planilha ───────────────────────
  // Fluxo: lê arquivo → carrega no invDraft → usuário revisa na tabela → clica Salvar Inventário
  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadError(""); setUploadPreview(null);
    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const wb   = XLSX.read(evt.target.result, { type: "array" });
        const ws   = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: "" });
        if (rows.length < 2) { setUploadError("A planilha está vazia."); return; }

        const header = rows[0].map(h => String(h).toLowerCase().trim());
        // Aceita planilha com ou sem coluna ID na frente
        const hasId  = header[0] === "id";
        const offset = hasId ? 1 : 0;
        if (!header[offset] || !header[offset].includes("nome")) {
          setUploadError("Cabeçalho inválido. Coluna A deve ser 'Nome do EPI'.");
          return;
        }

        const imported = rows.slice(1).filter(r => r[offset]).map(r => ({
          nome:       String(r[offset]     || "").trim(),
          ca:         String(r[offset + 1] || "").trim(),
          local:      String(r[offset + 2] || "Almoxarifado").trim(),
          quantidade: parseInt(r[offset + 3], 10) || 0,
          minimo:     parseInt(r[offset + 4], 10) || 0,
        }));
        if (imported.length === 0) { setUploadError("Nenhum dado válido encontrado."); return; }

        // Substitui lista de EPIs e carrega quantidades no rascunho do inventário
        setEpis(imported);
        const draft = {};
        imported.forEach(e => { draft[epiKey(e.nome, e.ca)] = e.quantidade; });
        setInvDraft(draft);
        setInvDirty(true);   // ← habilita o botão Salvar Inventário
        setUploadPreview(imported);
        if (fileInputRef.current) fileInputRef.current.value = "";
        notify(`✅ ${imported.length} EPIs carregados — revise e clique em Salvar Inventário.`, "info");
      } catch (err) { setUploadError("Erro ao ler o arquivo: " + err.message); }
    };
    reader.readAsArrayBuffer(file);
  };

  const handleUploadConfirm = async () => {
    if (!uploadPreview) return;
    await saveSheet(uploadPreview);
    setUploadPreview(null); setUploadError("");
    setInvDirty(false);
    notify("✅ Inventário importado e gravado com sucesso!");
  };

  // ── Listas filtradas ─────────────────────────
  const estFiltered = applyFilters(epis, estFil, epis);
  const invFiltered = applyFilters(epis, invFil, epis);

  // Alertas: cada EPI individualmente, usando mínimo compartilhado por nome
  const alertaEpis = epis.filter(e => isEmAlerta(e, epis));

  // ─────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────
  return (
    <div style={s.root}>
      <header style={s.header}>
        <div style={s.headerInner}><LogoImg style={s.logo} /></div>
        <button style={s.darkBtn} onClick={() => setDark(d => !d)} title={dark ? "Modo claro" : "Modo escuro"}>
          {dark ? "☀️" : "🌙"}
        </button>
      </header>

      {!authed
        ? <LoginScreen pwInput={pwInput} setPwInput={setPwInput} pwError={pwError} handleLogin={handleLogin} C={C} s={s} />
        : (
          <div style={s.pageWrap}>
            <div style={s.titleStrip}>
              <div>
                <h1 style={s.sysTitle}>Controle de EPIs</h1>
                <p style={s.sysSub}>Gestão de Equipamentos de Proteção Individual</p>
              </div>
              <div style={s.rightActions}>
                {alertaEpis.length > 0 && (
                  <button style={s.alertBadge} onClick={() => setTab("alertas")}>
                    ⚠️ {alertaEpis.length} alerta{alertaEpis.length > 1 ? "s" : ""}
                  </button>
                )}
                <button style={s.logoutBtn} onClick={() => setAuthed(false)}>Sair</button>
              </div>
            </div>

            {saveMsg && (
              <div style={{ ...s.saveMsg, ...(saveMsgType === "error" ? s.saveMsgErr : saveMsgType === "info" ? s.saveMsgInfo : {}) }}>
                {saveMsg}
              </div>
            )}

            {/* ABAS */}
            <nav style={s.tabs}>
              {[
                { key: "estoque",    label: "📦 Estoque"    },
                { key: "inventario", label: "📋 Inventário"  },
                { key: "adicionar",  label: editIdx !== null ? "✏️ Editar EPI" : "➕ Novo EPI" },
              ].map(t => (
                <button key={t.key}
                  style={{ ...s.tab, ...(tab === t.key ? s.tabActive : {}) }}
                  onClick={() => { setTab(t.key); if (t.key !== "adicionar") { setForm(blankForm); setEditIdx(null); setFormErr({}); } }}>
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

              {/* ══ ESTOQUE ══ */}
              {tab === "estoque" && (
                <div>
                  <FilterBar fil={estFil} setFil={setEstFil} s={s} C={C} onReload={loadSheet} showReload />
                  <div style={s.desktopOnly}>
                    <TableEstoque epis={estFiltered} allEpis={epis} s={s} C={C}
                      onEdit={handleEdit} onDelete={setDeleteConfirm} />
                  </div>
                  <div style={s.mobileOnly}>
                    {estFiltered.map((epi, i) => (
                      <CardEpi key={epiKey(epi.nome, epi.ca)} epi={epi} idx={i} allEpis={epis}
                        s={s} C={C} onEdit={handleEdit} onDelete={setDeleteConfirm} />
                    ))}
                    {estFiltered.length === 0 && <p style={s.emptyMobile}>Nenhum EPI encontrado.</p>}
                  </div>
                  <p style={s.countNote}>{estFiltered.length} de {epis.length} linhas exibidas</p>
                </div>
              )}

              {/* ══ INVENTÁRIO ══ */}
              {tab === "inventario" && (
                <div>
                  <div style={s.invHeader}>
                    <div>
                      <h2 style={s.invTitle}>📋 Inventário de Estoque</h2>
                      <p style={s.invSubtitle}>Edite manualmente ou importe uma planilha (.xlsx / .csv).</p>
                    </div>
                    <div style={s.invActions}>
                      <button style={{ ...s.saveBtn, opacity: invDirty ? 1 : 0.45, cursor: invDirty ? "pointer" : "default" }}
                        onClick={invDirty ? handleInvSave : undefined}>
                        💾 Salvar Inventário
                      </button>
                      <button style={s.cancelBtn} onClick={handleInvCancel}>↺ Descartar</button>
                    </div>
                  </div>

                  {/* Painel de upload */}
                  <div style={s.uploadPanel}>
                    <div style={s.uploadLeft}>
                      <span style={s.uploadIcon}>📂</span>
                      <div>
                        <div style={s.uploadLabel}>Importar planilha de inventário</div>
                        <div style={s.uploadHint}>
                          Arquivo .xlsx ou .csv — colunas: <strong>Nome do EPI | CA | Local | Quantidade | Mínimo</strong>
                        </div>
                      </div>
                    </div>
                    <label style={s.uploadBtn}>
                      📁 Escolher arquivo
                      <input ref={fileInputRef} type="file" accept=".xlsx,.xls,.csv"
                        style={{ display: "none" }} onChange={handleFileUpload} />
                    </label>
                  </div>

                  {uploadError && (
                    <div style={{ ...s.saveMsg, ...s.saveMsgErr, marginBottom: 14 }}>❌ {uploadError}</div>
                  )}

                  {/* Banner de confirmação após upload */}
                  {uploadPreview && (
                    <div style={s.previewBox}>
                      <div style={s.previewHeader}>
                        <div>
                          <strong style={{ color: C.primary }}>📊 Planilha carregada</strong>
                          <span style={s.previewCount}> — {uploadPreview.length} EPIs prontos para salvar</span>
                        </div>
                      </div>
                      <div style={s.previewWarn}>
                        ⚠️ Os dados foram carregados na tabela abaixo. Revise e clique em <strong>💾 Salvar Inventário</strong> para gravar no Google Sheets.
                      </div>
                    </div>
                  )}

                  {invDirty && (
                    <div style={s.invDirtyBanner}>
                      ✏️ Há alterações não salvas — clique em <strong>Salvar Inventário</strong> para confirmar.
                    </div>
                  )}

                  <>
                      <FilterBar fil={invFil} setFil={setInvFil} s={s} C={C} />
                      <div style={s.desktopOnly}>
                        <TableInventario epis={invFiltered} allEpis={epis} invDraft={invDraft}
                          s={s} C={C} onChange={handleInvChange} />
                      </div>
                      <div style={s.mobileOnly}>
                        {invFiltered.map(epi => (
                          <CardInventario key={epiKey(epi.nome, epi.ca)} epi={epi} allEpis={epis}
                            novaQtd={invDraft[epiKey(epi.nome, epi.ca)] ?? epi.quantidade}
                            s={s} C={C} onChange={handleInvChange} />
                        ))}
                        {invFiltered.length === 0 && <p style={s.emptyMobile}>Nenhum EPI encontrado.</p>}
                      </div>
                      <p style={s.countNote}>{invFiltered.length} de {epis.length} linhas exibidas</p>
                  </>
                </div>
              )}

              {/* ══ NOVO / EDITAR EPI ══ */}
              {tab === "adicionar" && (
                <div style={s.formCard}>
                  <h2 style={s.formTitle}>{editIdx !== null ? `Editando: ${form.nome}` : "Novo EPI"}</h2>
                  <div style={s.formGrid}>
                    <Field label="Nome do EPI *" error={formErr.nome} s={s}>
                      <input style={s.input} value={form.nome}
                        onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Luva Nitrílica" />
                    </Field>
                    <Field label="Certificado de Aprovação (CA) *" error={formErr.ca} s={s}>
                      <input style={s.input} value={form.ca}
                        onChange={e => setForm(f => ({ ...f, ca: e.target.value }))} placeholder="Ex: 12345" />
                    </Field>
                    <Field label="Local de Armazenamento" s={s}>
                      <select style={s.input} value={form.local}
                        onChange={e => setForm(f => ({ ...f, local: e.target.value }))}>
                        <option>Almoxarifado</option>
                        <option>Segurança do Trabalho</option>
                      </select>
                    </Field>
                    <Field label="Quantidade em Estoque" error={formErr.quantidade} s={s}>
                      <input style={s.input} type="number" min="0" value={form.quantidade}
                        onChange={e => setForm(f => ({ ...f, quantidade: parseInt(e.target.value) || 0 }))} />
                    </Field>
                    <Field label="Estoque Mínimo" error={formErr.minimo} s={s}>
                      <input style={s.input} type="number" min="0" value={form.minimo}
                        onChange={e => setForm(f => ({ ...f, minimo: parseInt(e.target.value) || 0 }))} />
                    </Field>
                  </div>
                  <div style={s.formActions}>
                    <button style={s.saveBtn} onClick={handleSaveEpi}>
                      {editIdx !== null ? "💾 Salvar Alterações" : "✅ Adicionar EPI"}
                    </button>
                    <button style={s.cancelBtn} onClick={() => { setForm(blankForm); setEditIdx(null); setTab("estoque"); setFormErr({}); }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* ══ ALERTAS ══ */}
              {tab === "alertas" && (
                <div>
                  <h2 style={s.alertTitle}>EPIs com Estoque Abaixo do Mínimo</h2>
                  <p style={{ ...s.sysSub, marginBottom: 16 }}>
                    Cada EPI é avaliado individualmente. EPIs com mesmo nome compartilham o mesmo mínimo (não somado).
                  </p>
                  {alertaEpis.length === 0
                    ? <div style={s.noAlerts}>🎉 Todos os estoques estão dentro do limite mínimo!</div>
                    : (
                      <div style={s.alertGrid}>
                        {alertaEpis.map(epi => {
                          const minComp = minimoCompartilhado(epi.nome, epis);
                          return (
                          <div key={epiKey(epi.nome, epi.ca)} style={s.alertCard}>
                            <div style={s.alertCardTop}>
                              <span style={{ fontSize: 28 }}>⚠️</span>
                              <div style={{ flex: 1 }}>
                                <div style={s.alertNome}>{epi.nome}</div>
                                <div style={s.alertCa}>CA: {epi.ca || "—"}</div>
                              </div>
                            </div>
                            <div style={s.alertStats}>
                              {[
                                { label: "Local",   val: epi.local === "Segurança do Trabalho" ? "Seg. Trabalho" : "Almoxarifado", color: null },
                                { label: "Atual",   val: epi.quantidade,                        color: C.accent },
                                { label: "Mínimo",  val: minComp,                               color: null },
                                { label: "Faltam",  val: Math.max(0, minComp - epi.quantidade), color: "#dd6b20" },
                              ].map(({ label, val, color }) => (
                                <div key={label} style={s.alertStat}>
                                  <span style={s.alertStatLabel}>{label}</span>
                                  <span style={{ ...s.alertStatVal, ...(color ? { color, fontWeight: 700 } : {}) }}>{val}</span>
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

      {deleteConfirm !== null && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <h3 style={s.modalTitle}>Confirmar Exclusão</h3>
            <p style={s.modalText}>
              Deseja realmente excluir o EPI <strong>{epis[deleteConfirm]?.nome}</strong> (CA: {epis[deleteConfirm]?.ca})?
              <br />Esta ação não pode ser desfeita.
            </p>
            <div style={s.modalActions}>
              <button style={s.deleteBtn} onClick={() => handleDelete(deleteConfirm)}>Sim, excluir</button>
              <button style={s.cancelBtn} onClick={() => setDeleteConfirm(null)}>Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Barra de filtros ─────────────────────────────────────────────
function FilterBar({ fil, setFil, s, C, onReload, showReload }) {
  return (
    <div style={s.filterBar}>
      <input style={{ ...s.searchBox, flex: 2, minWidth: 120 }}
        placeholder="🔍 Buscar por nome ou CA…"
        value={fil.text} onChange={e => setFil(f => ({ ...f, text: e.target.value }))} />
      <select style={s.filterSelect} value={fil.local}
        onChange={e => setFil(f => ({ ...f, local: e.target.value }))}>
        <option value="">Todos os locais</option>
        <option>Almoxarifado</option>
        <option>Segurança do Trabalho</option>
      </select>
      <select style={s.filterSelect} value={fil.status}
        onChange={e => setFil(f => ({ ...f, status: e.target.value }))}>
        <option value="">Todos os status</option>
        <option value="ok">✓ OK</option>
        <option value="baixo">⚠ Baixo</option>
      </select>
      {(fil.text || fil.local || fil.status) && (
        <button style={s.clearBtn} onClick={() => setFil({ text: "", local: "", status: "" })}>✕ Limpar</button>
      )}
      {showReload && (
        <button style={s.reloadBtn} onClick={onReload}>↻ Recarregar</button>
      )}
    </div>
  );
}

// ─── Tabela Estoque ───────────────────────────────────────────────
function TableEstoque({ epis, allEpis, s, C, onEdit, onDelete }) {
  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <thead>
          <tr>{["Nome do EPI", "CA", "Local", "Quantidade", "Mínimo", "Status", "Ações"].map(h => (
            <th key={h} style={s.th}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {epis.length === 0 && <tr><td colSpan={7} style={s.emptyCell}>Nenhum EPI encontrado.</td></tr>}
          {epis.map((epi, i) => {
            const emAlerta = isEmAlerta(epi, allEpis);
            // Índice real no array completo
            const realIdx = allEpis.findIndex((e, j) => epiKey(e.nome, e.ca) === epiKey(epi.nome, epi.ca));
            return (
              <tr key={epiKey(epi.nome, epi.ca)} style={{ ...s.tr, ...(emAlerta ? s.trAlert : {}) }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{epi.nome}</td>
                <td style={s.td}><span style={s.caBadge}>{epi.ca}</span></td>
                <td style={s.td}>
                  <span style={{ ...s.localBadge, ...(epi.local === "Segurança do Trabalho" ? s.localST : s.localAlmox) }}>
                    {epi.local}
                  </span>
                </td>
                <td style={{ ...s.td, textAlign: "center", fontWeight: 700, fontSize: 15, color: emAlerta ? C.accent : C.textMain }}>
                  {epi.quantidade}
                </td>
                <td style={{ ...s.td, textAlign: "center" }}>{epi.minimo}</td>
                <td style={s.td}>
                  {emAlerta ? <span style={s.statusLow}>⚠ Baixo</span> : <span style={s.statusOk}>✓ OK</span>}
                </td>
                <td style={s.td}>
                  <div style={s.actionRow}>
                    <button style={s.editBtn}   onClick={() => onEdit(epi, realIdx)}>Editar</button>
                    <button style={s.deleteBtn} onClick={() => onDelete(realIdx)}>Excluir</button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Card Estoque (mobile) ────────────────────────────────────────
function CardEpi({ epi, idx, allEpis, s, C, onEdit, onDelete }) {
  const emAlerta = isEmAlerta(epi, allEpis);
  const realIdx  = allEpis.findIndex(e => epiKey(e.nome, e.ca) === epiKey(epi.nome, epi.ca));
  return (
    <div style={{ ...s.mobileCard, ...(emAlerta ? { borderColor: C.alertBorder, background: C.alertBg } : {}) }}>
      <div style={s.mobileCardHeader}>
        <span style={s.caBadge}>{epi.ca}</span>
        {emAlerta ? <span style={s.statusLow}>⚠ Baixo</span> : <span style={s.statusOk}>✓ OK</span>}
      </div>
      <div style={s.mobileCardName}>{epi.nome}</div>
      <div style={s.mobileCardRow}>
        <span style={s.mobileLabel}>Local</span>
        <span style={{ ...s.localBadge, ...(epi.local === "Segurança do Trabalho" ? s.localST : s.localAlmox) }}>{epi.local}</span>
      </div>
      <div style={s.mobileCardRow}>
        <span style={s.mobileLabel}>Quantidade</span>
        <span style={{ fontWeight: 700, fontSize: 16, color: emAlerta ? C.accent : C.textMain }}>{epi.quantidade}</span>
      </div>
      <div style={s.mobileCardRow}><span style={s.mobileLabel}>Mínimo</span><span style={{ fontWeight: 600 }}>{epi.minimo}</span></div>
      <div style={{ ...s.actionRow, marginTop: 12 }}>
        <button style={{ ...s.editBtn, flex: 1, textAlign: "center" }}   onClick={() => onEdit(epi, realIdx)}>✏️ Editar</button>
        <button style={{ ...s.deleteBtn, flex: 1, textAlign: "center" }} onClick={() => onDelete(realIdx)}>🗑 Excluir</button>
      </div>
    </div>
  );
}

// ─── Tabela Inventário (desktop) ──────────────────────────────────
function TableInventario({ epis, allEpis, invDraft, s, C, onChange }) {
  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <thead>
          <tr>{["Nome do EPI", "CA", "Local", "Qtd. Atual", "Nova Qtd.", "Diferença", "Status"].map(h => (
            <th key={h} style={s.th}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {epis.length === 0 && <tr><td colSpan={7} style={s.emptyCell}>Nenhum EPI encontrado.</td></tr>}
          {epis.map(epi => {
            const k       = epiKey(epi.nome, epi.ca);
            const novaQtd = invDraft[k] ?? epi.quantidade;
            const diff    = novaQtd - epi.quantidade;
            const emAlerta = isEmAlerta(epi, allEpis);
            return (
              <tr key={k} style={{ ...s.tr, ...(emAlerta ? s.trAlert : {}) }}>
                <td style={{ ...s.td, fontWeight: 600 }}>{epi.nome}</td>
                <td style={s.td}><span style={s.caBadge}>{epi.ca}</span></td>
                <td style={s.td}>
                  <span style={{ ...s.localBadge, ...(epi.local === "Segurança do Trabalho" ? s.localST : s.localAlmox) }}>
                    {epi.local}
                  </span>
                </td>
                <td style={{ ...s.td, textAlign: "center", color: C.textSub }}>{epi.quantidade}</td>
                <td style={s.td}>
                  <div style={s.qtyRow}>
                    <button style={s.qtyBtn} onClick={() => onChange(epi.nome, epi.ca, novaQtd - 1)}>−</button>
                    <input style={s.qtyInput} type="number" min="0" value={novaQtd}
                      onChange={e => onChange(epi.nome, epi.ca, e.target.value)} />
                    <button style={s.qtyBtn} onClick={() => onChange(epi.nome, epi.ca, novaQtd + 1)}>+</button>
                  </div>
                </td>
                <td style={{ ...s.td, textAlign: "center", fontWeight: 700, color: diff > 0 ? C.ok : diff < 0 ? C.accent : C.textSub }}>
                  {diff > 0 ? `+${diff}` : diff === 0 ? "—" : diff}
                </td>
                <td style={s.td}>
                  {emAlerta ? <span style={s.statusLow}>⚠ Baixo</span> : <span style={s.statusOk}>✓ OK</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Card Inventário (mobile) ─────────────────────────────────────
function CardInventario({ epi, allEpis, novaQtd, s, C, onChange }) {
  const diff     = novaQtd - epi.quantidade;
  const emAlerta = isEmAlerta(epi, allEpis);
  return (
    <div style={{ ...s.mobileCard, ...(emAlerta ? { borderColor: C.alertBorder, background: C.alertBg } : {}) }}>
      <div style={s.mobileCardHeader}>
        <span style={s.caBadge}>{epi.ca}</span>
        {emAlerta ? <span style={s.statusLow}>⚠ Baixo</span> : <span style={s.statusOk}>✓ OK</span>}
      </div>
      <div style={s.mobileCardName}>{epi.nome}</div>
      <div style={s.mobileCardRow}>
        <span style={s.mobileLabel}>Local</span>
        <span style={{ ...s.localBadge, ...(epi.local === "Segurança do Trabalho" ? s.localST : s.localAlmox) }}>{epi.local}</span>
      </div>
      <div style={s.mobileCardRow}><span style={s.mobileLabel}>Qtd. Atual</span><span style={{ color: C.textSub, fontWeight: 600 }}>{epi.quantidade}</span></div>
      <div style={s.mobileCardRow}>
        <span style={s.mobileLabel}>Nova Qtd.</span>
        <div style={s.qtyRow}>
          <button style={s.qtyBtn} onClick={() => onChange(epi.nome, epi.ca, novaQtd - 1)}>−</button>
          <input style={s.qtyInput} type="number" min="0" value={novaQtd} onChange={e => onChange(epi.nome, epi.ca, e.target.value)} />
          <button style={s.qtyBtn} onClick={() => onChange(epi.nome, epi.ca, novaQtd + 1)}>+</button>
        </div>
      </div>
      <div style={s.mobileCardRow}>
        <span style={s.mobileLabel}>Diferença</span>
        <span style={{ fontWeight: 700, color: diff > 0 ? C.ok : diff < 0 ? C.accent : C.textSub }}>
          {diff > 0 ? `+${diff}` : diff === 0 ? "—" : diff}
        </span>
      </div>
    </div>
  );
}

function LogoImg({ style }) {
  const names = ["/logo_lsg.png", "/logo-lsg.png", "/logo%20lsg.png"];
  const [idx, setIdx] = useState(0);
  return <img src={names[idx]} alt="LSG Sky Chefs" style={style}
    onError={() => setIdx(i => Math.min(i + 1, names.length - 1))} />;
}

function LoginScreen({ pwInput, setPwInput, pwError, handleLogin, C, s }) {
  const [showPw, setShowPw] = useState(false);
  return (
    <div style={s.loginWrap}>
      <div style={s.loginCard}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🦺</div>
        <h2 style={s.loginTitle}>Acesso Restrito</h2>
        <p style={s.loginSub}>Setor de Segurança do Trabalho</p>
        <form onSubmit={handleLogin} style={s.loginForm}>
          <div style={s.pwWrap}>
            <input style={{ ...s.input, ...s.pwInput, ...(pwError ? { borderColor: C.accent } : {}) }}
              type={showPw ? "text" : "password"} placeholder="Senha de administrador"
              value={pwInput} onChange={e => setPwInput(e.target.value)} autoFocus />
            <button type="button" style={s.pwToggle} onClick={() => setShowPw(v => !v)}>
              {showPw ? "🙈" : "👁️"}
            </button>
          </div>
          {pwError && <p style={s.errorMsg}>Senha incorreta. Tente novamente.</p>}
          <button style={s.loginBtn} type="submit">Entrar</button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children, s }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      {children}
      {error && <span style={s.fieldError}>{error}</span>}
    </div>
  );
}

const DEMO_EPIS = [
  { nome: "Capacete de Segurança",       ca: "12345", local: "Almoxarifado",          quantidade: 12, minimo: 10 },
  { nome: "Óculos de Ampla Visão",        ca: "6874",  local: "Almoxarifado",          quantidade: 2,  minimo: 3  },
  { nome: "Óculos de Ampla Visão",        ca: "6136",  local: "Segurança do Trabalho", quantidade: 1,  minimo: 3  },
  { nome: "Protetor Auricular",           ca: "45678", local: "Segurança do Trabalho", quantidade: 4,  minimo: 10 },
  { nome: "Luva de Raspa",                ca: "23456", local: "Almoxarifado",          quantidade: 3,  minimo: 8  },
  { nome: "Bota de Segurança",            ca: "56789", local: "Almoxarifado",          quantidade: 6,  minimo: 5  },
];

const LIGHT = {
  bg:"#f0f4f8",surface:"#ffffff",border:"#dde3ec",primary:"#003087",accent:"#e8000d",
  textMain:"#1a2233",textSub:"#5a6a82",ok:"#276749",okBg:"#f0fff4",
  alertBg:"#fff5f5",alertBorder:"#fc8181",header:"#ffffff",headerBorder:"#e8000d",
  inputBg:"#ffffff",modalBg:"#ffffff",tabBorder:"#dde3ec",
};
const DARK = {
  bg:"#0f1117",surface:"#1a1d27",border:"#2d3148",primary:"#4d7cff",accent:"#ff4d4d",
  textMain:"#e8eaf0",textSub:"#8892a4",ok:"#48bb78",okBg:"#1a2e22",
  alertBg:"#2d1515",alertBorder:"#c53030",header:"#13151f",headerBorder:"#ff4d4d",
  inputBg:"#22263a",modalBg:"#1a1d27",tabBorder:"#2d3148",
};

function makeStyles(C) {
  return {
    root:         { minHeight:"100vh",background:C.bg,fontFamily:"'Segoe UI','Helvetica Neue',Arial,sans-serif",color:C.textMain,transition:"background 0.2s,color 0.2s" },
    header:       { background:C.header,borderBottom:`4px solid ${C.headerBorder}`,minHeight:88,display:"flex",alignItems:"center",position:"relative",padding:"12px 0" },
    headerInner:  { flex:1,display:"flex",alignItems:"center",justifyContent:"center" },
    logo:         { height:60,maxWidth:260,objectFit:"contain" },
    darkBtn:      { position:"absolute",right:12,top:"50%",transform:"translateY(-50%)",background:"transparent",border:`1.5px solid ${C.border}`,borderRadius:8,padding:"5px 9px",cursor:"pointer",fontSize:18,color:C.textSub },
    pageWrap:     { maxWidth:1200,margin:"0 auto",padding:"20px 16px 48px" },
    titleStrip:   { display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:20,gap:12,flexWrap:"wrap" },
    sysTitle:     { margin:0,fontSize:"clamp(18px,4vw,26px)",fontWeight:800,color:C.primary,letterSpacing:"-0.5px" },
    sysSub:       { margin:"2px 0 0",fontSize:13,color:C.textSub },
    rightActions: { display:"flex",alignItems:"center",gap:8,flexShrink:0 },
    alertBadge:   { background:C.accent,color:"#fff",border:"none",borderRadius:20,padding:"7px 14px",fontWeight:700,cursor:"pointer",fontSize:13,whiteSpace:"nowrap" },
    logoutBtn:    { background:"transparent",border:`1.5px solid ${C.border}`,color:C.textSub,borderRadius:8,padding:"7px 14px",cursor:"pointer",fontSize:13 },
    saveMsg:      { background:C.okBg,border:`1px solid ${C.ok}`,color:C.ok,borderRadius:8,padding:"10px 16px",marginBottom:16,fontWeight:600,fontSize:14 },
    saveMsgErr:   { background:C.alertBg,border:`1px solid ${C.accent}`,color:C.accent },
    saveMsgInfo:  { background:C.okBg,border:`1px solid ${C.primary}`,color:C.primary },
    tabs:         { display:"flex",gap:2,borderBottom:`2px solid ${C.tabBorder}`,marginBottom:20,flexWrap:"wrap" },
    tab:          { background:"none",border:"none",padding:"10px 16px",cursor:"pointer",fontWeight:600,fontSize:"clamp(12px,3vw,14px)",color:C.textSub,borderBottom:"2px solid transparent",marginBottom:-2,transition:"all 0.15s",whiteSpace:"nowrap" },
    tabActive:    { color:C.primary,borderBottomColor:C.primary },
    loadingBar:   { display:"flex",alignItems:"center",gap:10,padding:"12px 0",marginBottom:10 },
    spinner:      { width:18,height:18,border:`3px solid ${C.border}`,borderTopColor:C.primary,borderRadius:"50%",display:"inline-block",animation:"spin 0.8s linear infinite" },
    loadingText:  { fontSize:13,color:C.textSub,fontStyle:"italic" },
    filterBar:    { display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center" },
    searchBox:    { flex:2,minWidth:140,padding:"9px 13px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:14,outline:"none",background:C.inputBg,color:C.textMain },
    filterSelect: { flex:1,minWidth:120,padding:"9px 10px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:13,outline:"none",background:C.inputBg,color:C.textMain,cursor:"pointer" },
    clearBtn:     { background:C.alertBg,color:C.accent,border:"none",borderRadius:8,padding:"9px 13px",cursor:"pointer",fontWeight:600,fontSize:13,whiteSpace:"nowrap" },
    reloadBtn:    { background:C.primary,color:"#fff",border:"none",borderRadius:8,padding:"9px 14px",cursor:"pointer",fontWeight:600,fontSize:13,whiteSpace:"nowrap" },
    desktopOnly:  { display:"block" },
    mobileOnly:   { display:"none" },
    tableWrap:    { overflowX:"auto",borderRadius:12,border:`1px solid ${C.border}`,background:C.surface,boxShadow:"0 2px 8px rgba(0,0,0,0.07)" },
    table:        { width:"100%",borderCollapse:"collapse",minWidth:600 },
    th:           { background:C.primary,color:"#fff",padding:"11px 13px",textAlign:"left",fontSize:11,fontWeight:700,letterSpacing:0.5,textTransform:"uppercase",whiteSpace:"nowrap" },
    tr:           { borderBottom:`1px solid ${C.border}` },
    trAlert:      { background:C.alertBg },
    td:           { padding:"10px 13px",fontSize:13,verticalAlign:"middle",color:C.textMain },
    emptyCell:    { padding:32,textAlign:"center",color:C.textSub },
    countNote:    { marginTop:8,fontSize:12,color:C.textSub },
    caBadge:      { background:C.okBg,color:C.primary,borderRadius:6,padding:"2px 8px",fontSize:11,fontWeight:600 },
    localBadge:   { borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:600 },
    localAlmox:   { background:C.okBg,color:C.ok },
    localST:      { background:C.okBg,color:C.primary },
    statusOk:     { background:C.okBg,color:C.ok,borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700 },
    statusLow:    { background:C.alertBg,color:C.accent,borderRadius:6,padding:"3px 8px",fontSize:11,fontWeight:700 },
    actionRow:    { display:"flex",gap:6 },
    editBtn:      { background:C.okBg,color:C.primary,border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontWeight:600,fontSize:12 },
    deleteBtn:    { background:C.alertBg,color:C.accent,border:"none",borderRadius:6,padding:"5px 10px",cursor:"pointer",fontWeight:600,fontSize:12 },
    qtyRow:       { display:"flex",alignItems:"center",gap:5 },
    qtyBtn:       { width:28,height:28,border:`1.5px solid ${C.border}`,borderRadius:6,background:C.inputBg,cursor:"pointer",fontWeight:700,fontSize:16,lineHeight:1,color:C.textMain },
    qtyInput:     { width:60,padding:"5px 6px",border:`1.5px solid ${C.border}`,borderRadius:6,fontSize:14,textAlign:"center",background:C.inputBg,color:C.textMain,outline:"none" },
    mobileCard:   { background:C.surface,border:`1.5px solid ${C.border}`,borderRadius:12,padding:"16px 14px",marginBottom:12,boxShadow:"0 1px 4px rgba(0,0,0,0.06)" },
    mobileCardHeader: { display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8 },
    mobileCardName:   { fontWeight:700,fontSize:15,color:C.textMain,marginBottom:10 },
    mobileCardRow:    { display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7 },
    mobileLabel:      { fontSize:12,color:C.textSub,fontWeight:600 },
    emptyMobile:      { textAlign:"center",color:C.textSub,padding:"24px 0" },
    uploadPanel:  { display:"flex",alignItems:"center",justifyContent:"space-between",gap:16,background:C.surface,border:`1.5px solid ${C.primary}`,borderRadius:12,padding:"16px 20px",marginBottom:14,flexWrap:"wrap" },
    uploadLeft:   { display:"flex",alignItems:"center",gap:14 },
    uploadIcon:   { fontSize:28 },
    uploadLabel:  { fontWeight:700,fontSize:14,color:C.textMain,marginBottom:3 },
    uploadHint:   { fontSize:12,color:C.textSub },
    uploadBtn:    { background:C.primary,color:"#fff",border:"none",borderRadius:8,padding:"10px 18px",cursor:"pointer",fontWeight:700,fontSize:13,whiteSpace:"nowrap",flexShrink:0,display:"inline-block" },
    previewBox:   { background:C.surface,border:`2px solid ${C.primary}`,borderRadius:12,padding:"18px 16px",marginBottom:14 },
    previewHeader:{ display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10,gap:10,flexWrap:"wrap" },
    previewCount: { fontSize:13,color:C.textSub },
    previewWarn:  { background:"#fffbeb",border:"1px solid #f6e05e",color:"#744210",borderRadius:8,padding:"9px 13px",marginBottom:12,fontSize:13,fontWeight:600 },
    invHeader:    { display:"flex",alignItems:"flex-start",justifyContent:"space-between",marginBottom:14,gap:12,flexWrap:"wrap" },
    invTitle:     { margin:"0 0 3px",fontSize:"clamp(16px,4vw,20px)",fontWeight:800,color:C.primary },
    invSubtitle:  { margin:0,fontSize:13,color:C.textSub },
    invActions:   { display:"flex",gap:8,alignItems:"center",flexShrink:0,flexWrap:"wrap" },
    invDirtyBanner:{ background:"#fffbeb",border:"1px solid #f6e05e",color:"#744210",borderRadius:8,padding:"10px 14px",marginBottom:12,fontSize:13,fontWeight:600 },
    formCard:     { background:C.surface,borderRadius:12,border:`1px solid ${C.border}`,padding:"24px 20px",boxShadow:"0 2px 8px rgba(0,0,0,0.07)",maxWidth:680 },
    formTitle:    { margin:"0 0 20px",fontSize:18,fontWeight:800,color:C.primary },
    formGrid:     { display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:16 },
    field:        { display:"flex",flexDirection:"column",gap:4 },
    label:        { fontSize:11,fontWeight:700,color:C.textSub,textTransform:"uppercase",letterSpacing:0.5 },
    input:        { padding:"9px 12px",border:`1.5px solid ${C.border}`,borderRadius:8,fontSize:14,outline:"none",background:C.inputBg,color:C.textMain,width:"100%",boxSizing:"border-box" },
    fieldError:   { fontSize:12,color:C.accent },
    formActions:  { display:"flex",gap:10,marginTop:24,flexWrap:"wrap" },
    saveBtn:      { background:C.primary,color:"#fff",border:"none",borderRadius:8,padding:"11px 22px",cursor:"pointer",fontWeight:700,fontSize:14 },
    cancelBtn:    { background:C.border,color:C.textSub,border:"none",borderRadius:8,padding:"11px 16px",cursor:"pointer",fontWeight:600,fontSize:13 },
    alertTitle:   { fontSize:18,fontWeight:800,color:C.accent,marginBottom:8 },
    noAlerts:     { background:C.okBg,color:C.ok,borderRadius:12,padding:"28px 20px",textAlign:"center",fontWeight:600,fontSize:15,border:`1px solid ${C.ok}` },
    alertGrid:    { display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(260px,1fr))",gap:14 },
    alertCard:    { background:C.surface,border:`1.5px solid ${C.alertBorder}`,borderRadius:12,padding:18 },
    alertCardTop: { display:"flex",gap:12,alignItems:"flex-start",marginBottom:12 },
    alertNome:    { fontWeight:700,fontSize:14,marginBottom:2,color:C.textMain },
    alertCa:      { fontSize:12,color:C.textSub },
    alertStats:   { display:"grid",gridTemplateColumns:"1fr 1fr 1fr 1fr",gap:6 },
    alertStat:    { display:"flex",flexDirection:"column",alignItems:"center" },
    alertStatLabel:{ fontSize:10,color:C.textSub,fontWeight:700,textTransform:"uppercase" },
    alertStatVal:  { fontSize:15,fontWeight:700,color:C.textMain },
    loginWrap:    { minHeight:"calc(100vh - 88px)",display:"flex",alignItems:"center",justifyContent:"center",padding:"16px" },
    loginCard:    { background:C.surface,borderRadius:16,border:`1px solid ${C.border}`,padding:"36px 28px",boxShadow:"0 8px 32px rgba(0,0,0,0.13)",width:"100%",maxWidth:380,textAlign:"center" },
    loginTitle:   { margin:"0 0 6px",fontSize:22,fontWeight:800,color:C.primary },
    loginSub:     { margin:"0 0 24px",fontSize:14,color:C.textSub },
    loginForm:    { display:"flex",flexDirection:"column",gap:12 },
    loginBtn:     { background:C.primary,color:"#fff",border:"none",borderRadius:8,padding:"13px",cursor:"pointer",fontWeight:700,fontSize:15,marginTop:4 },
    errorMsg:     { color:C.accent,fontSize:13,margin:0,fontWeight:600 },
    pwWrap:       { position:"relative",display:"flex",alignItems:"center" },
    pwInput:      { paddingRight:44 },
    pwToggle:     { position:"absolute",right:8,background:"transparent",border:"none",cursor:"pointer",fontSize:18,padding:"4px",color:C.textSub,lineHeight:1 },
    overlay:      { position:"fixed",inset:0,background:"rgba(0,0,0,0.5)",display:"flex",alignItems:"center",justifyContent:"center",zIndex:1000,padding:16 },
    modal:        { background:C.modalBg,borderRadius:14,padding:"28px 24px",width:"100%",maxWidth:400,boxShadow:"0 16px 48px rgba(0,0,0,0.28)",border:`1px solid ${C.border}` },
    modalTitle:   { margin:"0 0 10px",fontSize:17,fontWeight:800,color:C.accent },
    modalText:    { margin:"0 0 20px",fontSize:14,lineHeight:1.6,color:C.textMain },
    modalActions: { display:"flex",gap:10 },
  };
}
