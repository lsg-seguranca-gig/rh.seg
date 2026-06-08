import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────────
//  CONFIGURAÇÃO
// ─────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = "SegurancaLSG2026"; // ← Altere a senha aqui

// Todas as chamadas passam pelo proxy Vercel em /api/gas
// Nunca chamamos o GAS diretamente do browser (bloqueado pela rede corporativa)
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

// ─────────────────────────────────────────────────────────────────
//  Conversores de formato
// ─────────────────────────────────────────────────────────────────
// Esquema da linha: [id, nome, ca, local, quantidade, minimo]
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
  const [saveMsgType, setSaveMsgType]     = useState("ok"); // "ok" | "error"
  const [tab, setTab]                     = useState("estoque");
  const [search, setSearch]               = useState("");
  const [editId, setEditId]               = useState(null);
  const [deleteConfirm, setDeleteConfirm] = useState(null);

  const blankForm = { id: "", nome: "", ca: "", local: "Almoxarifado", quantidade: 0, minimo: 5 };
  const [form, setForm]     = useState(blankForm);
  const [formErr, setFormErr] = useState({});

  // ── Notificação temporária ───────────────────
  const notify = (msg, type = "ok") => {
    setSaveMsg(msg);
    setSaveMsgType(type);
    setTimeout(() => setSaveMsg(""), 4000);
  };

  // ── Carregar planilha ────────────────────────
  const loadSheet = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await sheetRead();
      // Se a planilha estiver vazia ou só tiver cabeçalho, carrega demo
      if (rows.length <= 1) {
        setEpis(DEMO_EPIS);
        notify("ℹ️ Planilha vazia — exibindo dados de demonstração.", "info");
      } else {
        setEpis(rowsToEpis(rows));
        notify("✅ Dados carregados da planilha.");
      }
    } catch (e) {
      // Fallback para dados demo se o proxy falhar
      setEpis(DEMO_EPIS);
      notify("⚠️ Não foi possível conectar à planilha: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { if (authed) loadSheet(); }, [authed, loadSheet]);

  // ── Salvar planilha ──────────────────────────
  const saveSheet = async (newEpis) => {
    setLoading(true);
    try {
      await sheetWrite(episToRows(newEpis));
      notify("✅ Planilha atualizada com sucesso!");
    } catch (e) {
      notify("⚠️ Erro ao salvar: " + e.message, "error");
    } finally {
      setLoading(false);
    }
  };

  // ── Autenticação ─────────────────────────────
  const handleLogin = (e) => {
    e.preventDefault();
    if (pwInput === ADMIN_PASSWORD) { setAuthed(true); setPwError(false); }
    else { setPwError(true); setPwInput(""); }
  };

  // ── CRUD ─────────────────────────────────────
  const validateForm = () => {
    const err = {};
    if (!form.nome.trim())    err.nome       = "Nome obrigatório";
    if (!form.ca.trim())      err.ca         = "CA obrigatório";
    if (form.quantidade < 0)  err.quantidade = "Quantidade inválida";
    if (form.minimo < 0)      err.minimo     = "Mínimo inválido";
    if (!editId && epis.find(e => e.id === form.id && form.id)) err.id = "ID já existe";
    setFormErr(err);
    return Object.keys(err).length === 0;
  };

  const handleSaveEpi = () => {
    if (!validateForm()) return;
    let newEpis;
    if (editId) {
      newEpis = epis.map(e => e.id === editId ? { ...form, id: editId } : e);
    } else {
      const newId = form.id || String(Date.now()).slice(-6);
      newEpis = [...epis, { ...form, id: newId }];
    }
    setEpis(newEpis);
    saveSheet(newEpis);
    setForm(blankForm);
    setEditId(null);
    setTab("estoque");
  };

  const handleEdit = (epi) => {
    setForm({ ...epi });
    setEditId(epi.id);
    setTab("adicionar");
  };

  const handleDelete = (id) => {
    const newEpis = epis.filter(e => e.id !== id);
    setEpis(newEpis);
    saveSheet(newEpis);
    setDeleteConfirm(null);
  };

  const handleQtyChange = (id, delta) => {
    const newEpis = epis.map(e =>
      e.id === id ? { ...e, quantidade: Math.max(0, e.quantidade + delta) } : e
    );
    setEpis(newEpis);
    saveSheet(newEpis);
  };

  // ── Listas filtradas ─────────────────────────
  const filtered = epis.filter(e =>
    e.nome.toLowerCase().includes(search.toLowerCase()) ||
    e.ca.toLowerCase().includes(search.toLowerCase()) ||
    e.local.toLowerCase().includes(search.toLowerCase())
  );
  const alertas = epis.filter(e => e.quantidade <= e.minimo);

  // ─────────────────────────────────────────────
  //  RENDER
  // ─────────────────────────────────────────────
  return (
    <div style={s.root}>
      {/* CABEÇALHO */}
      <header style={s.header}>
        <div style={s.headerInner}>
          <img
            src="/logo lsg.png"
            alt="LSG Sky Chefs"
            style={s.logo}
            onError={e => { e.target.style.display = "none"; }}
          />
        </div>
      </header>

      {!authed
        ? <LoginScreen pwInput={pwInput} setPwInput={setPwInput} pwError={pwError} handleLogin={handleLogin} />
        : (
          <div style={s.pageWrap}>
            {/* BARRA DE TÍTULO */}
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

            {/* NOTIFICAÇÃO */}
            {saveMsg && (
              <div style={{ ...s.saveMsg, ...(saveMsgType === "error" ? s.saveMsgErr : saveMsgType === "info" ? s.saveMsgInfo : {}) }}>
                {saveMsg}
              </div>
            )}

            {/* ABAS */}
            <nav style={s.tabs}>
              {[
                { key: "estoque",   label: "📦 Estoque" },
                { key: "adicionar", label: editId ? "✏️ Editar EPI" : "➕ Novo EPI" },
                { key: "alertas",   label: `🔔 Alertas${alertas.length ? ` (${alertas.length})` : ""}` },
              ].map(t => (
                <button
                  key={t.key}
                  style={{ ...s.tab, ...(tab === t.key ? s.tabActive : {}) }}
                  onClick={() => {
                    setTab(t.key);
                    if (t.key !== "adicionar") { setForm(blankForm); setEditId(null); setFormErr({}); }
                  }}
                >
                  {t.label}
                </button>
              ))}
            </nav>

            <main style={s.main}>
              {loading && (
                <div style={s.loadingBar}>
                  <span style={s.spinner} />
                  <span style={s.loadingText}>Comunicando com a planilha…</span>
                </div>
              )}

              {/* ── ABA: ESTOQUE ── */}
              {tab === "estoque" && (
                <div>
                  <div style={s.toolbarRow}>
                    <input
                      style={s.searchBox}
                      placeholder="🔍  Buscar por nome, CA ou local…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                    />
                    <button style={s.reloadBtn} onClick={loadSheet}>↻ Recarregar</button>
                  </div>

                  <div style={s.tableWrap}>
                    <table style={s.table}>
                      <thead>
                        <tr>
                          {["ID","Nome do EPI","CA","Local","Quantidade","Mínimo","Status","Ações"].map(h => (
                            <th key={h} style={s.th}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filtered.length === 0 && (
                          <tr><td colSpan={8} style={s.emptyCell}>Nenhum EPI encontrado.</td></tr>
                        )}
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
                                  <span style={{ ...s.qtyNum, ...(baixo ? s.qtyNumAlert : {}) }}>{epi.quantidade}</span>
                                  <button style={s.qtyBtn} onClick={() => handleQtyChange(epi.id, +1)}>+</button>
                                </div>
                              </td>
                              <td style={{ ...s.td, textAlign: "center" }}>{epi.minimo}</td>
                              <td style={s.td}>
                                {baixo
                                  ? <span style={s.statusLow}>⚠ Baixo</span>
                                  : <span style={s.statusOk}>✓ OK</span>}
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

              {/* ── ABA: ADICIONAR / EDITAR ── */}
              {tab === "adicionar" && (
                <div style={s.formCard}>
                  <h2 style={s.formTitle}>{editId ? `Editando: ${form.nome}` : "Novo EPI"}</h2>
                  <div style={s.formGrid}>
                    <Field label="ID (deixe em branco para gerar automaticamente)" error={formErr.id}>
                      <input style={s.input} value={form.id} disabled={!!editId}
                        onChange={e => setForm(f => ({ ...f, id: e.target.value }))} placeholder="Ex: 009" />
                    </Field>
                    <Field label="Nome do EPI *" error={formErr.nome}>
                      <input style={s.input} value={form.nome}
                        onChange={e => setForm(f => ({ ...f, nome: e.target.value }))} placeholder="Ex: Luva Nitrílica" />
                    </Field>
                    <Field label="Certificado de Aprovação (CA) *" error={formErr.ca}>
                      <input style={s.input} value={form.ca}
                        onChange={e => setForm(f => ({ ...f, ca: e.target.value }))} placeholder="Ex: CA-12345" />
                    </Field>
                    <Field label="Local de Armazenamento">
                      <select style={s.input} value={form.local}
                        onChange={e => setForm(f => ({ ...f, local: e.target.value }))}>
                        <option>Almoxarifado</option>
                        <option>Segurança do Trabalho</option>
                      </select>
                    </Field>
                    <Field label="Quantidade em Estoque" error={formErr.quantidade}>
                      <input style={s.input} type="number" min="0" value={form.quantidade}
                        onChange={e => setForm(f => ({ ...f, quantidade: parseInt(e.target.value) || 0 }))} />
                    </Field>
                    <Field label="Estoque Mínimo" error={formErr.minimo}>
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

              {/* ── ABA: ALERTAS ── */}
              {tab === "alertas" && (
                <div>
                  <h2 style={s.alertTitle}>EPIs com Estoque Abaixo do Mínimo</h2>
                  {alertas.length === 0 ? (
                    <div style={s.noAlerts}>🎉  Todos os estoques estão dentro do limite mínimo!</div>
                  ) : (
                    <div style={s.alertGrid}>
                      {alertas.map(epi => (
                        <div key={epi.id} style={s.alertCard}>
                          <div style={s.alertCardTop}>
                            <span style={s.alertIcon}>⚠️</span>
                            <div>
                              <div style={s.alertNome}>{epi.nome}</div>
                              <div style={s.alertCa}>{epi.ca}</div>
                            </div>
                          </div>
                          <div style={s.alertStats}>
                            {[
                              { label: "Local",  val: epi.local,                                     color: null },
                              { label: "Atual",  val: epi.quantidade,                                color: C.accent },
                              { label: "Mínimo", val: epi.minimo,                                    color: null },
                              { label: "Faltam", val: Math.max(0, epi.minimo - epi.quantidade),      color: "#dd6b20" },
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

      {/* MODAL DE CONFIRMAÇÃO DE EXCLUSÃO */}
      {deleteConfirm && (
        <div style={s.overlay}>
          <div style={s.modal}>
            <h3 style={s.modalTitle}>Confirmar Exclusão</h3>
            <p style={s.modalText}>
              Deseja realmente excluir o EPI{" "}
              <strong>{epis.find(e => e.id === deleteConfirm)?.nome}</strong>?
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
//  Sub-componentes
// ─────────────────────────────────────────────────────────────────
function LoginScreen({ pwInput, setPwInput, pwError, handleLogin }) {
  return (
    <div style={s.loginWrap}>
      <div style={s.loginCard}>
        <div style={s.loginIcon}>🦺</div>
        <h2 style={s.loginTitle}>Acesso Restrito</h2>
        <p style={s.loginSub}>Setor de Segurança do Trabalho</p>
        <form onSubmit={handleLogin} style={s.loginForm}>
          <input
            style={{ ...s.input, ...(pwError ? s.inputError : {}) }}
            type="password"
            placeholder="Senha de administrador"
            value={pwInput}
            onChange={e => setPwInput(e.target.value)}
            autoFocus
          />
          {pwError && <p style={s.errorMsg}>Senha incorreta. Tente novamente.</p>}
          <button style={s.loginBtn} type="submit">Entrar</button>
        </form>
      </div>
    </div>
  );
}

function Field({ label, error, children }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      {children}
      {error && <span style={s.fieldError}>{error}</span>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  Dados de demonstração (usados se a planilha estiver vazia)
// ─────────────────────────────────────────────────────────────────
const DEMO_EPIS = [
  { id: "001", nome: "Capacete de Segurança",  ca: "CA-12345", local: "Almoxarifado",          quantidade: 12, minimo: 10 },
  { id: "002", nome: "Luva de Raspa",           ca: "CA-23456", local: "Segurança do Trabalho", quantidade: 3,  minimo: 8  },
  { id: "003", nome: "Óculos de Proteção",      ca: "CA-34567", local: "Almoxarifado",          quantidade: 25, minimo: 15 },
  { id: "004", nome: "Protetor Auricular",      ca: "CA-45678", local: "Segurança do Trabalho", quantidade: 4,  minimo: 10 },
  { id: "005", nome: "Bota de Segurança",       ca: "CA-56789", local: "Almoxarifado",          quantidade: 6,  minimo: 5  },
  { id: "006", nome: "Colete Refletivo",        ca: "CA-67890", local: "Almoxarifado",          quantidade: 2,  minimo: 6  },
  { id: "007", nome: "Máscara PFF2",            ca: "CA-78901", local: "Segurança do Trabalho", quantidade: 50, minimo: 30 },
  { id: "008", nome: "Cinto de Segurança",      ca: "CA-89012", local: "Almoxarifado",          quantidade: 7,  minimo: 4  },
];

// ─────────────────────────────────────────────────────────────────
//  Estilos
// ─────────────────────────────────────────────────────────────────
const C = {
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
};

const s = {
  root:       { minHeight: "100vh", background: C.bg, fontFamily: "'Segoe UI', 'Helvetica Neue', Arial, sans-serif", color: C.textMain },
  // Cabeçalho
  header:     { background: "#fff", borderBottom: `3px solid ${C.accent}`, height: 72, display: "flex", alignItems: "center" },
  headerInner:{ maxWidth: 1200, width: "100%", margin: "0 auto", padding: "0 32px", display: "flex", alignItems: "center", justifyContent: "center" },
  logo:       { maxHeight: 52, maxWidth: 280, objectFit: "contain" },
  // Página
  pageWrap:   { maxWidth: 1200, margin: "0 auto", padding: "24px 24px 48px" },
  titleStrip: { display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
  sysTitle:   { margin: 0, fontSize: 26, fontWeight: 800, color: C.primary, letterSpacing: "-0.5px" },
  sysSub:     { margin: "2px 0 0", fontSize: 14, color: C.textSub },
  rightActions:{ display: "flex", alignItems: "center", gap: 10 },
  alertBadge: { background: C.accent, color: "#fff", border: "none", borderRadius: 20, padding: "6px 14px", fontWeight: 700, cursor: "pointer", fontSize: 13 },
  logoutBtn:  { background: "transparent", border: `1.5px solid ${C.border}`, color: C.textSub, borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontSize: 13 },
  // Notificações
  saveMsg:    { background: "#ebf8f1", border: "1px solid #9ae6b4", color: "#276749", borderRadius: 8, padding: "10px 16px", marginBottom: 16, fontWeight: 600 },
  saveMsgErr: { background: "#fff5f5", border: "1px solid #fc8181", color: C.accent },
  saveMsgInfo:{ background: "#ebf4ff", border: "1px solid #90cdf4", color: "#2b6cb0" },
  // Abas
  tabs:       { display: "flex", gap: 4, borderBottom: `2px solid ${C.border}`, marginBottom: 24 },
  tab:        { background: "none", border: "none", padding: "10px 20px", cursor: "pointer", fontWeight: 600, fontSize: 14, color: C.textSub, borderBottom: "2px solid transparent", marginBottom: -2, transition: "all 0.15s" },
  tabActive:  { color: C.primary, borderBottomColor: C.primary },
  main:       {},
  // Loading
  loadingBar: { display: "flex", alignItems: "center", gap: 12, padding: "16px 0", marginBottom: 12 },
  spinner:    { width: 20, height: 20, border: `3px solid ${C.border}`, borderTopColor: C.primary, borderRadius: "50%", display: "inline-block", animation: "spin 0.8s linear infinite" },
  loadingText:{ fontSize: 14, color: C.textSub, fontStyle: "italic" },
  // Toolbar
  toolbarRow: { display: "flex", gap: 12, marginBottom: 16, alignItems: "center" },
  searchBox:  { flex: 1, padding: "9px 14px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: "none", background: C.surface },
  reloadBtn:  { background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "9px 16px", cursor: "pointer", fontWeight: 600, fontSize: 13 },
  // Tabela
  tableWrap:  { overflowX: "auto", borderRadius: 12, border: `1px solid ${C.border}`, background: C.surface, boxShadow: "0 2px 8px rgba(0,0,0,0.04)" },
  table:      { width: "100%", borderCollapse: "collapse", minWidth: 780 },
  th:         { background: C.primary, color: "#fff", padding: "12px 14px", textAlign: "left", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase" },
  tr:         { borderBottom: `1px solid ${C.border}` },
  trAlert:    { background: C.alertBg },
  td:         { padding: "11px 14px", fontSize: 14, verticalAlign: "middle" },
  emptyCell:  { padding: 32, textAlign: "center", color: C.textSub },
  countNote:  { marginTop: 10, fontSize: 12, color: C.textSub },
  // Badges
  idBadge:    { background: "#edf2f7", color: C.textSub, borderRadius: 6, padding: "2px 7px", fontSize: 12, fontWeight: 600 },
  caBadge:    { background: "#ebf4ff", color: C.primary, borderRadius: 6, padding: "2px 7px", fontSize: 12, fontWeight: 600 },
  localBadge: { borderRadius: 6, padding: "3px 9px", fontSize: 12, fontWeight: 600 },
  localAlmox: { background: "#ebf8f1", color: C.ok },
  localST:    { background: "#ebf4ff", color: "#2b6cb0" },
  // Controle de quantidade
  qtyRow:     { display: "flex", alignItems: "center", gap: 6 },
  qtyBtn:     { width: 24, height: 24, border: `1.5px solid ${C.border}`, borderRadius: 6, background: "#fff", cursor: "pointer", fontWeight: 700, fontSize: 14, lineHeight: 1, color: C.textMain },
  qtyNum:     { minWidth: 32, textAlign: "center", fontWeight: 700, fontSize: 15 },
  qtyNumAlert:{ color: C.accent },
  // Status
  statusOk:   { background: C.okBg,    color: C.ok,    borderRadius: 6, padding: "3px 9px", fontSize: 12, fontWeight: 700 },
  statusLow:  { background: C.alertBg, color: C.accent, borderRadius: 6, padding: "3px 9px", fontSize: 12, fontWeight: 700 },
  // Botões de ação
  actionRow:  { display: "flex", gap: 6 },
  editBtn:    { background: "#ebf4ff", color: "#2b6cb0", border: "none", borderRadius: 6, padding: "5px 11px", cursor: "pointer", fontWeight: 600, fontSize: 12 },
  deleteBtn:  { background: C.alertBg, color: C.accent,  border: "none", borderRadius: 6, padding: "5px 11px", cursor: "pointer", fontWeight: 600, fontSize: 12 },
  // Formulário
  formCard:   { background: C.surface, borderRadius: 12, border: `1px solid ${C.border}`, padding: 32, boxShadow: "0 2px 8px rgba(0,0,0,0.04)", maxWidth: 720 },
  formTitle:  { margin: "0 0 24px", fontSize: 20, fontWeight: 800, color: C.primary },
  formGrid:   { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18 },
  field:      { display: "flex", flexDirection: "column", gap: 4 },
  label:      { fontSize: 12, fontWeight: 700, color: C.textSub, textTransform: "uppercase", letterSpacing: 0.5 },
  input:      { padding: "9px 12px", border: `1.5px solid ${C.border}`, borderRadius: 8, fontSize: 14, outline: "none", background: "#fff", color: C.textMain, width: "100%", boxSizing: "border-box" },
  inputError: { borderColor: C.accent },
  fieldError: { fontSize: 12, color: C.accent },
  formActions:{ display: "flex", gap: 12, marginTop: 28 },
  saveBtn:    { background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "11px 24px", cursor: "pointer", fontWeight: 700, fontSize: 15 },
  cancelBtn:  { background: "#edf2f7", color: C.textSub, border: "none", borderRadius: 8, padding: "11px 18px", cursor: "pointer", fontWeight: 600, fontSize: 14 },
  // Alertas
  alertTitle: { fontSize: 20, fontWeight: 800, color: C.accent, marginBottom: 20 },
  noAlerts:   { background: C.okBg, color: C.ok, borderRadius: 12, padding: "32px 24px", textAlign: "center", fontWeight: 600, fontSize: 16, border: "1px solid #9ae6b4" },
  alertGrid:  { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: 16 },
  alertCard:  { background: C.surface, border: `1.5px solid ${C.alertBorder}`, borderRadius: 12, padding: 20, boxShadow: "0 2px 8px rgba(229,62,62,0.07)" },
  alertCardTop:{ display: "flex", gap: 14, alignItems: "flex-start", marginBottom: 14 },
  alertIcon:  { fontSize: 28 },
  alertNome:  { fontWeight: 700, fontSize: 15, marginBottom: 2 },
  alertCa:    { fontSize: 13, color: C.textSub },
  alertStats: { display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 8 },
  alertStat:  { display: "flex", flexDirection: "column", alignItems: "center" },
  alertStatLabel:{ fontSize: 11, color: C.textSub, fontWeight: 700, textTransform: "uppercase" },
  alertStatVal:  { fontSize: 16, fontWeight: 700 },
  // Login
  loginWrap:  { minHeight: "calc(100vh - 72px)", display: "flex", alignItems: "center", justifyContent: "center" },
  loginCard:  { background: C.surface, borderRadius: 16, border: `1px solid ${C.border}`, padding: "40px", boxShadow: "0 8px 32px rgba(0,48,135,0.1)", width: 360, textAlign: "center" },
  loginIcon:  { fontSize: 48, marginBottom: 12 },
  loginTitle: { margin: "0 0 6px", fontSize: 22, fontWeight: 800, color: C.primary },
  loginSub:   { margin: "0 0 28px", fontSize: 14, color: C.textSub },
  loginForm:  { display: "flex", flexDirection: "column", gap: 12 },
  loginBtn:   { background: C.primary, color: "#fff", border: "none", borderRadius: 8, padding: "12px", cursor: "pointer", fontWeight: 700, fontSize: 15, marginTop: 4 },
  errorMsg:   { color: C.accent, fontSize: 13, margin: 0, fontWeight: 600 },
  // Modal
  overlay:    { position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 },
  modal:      { background: "#fff", borderRadius: 14, padding: 32, width: 380, boxShadow: "0 16px 48px rgba(0,0,0,0.2)" },
  modalTitle: { margin: "0 0 12px", fontSize: 18, fontWeight: 800, color: C.accent },
  modalText:  { margin: "0 0 24px", fontSize: 14, lineHeight: 1.6, color: C.textMain },
  modalActions:{ display: "flex", gap: 12 },
};
