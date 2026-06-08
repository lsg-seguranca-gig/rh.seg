import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────
//  CONFIGURAÇÃO
// ─────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = "SegurancaLSG2026";
const PROXY = "/api/gas";

// ─────────────────────────────────────────────────────────────────
//  Helpers de comunicação com a planilha (via proxy)
// ─────────────────────────────────────────────────────────────────
async function sheetRead() {
  const r = await fetch(PROXY, { method: "GET" });
  if (!r.ok) throw new Error(`Proxy respondeu ${r.status}`);
  const data = await r.json();
  if (data.status === "error") throw new Error(data.message);
  return data.values || [];
}

async function sheetWrite(values) {
  const r = await fetch(PROXY, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values }),
  });
  if (!r.ok) throw new Error(`Proxy respondeu ${r.status}`);
  const data = await r.json();
  if (data.status === "error") throw new Error(data.message);
}

function rowsToEpis(rows) {
  return rows.slice(1).map((r) => ({
    id:         r[0] || "",
    nome:       r[1] || "",
    ca:         r[2] || "",
    local:      r[3] || "Almoxarifado",
    quantidade: parseInt(r[4], 10) || 0,
    minimo:     parseInt(r[5], 10) || 5,
  }));
}

function episToRows(epis) {
  const header = ["ID", "Nome do EPI", "CA", "Local", "Quantidade", "Mínimo"];
  return [header, ...epis.map((e) => [e.id, e.nome, e.ca, e.local, e.quantidade, e.minimo])];
}

// ─────────────────────────────────────────────────────────────────
//  App principal
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
  const [search, setSearch]               = useState("");
  const [editId, setEditId]               = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [dark, setDark]                   = useState(() => localStorage.getItem("epi-dark") === "1");

  const blankForm = { id: "", nome: "", ca: "", local: "Almoxarifado", quantidade: 0, minimo: 5 };
  const [form, setForm]       = useState(blankForm);
  const [formErr, setFormErr] = useState({});

  // Persiste preferência dark
  useEffect(() => { localStorage.setItem("epi-dark", dark ? "1" : "0"); }, [dark]);

  // Paleta dinâmica
  const C = dark ? DARK : LIGHT;

  const notify = (msg, type = "ok") => {
    setSaveMsg(msg); setSaveMsgType(type);
    setTimeout(() => setSaveMsg(""), 4000);
  };

  const loadSheet = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await sheetRead();
      if (rows.length <= 1) { setEpis(DEMO_EPIS); notify("ℹ️ Planilha vazia — exibindo dados de demonstração.", "info"); }
      else { setEpis(rowsToEpis(rows)); notify("✅ Dados carregados da planilha."); }
    } catch (e) {
      setEpis(DEMO_EPIS);
      notify("⚠️ Não foi possível conectar à planilha: " + e.message, "error");
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { if (authed) loadSheet(); }, [authed, loadSheet]);

  const saveSheet = async (newEpis) => {
    setLoading(true);
    try { await sheetWrite(episToRows(newEpis)); notify("✅ Planilha atualizada com sucesso!"); }
    catch (e) { notify("⚠️ Erro ao salvar: " + e.message, "error"); }
    finally { setLoading(false); }
  };

  const handleLogin = (e) => {
    e.preventDefault();
    if (pwInput === ADMIN_PASSWORD) { setAuthed(true); setPwError(false); }
    else { setPwError(true); setPwInput(""); }
  };

  const validateForm = () => {
    const err = {};
    if (!form.nome.trim())   err.nome       = "Nome obrigatório";
    if (!form.ca.trim())     err.ca         = "CA obrigatório";
    if (form.quantidade < 0) err.quantidade = "Quantidade inválida";
    if (form.minimo < 0)     err.minimo     = "Mínimo inválido";
    if (!editId && epis.find(e => e.id === form.id && form.id)) err.id = "ID já existe";
    setFormErr(err);
    return Object.keys(err).length === 0;
  };

  const handleSaveEpi = () => {
    if (!validateForm()) return;
    let newEpis;
    if (editId) { newEpis = epis.map(e => e.id === editId ? { ...form, id: editId } : e); }
    else { newEpis = [...epis, { ...form, id: form.id || String(Date.now()).slice(-6) }]; }
    setEpis(newEpis); saveSheet(newEpis);
    setForm(blankForm); setEditId(null); setTab("estoque");
  };

  const handleEdit = (epi) => { setForm({ ...epi }); setEditId(epi.id); setTab("adicionar"); };

  const handleDelete = (id) => {
    const newEpis = epis.filter(e => e.id !== id);
    setEpis(newEpis); saveSheet(newEpis); setDeleteConfirm(null);
  };

  const handleQtyChange = (id, delta) => {
    const newEpis = epis.map(e => e.id === id ? { ...e, quantidade: Math.max(0, e.quantidade + delta) } : e);
    setEpis(newEpis); saveSheet(newEpis);
  };

  const filtered = epis.filter(e =>
    e.nome.toLowerCase().includes(search.toLowerCase()) ||
    e.ca.toLowerCase().includes(search.toLowerCase()) ||
    e.local.toLowerCase().includes(search.toLowerCase())
  );
  const alertas = epis.filter(e => e.quantidade <= e.minimo);

  const s = makeStyles(C);

  // ─────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────
  return (
    <div style={s.root}>
      {/* CABEÇALHO */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <img
            src="/logo_lsg.png"
            alt="LSG Sky Chefs"
            style={s.logo}
            onError={e => { e.target.style.display = "none"; }}
          />
        </div>
        {/* Botão dark mode no canto direito do header */}
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
                {alertas.length > 0 && (
                  <button style={s.alertBadge} onClick={() => setTab("alertas")}>
                    ⚠️ {alertas.length} alerta{alertas.length > 1 ? "s" : ""}
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

            <nav style={s.tabs}>
              {[
                { key: "estoque",   label: "📦 Estoque" },
                { key: "adicionar", label: editId ? "✏️ Editar EPI" : "➕ Novo EPI" },
                { key: "alertas",   label: `🔔 Alertas${alertas.length ? ` (${alertas.length})` : ""}` },
              ].map(t => (
                <button key={t.key}
                  style={{ ...s.tab, ...(tab === t.key ? s.tabActive : {}) }}
                  onClick={() => { setTab(t.key); if (t.key !== "adicionar") { setForm(blankForm); setEditId(null); setFormErr({}); } }}>
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

              {/* ABA: ESTOQUE */}
              {tab === "estoque" && (
                <div>
                  <div style={s.toolbarRow}>
                    <input style={s.searchBox} placeholder="🔍  Buscar por nome, CA ou local…"
                      value={search} onChange={e => setSearch(e.target.value)} />
                    <button style={s.reloadBtn} onClick={loadSheet}>↻ Recarregar</button>
                  </div>
                  <div style={s.tableWrap}>
                    <table style={s.table}>
                      <thead>
                        <tr>{["ID","Nome do EPI","CA","Local","Quantidade","Mínimo","Status","Ações"].map(h => (
                          <th key={h} style={s.th}>{h}</th>
                        ))}</tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 && <tr><td colSpan={8} style={s.emptyCell}>Nenhum EPI encontrado.</td></tr>}
                        {filtered.map(epi => {
                          const baixo = epi.quantidade <= epi.minimo;
                          return (
                            <tr key={epi.id} style={{ ...s.tr, ...(baixo ? s.trAlert : {}) }}>
                              <td style={s.td}><span style={s.idBadge}>{epi.id}</span></td>
                              <td style={{ ...s.td, fontWeight: 600 }}>{epi.nome}</td>
                              <td style={s.td}><span style={s.caBadge}>{epi.ca}</span></td>
                              <td style={s.td}>
                                <span style={{ ...s.localBadge, ...(epi.local === "Segurança do Trabalho" ? s.localST : s.localAlmox) }}>
                                  {epi.local}
                                </span>
                              </td>
                              <td style={s.td}>
                                <div style={s.qtyRow}>
                                  <button style={s.qtyBtn} onClick={() => handleQtyChange(epi.id, -1)}>−</button>
                                  <span style={{ ...s.qtyNum, ...(baixo ? { color: C.accent } : {}) }}>{epi.quantidade}</span>
                                  <button style={s.qtyBtn} onClick={() => handleQtyChange(epi.id, +1)}>+</button>
                                </div>
                              </td>
                              <td style={{ ...s.td, textAlign: "center" }}>{epi.minimo}</td>
                              <td style={s.td}>
                                {baixo ? <span style={s.statusLow}>⚠ Baixo</span> : <span style={s.statusOk}>✓ OK</span>}
                              </td>
                              <td style={s.td}>
                                <div style={s.actionRow}>
                                  <button style={s.editBtn}   onClick={() => handleEdit(epi)}>Editar</button>
                                  <button style={s.deleteBtn} onClick={() => setDeleteConfirm(epi.id)}>Excluir</button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <p style={s.countNote}>{filtered.length} de {epis.length} EPIs exibidos</p>
                </div>
              )}

              {/* ABA: ADICIONAR / EDITAR */}
              {tab === "adicionar" && (
                <div style={s.formCard}>
                  <h2 style={s.formTitle}>{editId ? `Editando: ${form.nome}` : "Novo EPI"}</h2>
                  <div style={s.formGrid}>
                    <Field label="ID (deixe em branco para gerar automaticamente)" error={formErr.id} s={s}>
                      <input style={s.input} value={form.id} disabled={!!editId}
                        onChange={e => setForm(f => ({ ...f, id: e.target.value }))} placeholder="Ex: EPI-009" />
                    </Field>
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
                      {editId ? "💾 Salvar Alterações" : "✅ Adicionar EPI"}
                    </button>
                    <button style={s.cancelBtn} onClick={() => { setForm(blankForm); setEditId(null); setTab("estoque"); setFormErr({}); }}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}

              {/* ABA: ALERTAS */}
              {tab === "alertas" && (
                <div>
                  <h2 style={s.alertTitle}>EPIs com Estoque Abaixo do Mínimo</h2>
                  {alertas.length === 0
                    ? <div style={s.noAlerts}>🎉  Todos os estoques estão dentro do limite mínimo!</div>
                    : (
                      <div style={s.alertGrid}>
                        {alertas.map(epi => (
                          <div key={epi.id} style={s.alertCard}>
                            <div style={s.alertCardTop}>
                              <span style={{ fontSize: 28 }}>⚠️</span>
                              <div>
                                <div style={s.alertNome}>{epi.nome}</div>
                                <div style={s.alertCa}>{epi.ca}</div>
                              </div>
                            </div>
                            <div style={s.alertStats}>
                              {[
                                { label: "Local",  val: epi.local,                               color: null },
                                { label: "Atual",  val: epi.quantidade,                          color: C.accent },
                                { label: "Mínimo", val: epi.minimo,                              color: null },
                                { label: "Faltam", val: Math.max(0, epi.minimo-epi.quantidade),  color: "#dd6b20" },
                              ].map(({ label, val, color }) => (
                                <div key={label} style={s.alertStat}>
                                  <span style={s.alertStatLabel}>{label}</span>
                                  <span style={{ ...s.alertStatVal, ...(color ? { color, fontWeight: 700 } : {}) }}>{val}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                </div>
              )}
            </main>
          </div>
        )}

      {/* MODAL EXCLUSÃO */}
      {deleteConfirm && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <h3 style={s.modalTitle}>Confirmar Exclusão</h3>
            <p style={s.modalText}>
              Deseja realmente excluir o EPI <strong>{epis.find(e => e.id === deleteConfirm)?.nome}</strong>?
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

// ─────────────────────────────────────────────────────────────────
//  Login Screen — com botão mostrar/ocultar senha
// ─────────────────────────────────────────────────────────────────
function LoginScreen({ pwInput, setPwInput, pwError, handleLogin, C, s }) {
  const [showPw, setShowPw] = useState(false);
  return (
    <div style={s.loginWrap}>
      <div style={s.loginCard}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>🦺</div>
        <h2 style={s.loginTitle}>Acesso Restrito</h2>
        <p style={s.loginSub}>Setor de Segurança do Trabalho</p>
        <form onSubmit={handleLogin} style={s.loginForm}>
          {/* Campo senha com botão ver/ocultar */}
          <div style={s.pwWrap}>
            <input
              style={{ ...s.input, ...s.pwInput, ...(pwError ? { borderColor: C.accent } : {}) }}
              type={showPw ? "text" : "password"}
              placeholder="Senha de administrador"
              value={pwInput}
              onChange={e => setPwInput(e.target.value)}
              autoFocus
            />
            <button
              type="button"
              style={s.pwToggle}
              onClick={() => setShowPw(v => !v)}
              title={showPw ? "Ocultar senha" : "Mostrar senha"}
            >
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

// ─────────────────────────────────────────────────────────────────
//  Dados de demonstração
// ─────────────────────────────────────────────────────────────────
const DEMO_EPIS = [
  { id: "001", nome: "Capacete de Segurança",  ca: "12345", local: "Almoxarifado",          quantidade: 12, minimo: 10 },
  { id: "002", nome: "Luva de Raspa",           ca: "23456", local: "Segurança do Trabalho", quantidade: 3,  minimo: 8  },
  { id: "003", nome: "Óculos de Proteção",      ca: "34567", local: "Almoxarifado",          quantidade: 25, minimo: 15 },
  { id: "004", nome: "Protetor Auricular",      ca: "45678", local: "Segurança do Trabalho", quantidade: 4,  minimo: 10 },
  { id: "005", nome: "Bota de Segurança",       ca: "56789", local: "Almoxarifado",          quantidade: 6,  minimo: 5  },
  { id: "006", nome: "Colete Refletivo",        ca: "67890", local: "Almoxarifado",          quantidade: 2,  minimo: 6  },
  { id: "007", nome: "Máscara PFF2",            ca: "78901", local: "Segurança do Trabalho", quantidade: 50, minimo: 30 },
  { id: "008", nome: "Cinto de Segurança",      ca: "89012", local: "Almoxarifado",          quantidade: 7,  minimo: 4  },
];

// ─────────────────────────────────────────────────────────────────
//  Paletas de cores
// ─────────────────────────────────────────────────────────────────
const LIGHT = {
  bg:          "#f0f4f8",
  surface:     "#ffffff",
  border:      "#dde3ec",
  primary:     "#003087",
  accent:      "#e8000d",
  textMain:    "#1a2233",
  textSub:     "#5a6a82",
  ok:          "#276749",
  okBg:        "#f0fff4",
  alertBg:     "#fff5f5",
  alertBorder: "#fc8181",
  header:      "#ffffff",
  headerBorder:"#e8000d",
  inputBg:     "#ffffff",
  modalBg:     "#ffffff",
  tabBorder:   "#dde3ec",
};

const DARK = {
  bg:          "#0f1117",
  surface:     "#1a1d27",
  border:      "#2d3148",
  primary:     "#4d7cff",
  accent:      "#ff4d4d",
  textMain:    "#e8eaf0",
  textSub:     "#8892a4",
  ok:          "#48bb78",
  okBg:        "#1a2e22",
  alertBg:     "#2d1515",
  alertBorder: "#c53030",
  header:      "#13151f",
  headerBorder:"#ff4d4d",
  inputBg:     "#22263a",
  modalBg:     "#1a1d27",
  tabBorder:   "#2d3148",
};

// ─────────────────────────────────────────────────────────────────
//  Estilos dinâmicos (reconstruídos com a paleta ativa)
// ─────────────────────────────────────────────────────────────────
function makeStyles(C) {
  return {
    root:        { minHeight: "100vh", background: C.bg, fontFamily: "'Segoe UI','Helvetica Neue',Arial,sans-serif", color: C.textMain, transition: "background 0.2s, color 0.2s" },
    // Header
    header:      { background: C.header, borderBottom: `3px solid ${C.headerBorder}`, height: 72, display: "flex", alignItems: "center", position: "relative" },
    headerInner: { flex: 1, display: "flex", alignItems: "center", justifyContent: "center" },
    logo:        { maxHeight: 52, maxWidth: 260, objectFit: "contain" },
    darkBtn:     { position: "absolute", right: 20, top: "50%", transform: "translateY(-50%)", background: "transparent", border: `1.5px solid ${C.border}`, borderRadius: 8, padding: "5px 10px", cursor: "pointer", fontSize: 18, color: C.textSub },
    // Página
    pageWrap:    { maxWidth: 1200, margin: "0 auto", padding: "24px 24px 48px" },
    titleStrip:  { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
    sysTitle:    { margin: 0, fontSize: 26, fontWeight: 800, color: C.primary, letterSpacing: "-0.5px" },
    sysSub:      { margin: "2px 0 0", fontSize: 14, color: C.textSub },
    rightActions:{ display: "flex", alignItems: "center", gap: 10 },
    alertBadge:  { background: C.accent, color: "#fff", border: "none", borderRadius: 20, padding: "6px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 },
    logoutBtn:   { background: "transparent", border: `1.5px solid ${C.border}`, color: C.textSub, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 },
    // Notificações
    saveMsg:     { background: C.okBg, border: `1px solid ${C.ok}`, color: C.ok, borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontWeight: 600 },
    saveMsgErr:  { background: C.alertBg, border: `1px solid ${C.accent}`, color: C.accent },
    saveMsgInfo: { background: C.okBg, border: `1px solid ${C.primary}`, color: C.primary },
    // Abas
    tabs:        { display: "flex", gap: 4, borderBottom: `2px solid ${C.tabBorder}`, marginBottom: 24 },
    tab:         { background: "none", border: "none", padding: "10px 20px", cursor: "pointer", fontWeight: 600, fontSize: 14, color: C.textSub, borderBottom: "2px solid transparent", marginBottom: -2, transition: "all 0.15s" },
    tabActive:   { color: C.primary, borderBottomColor: C.primary },
    // Loading
    loadingBar:  { display: "flex", alignItems: "center", gap: 12, padding: "16px 0", marginBottom: 12 },
    spinner:     { width: 20, height: 20, border: `3px solid ${C.border}`, borderTopColor: C.primary, borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" },
    loadingText: { fontSize: 14, color: C.textSub, fontStyle: "italic" },
    // Toolbar
    toolbarRow:  { display: "flex", gap: 12, marginBottom: 16, alignItems: "center" },
    searchBox:   { flex: 1, padding: "9px 14px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: "none", background: C.inputBg, color: C.textMain },
    reloadBtn:   { background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 },
    // Tabela
    tableWrap:   { overflowX: "auto", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, boxShadow: "0 2px 8px rgba(0,0,0,0.08)" },
    table:       { width: "100%", borderCollapse: "collapse", minWidth: 780 },
    th:          { background: C.primary, color: "#fff", padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" },
    tr:          { borderBottom: `1px solid ${C.border}` },
    trAlert:     { background: C.alertBg },
    td:          { padding: "11px 14px", fontSize: 14, verticalAlign: "middle", color: C.textMain },
    emptyCell:   { padding: 32, textAlign: "center", color: C.textSub },
    countNote:   { marginTop: 10, fontSize: 12, color: C.textSub },
    // Badges
    idBadge:     { background: C.border, color: C.textSub, borderRadius: 6, padding: "2px 7px", fontSize: 12, fontWeight: 600 },
    caBadge:     { background: C.okBg, color: C.primary, borderRadius: 6, padding: "2px 7px", fontSize: 12, fontWeight: 600 },
    localBadge:  { borderRadius: 6, padding: "3px 9px", fontSize: 12, fontWeight: 600 },
    localAlmox:  { background: C.okBg, color: C.ok },
    localST:     { background: C.okBg, color: C.primary },
    // Qty
    qtyRow:      { display: "flex", alignItems: "center", gap: 6 },
    qtyBtn:      { width: 24, height: 24, border: `1.5px solid ${C.border}`, borderRadius: 6, background: C.inputBg, cursor: "pointer", fontWeight: 700, fontSize: 14, lineHeight: 1, color: C.textMain },
    qtyNum:      { minWidth: 32, textAlign: "center", fontWeight: 700, fontSize: 15, color: C.textMain },
    // Status
    statusOk:    { background: C.okBg,    color: C.ok,    borderRadius: 6, padding: "3px 9px", fontSize: 12, fontWeight: 700 },
    statusLow:   { background: C.alertBg, color: C.accent, borderRadius: 6, padding: "3px 9px", fontSize: 12, fontWeight: 700 },
    // Ações
    actionRow:   { display: "flex", gap: 6 },
    editBtn:     { background: C.okBg, color: C.primary, border: "none", borderRadius: 6, padding: "5px 11px", cursor: "pointer", fontWeight: 600, fontSize: 12 },
    deleteBtn:   { background: C.alertBg, color: C.accent, border: "none", borderRadius: 6, padding: "5px 11px", cursor: "pointer", fontWeight: 600, fontSize: 12 },
    // Formulário
    formCard:    { background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 32, boxShadow: "0 2px 8px rgba(0,0,0,0.08)", maxWidth: 720 },
    formTitle:   { margin: "0 0 24px", fontSize: 20, fontWeight: 800, color: C.primary },
    formGrid:    { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 },
    field:       { display: "flex", flexDirection: "column", gap: 4 },
    label:       { fontSize: 12, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: 0.5 },
    input:       { padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: "none", background: C.inputBg, color: C.textMain, width: "100%", boxSizing: "border-box" },
    fieldError:  { fontSize: 12, color: C.accent },
    formActions: { display: "flex", gap: 12, marginTop: 28 },
    saveBtn:     { background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "11px 24px", cursor: "pointer", fontWeight: 700, fontSize: 15 },
    cancelBtn:   { background: C.border, color: C.textSub, border: "none", borderRadius: 8, padding: "11px 18px", cursor: "pointer", fontWeight: 600, fontSize: 14 },
    // Alertas
    alertTitle:  { fontSize: 20, fontWeight: 800, color: C.accent, marginBottom: 20 },
    noAlerts:    { background: C.okBg, color: C.ok, borderRadius: 12, padding: "32px 24px", textAlign: "center", fontWeight: 600, fontSize: 16, border: `1px solid ${C.ok}` },
    alertGrid:   { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 },
    alertCard:   { background: C.surface, border: `1.5px solid ${C.alertBorder}`, borderRadius: 12, padding: 20, boxShadow: "0 2px 8px rgba(229,62,62,0.07)" },
    alertCardTop:{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 },
    alertNome:   { fontWeight: 700, fontSize: 15, marginBottom: 2, color: C.textMain },
    alertCa:     { fontSize: 13, color: C.textSub },
    alertStats:  { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 },
    alertStat:   { display: "flex", flexDirection: "column", alignItems: "center" },
    alertStatLabel:{ fontSize: 11, color: C.textSub, fontWeight: 700, textTransform: "uppercase" },
    alertStatVal:  { fontSize: 16, fontWeight: 700, color: C.textMain },
    // Login
    loginWrap:   { minHeight: "calc(100vh - 72px)", display: "flex", alignItems: "center", justifyContent: "center" },
    loginCard:   { background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: "40px", boxShadow: "0 8px 32px rgba(0,0,0,0.15)", width: 360, textAlign: "center" },
    loginTitle:  { margin: "0 0 6px", fontSize: 22, fontWeight: 800, color: C.primary },
    loginSub:    { margin: "0 0 28px", fontSize: 14, color: C.textSub },
    loginForm:   { display: "flex", flexDirection: "column", gap: 12 },
    loginBtn:    { background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: 15, marginTop: 4 },
    errorMsg:    { color: C.accent, fontSize: 13, margin: 0, fontWeight: 600 },
    // Campo senha com botão ver
    pwWrap:      { position: "relative", display: "flex", alignItems: "center" },
    pwInput:     { paddingRight: 44 },
    pwToggle:    { position: "absolute", right: 8, background: "transparent", border: "none", cursor: "pointer", fontSize: 18, padding: "4px", color: C.textSub, lineHeight: 1 },
    // Modal
    overlay:     { position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
    modal:       { background: C.modalBg, borderRadius: 14, padding: 32, width: 380, boxShadow: "0 16px 48px rgba(0,0,0,0.3)", border: `1px solid ${C.border}` },
    modalTitle:  { margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: C.accent },
    modalText:   { margin: "0 0 24px", fontSize: 14, lineHeight: 1.6, color: C.textMain },
    modalActions:{ display: "flex", gap: 12 },
  };
}
