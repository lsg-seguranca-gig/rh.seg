import { useState } from "react";
import { epiKey, isEmAlerta, minimoCompartilhado, USUARIOS } from "./utils";

// ── Logo com fallback ─────────────────────────
export function LogoImg({ style }) {
  const names = ["/logo_lsg.png","/logo-lsg.png","/logo%20lsg.png"];
  const [idx, setIdx] = useState(0);
  return <img src={names[idx]} alt="LSG Sky Chefs" style={style}
    onError={() => setIdx(i => Math.min(i+1, names.length-1))} />;
}

// ── Splash screen ──────────────────────────────
export function SplashScreen({ s }) {
  return (
    <div style={s.splashWrap}>
      <LogoImg style={s.splashLogo} />
      <div style={s.splashSpinner} />
      <div style={s.splashText}>Carregando Controle de EPIs…</div>
    </div>
  );
}

// ── Toasts ──────────────────────────────────────
export function ToastContainer({ toasts, s }) {
  if (!toasts.length) return null;
  return (
    <div style={s.toastWrap}>
      {toasts.map(t => (
        <div key={t.id} style={{ ...s.toast, ...(t.type==="error" ? s.toastErr : t.type==="info" ? s.toastInfo : {}) }}>
          {t.icon || (t.type==="error" ? "⚠️" : t.type==="info" ? "ℹ️" : "✅")} {t.msg}
        </div>
      ))}
    </div>
  );
}

// ── Login ─────────────────────────────────────
export function LoginScreen({ pwInput, setPwInput, pwError, userSel, setUserSel, handleLogin, C, s }) {
  const [showPw, setShowPw] = useState(false);
  return (
    <div style={s.loginWrap}>
      <div style={s.loginCard}>
        <div style={{ fontSize:48, marginBottom:12 }}>🦺</div>
        <h2 style={s.loginTitle}>Acesso Restrito</h2>
        <p style={s.loginSub}>Setor de Segurança do Trabalho</p>
        <form onSubmit={handleLogin} style={s.loginForm}>
          <select style={s.input} value={userSel} onChange={e => setUserSel(e.target.value)}>
            <option value="">Selecione seu nome…</option>
            {USUARIOS.map(u => <option key={u} value={u}>{u}</option>)}
          </select>
          <div style={s.pwWrap}>
            <input style={{ ...s.input, ...s.pwInput, ...(pwError ? { borderColor:C.accent } : {}) }}
              type={showPw ? "text" : "password"} placeholder="Senha de administrador"
              value={pwInput} onChange={e => setPwInput(e.target.value)} />
            <button type="button" style={s.pwToggle} onClick={() => setShowPw(v => !v)}>
              {showPw ? "🙈" : "👁️"}
            </button>
          </div>
          {pwError && <p style={s.errorMsg}>Verifique o nome selecionado e a senha.</p>}
          <button style={s.loginBtn} type="submit">Entrar</button>
        </form>
      </div>
    </div>
  );
}

// ── Campo de formulário ───────────────────────
export function Field({ label, error, children, s }) {
  return (
    <div style={s.field}>
      <label style={s.label}>{label}</label>
      {children}
      {error && <span style={s.fieldError}>{error}</span>}
    </div>
  );
}

// ── Barra de filtros ──────────────────────────
export function FilterBar({ fil, setFil, s, onReload, showReload }) {
  return (
    <div style={s.filterBar}>
      <input style={{ ...s.searchBox, flex:2, minWidth:120 }}
        placeholder="🔍 Buscar por nome ou CA…"
        value={fil.text} onChange={e => setFil(f => ({ ...f, text:e.target.value }))} />
      <select style={s.filterSelect} value={fil.local}
        onChange={e => setFil(f => ({ ...f, local:e.target.value }))}>
        <option value="">Todos os locais</option>
        <option>Almoxarifado</option>
        <option>Segurança do Trabalho</option>
      </select>
      <select style={s.filterSelect} value={fil.status}
        onChange={e => setFil(f => ({ ...f, status:e.target.value }))}>
        <option value="">Todos os status</option>
        <option value="ok">✓ OK</option>
        <option value="baixo">⚠ Baixo</option>
      </select>
      {(fil.text || fil.local || fil.status) && (
        <button style={s.clearBtn} onClick={() => setFil({ text:"", local:"", status:"" })}>✕ Limpar</button>
      )}
      {showReload && (
        <button style={s.reloadBtn} onClick={onReload}>↻ Recarregar</button>
      )}
    </div>
  );
}

// ── Tabela Estoque (desktop) ──────────────────
export function TableEstoque({ epis, allEpis, s, C, onEdit, onDelete }) {
  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <thead>
          <tr>{["Nome do EPI","CA","Local","Quantidade","Mínimo","Status","Ações"].map(h => (
            <th key={h} style={s.th}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {epis.length === 0 && <tr><td colSpan={7} style={s.emptyCell}>Nenhum EPI encontrado.</td></tr>}
          {epis.map(epi => {
            const emAlerta = isEmAlerta(epi, allEpis);
            const realIdx  = allEpis.findIndex(e => epiKey(e.nome,e.ca) === epiKey(epi.nome,epi.ca));
            return (
              <tr key={epiKey(epi.nome,epi.ca)} style={{ ...s.tr, ...(emAlerta ? s.trAlert : {}) }}>
                <td style={{ ...s.td, fontWeight:600 }}>{epi.nome}</td>
                <td style={s.td}><span style={s.caBadge}>{epi.ca}</span></td>
                <td style={s.td}>
                  <span style={{ ...s.localBadge, ...(epi.local==="Segurança do Trabalho" ? s.localST : s.localAlmox) }}>
                    {epi.local}
                  </span>
                </td>
                <td style={{ ...s.td, textAlign:"center", fontWeight:700, fontSize:15, color:emAlerta?C.accent:C.textMain }}>
                  {epi.quantidade}
                </td>
                <td style={{ ...s.td, textAlign:"center" }}>{epi.minimo}</td>
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

// ── Card Estoque (mobile) ─────────────────────
export function CardEpi({ epi, allEpis, s, C, onEdit, onDelete }) {
  const emAlerta = isEmAlerta(epi, allEpis);
  const realIdx  = allEpis.findIndex(e => epiKey(e.nome,e.ca) === epiKey(epi.nome,epi.ca));
  return (
    <div style={{ ...s.mobileCard, ...(emAlerta ? { borderColor:C.alertBorder, background:C.alertBg } : {}) }}>
      <div style={s.mobileCardHeader}>
        <span style={s.caBadge}>{epi.ca}</span>
        {emAlerta ? <span style={s.statusLow}>⚠ Baixo</span> : <span style={s.statusOk}>✓ OK</span>}
      </div>
      <div style={s.mobileCardName}>{epi.nome}</div>
      <div style={s.mobileCardRow}>
        <span style={s.mobileLabel}>Local</span>
        <span style={{ ...s.localBadge, ...(epi.local==="Segurança do Trabalho" ? s.localST : s.localAlmox) }}>{epi.local}</span>
      </div>
      <div style={s.mobileCardRow}>
        <span style={s.mobileLabel}>Quantidade</span>
        <span style={{ fontWeight:700, fontSize:16, color:emAlerta?C.accent:C.textMain }}>{epi.quantidade}</span>
      </div>
      <div style={s.mobileCardRow}>
        <span style={s.mobileLabel}>Mínimo</span>
        <span style={{ fontWeight:600 }}>{epi.minimo}</span>
      </div>
      <div style={{ ...s.actionRow, marginTop:12 }}>
        <button style={{ ...s.editBtn, flex:1, textAlign:"center" }}   onClick={() => onEdit(epi, realIdx)}>✏️ Editar</button>
        <button style={{ ...s.deleteBtn, flex:1, textAlign:"center" }} onClick={() => onDelete(realIdx)}>🗑 Excluir</button>
      </div>
    </div>
  );
}

// ── Tabela Inventário (desktop) ───────────────
export function TableInventario({ epis, allEpis, invDraft, s, C, onChange }) {
  return (
    <div style={s.tableWrap}>
      <table style={s.table}>
        <thead>
          <tr>{["Nome do EPI","CA","Local","Qtd. Atual","Nova Qtd.","Diferença","Status"].map(h => (
            <th key={h} style={s.th}>{h}</th>
          ))}</tr>
        </thead>
        <tbody>
          {epis.length === 0 && <tr><td colSpan={7} style={s.emptyCell}>Nenhum EPI encontrado.</td></tr>}
          {epis.map(epi => {
            const k        = epiKey(epi.nome, epi.ca);
            const novaQtd  = invDraft[k] ?? epi.quantidade;
            const diff     = novaQtd - epi.quantidade;
            const emAlerta = isEmAlerta({ ...epi, quantidade:novaQtd }, allEpis);
            return (
              <tr key={k} style={{ ...s.tr, ...(emAlerta ? s.trAlert : {}) }}>
                <td style={{ ...s.td, fontWeight:600 }}>{epi.nome}</td>
                <td style={s.td}><span style={s.caBadge}>{epi.ca}</span></td>
                <td style={s.td}>
                  <span style={{ ...s.localBadge, ...(epi.local==="Segurança do Trabalho" ? s.localST : s.localAlmox) }}>
                    {epi.local}
                  </span>
                </td>
                <td style={{ ...s.td, textAlign:"center", color:C.textSub }}>{epi.quantidade}</td>
                <td style={s.td}>
                  <div style={s.qtyRow}>
                    <button style={s.qtyBtn} onClick={() => onChange(epi.nome, epi.ca, novaQtd-1)}>−</button>
                    <input style={s.qtyInput} type="number" min="0" value={novaQtd}
                      onChange={e => onChange(epi.nome, epi.ca, e.target.value)} />
                    <button style={s.qtyBtn} onClick={() => onChange(epi.nome, epi.ca, novaQtd+1)}>+</button>
                  </div>
                </td>
                <td style={{ ...s.td, textAlign:"center", fontWeight:700,
                  color: diff>0 ? C.ok : diff<0 ? C.accent : C.textSub }}>
                  {diff>0 ? `+${diff}` : diff===0 ? "—" : diff}
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

// ── Card Inventário (mobile) ──────────────────
export function CardInventario({ epi, allEpis, novaQtd, s, C, onChange }) {
  const diff     = novaQtd - epi.quantidade;
  const emAlerta = isEmAlerta({ ...epi, quantidade:novaQtd }, allEpis);
  return (
    <div style={{ ...s.mobileCard, ...(emAlerta ? { borderColor:C.alertBorder, background:C.alertBg } : {}) }}>
      <div style={s.mobileCardHeader}>
        <span style={s.caBadge}>{epi.ca}</span>
        {emAlerta ? <span style={s.statusLow}>⚠ Baixo</span> : <span style={s.statusOk}>✓ OK</span>}
      </div>
      <div style={s.mobileCardName}>{epi.nome}</div>
      <div style={s.mobileCardRow}>
        <span style={s.mobileLabel}>Local</span>
        <span style={{ ...s.localBadge, ...(epi.local==="Segurança do Trabalho" ? s.localST : s.localAlmox) }}>{epi.local}</span>
      </div>
      <div style={s.mobileCardRow}>
        <span style={s.mobileLabel}>Qtd. Atual</span>
        <span style={{ color:C.textSub, fontWeight:600 }}>{epi.quantidade}</span>
      </div>
      <div style={s.mobileCardRow}>
        <span style={s.mobileLabel}>Nova Qtd.</span>
        <div style={s.qtyRow}>
          <button style={s.qtyBtn} onClick={() => onChange(epi.nome, epi.ca, novaQtd-1)}>−</button>
          <input style={s.qtyInput} type="number" min="0" value={novaQtd}
            onChange={e => onChange(epi.nome, epi.ca, e.target.value)} />
          <button style={s.qtyBtn} onClick={() => onChange(epi.nome, epi.ca, novaQtd+1)}>+</button>
        </div>
      </div>
      <div style={s.mobileCardRow}>
        <span style={s.mobileLabel}>Diferença</span>
        <span style={{ fontWeight:700, color: diff>0?C.ok : diff<0?C.accent : C.textSub }}>
          {diff>0 ? `+${diff}` : diff===0 ? "—" : diff}
        </span>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  GRÁFICO DE PIZZA — SVG puro, sem dependências
// ─────────────────────────────────────────────────────────────────
export function PieChart({ data, C, size = 160 }) {
  // data: [{ label, value, color }]
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) {
    return <div style={{ width:size, height:size, display:"flex", alignItems:"center", justifyContent:"center", color:C.textSub, fontSize:12 }}>Sem dados</div>;
  }
  const r = size / 2;
  let cumulative = 0;
  const slices = data.map(d => {
    const start = (cumulative / total) * 2 * Math.PI;
    cumulative += d.value;
    const end = (cumulative / total) * 2 * Math.PI;
    const x1 = r + r * Math.sin(start);
    const y1 = r - r * Math.cos(start);
    const x2 = r + r * Math.sin(end);
    const y2 = r - r * Math.cos(end);
    const largeArc = end - start > Math.PI ? 1 : 0;
    const path = `M ${r} ${r} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
    return { ...d, path };
  });
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {slices.map((sl, i) => (
        <path key={i} d={sl.path} fill={sl.color} stroke={C.surface} strokeWidth={2} />
      ))}
    </svg>
  );
}

// ─────────────────────────────────────────────────────────────────
//  DASHBOARD — Visão Geral
// ─────────────────────────────────────────────────────────────────
export function DashboardTab({ epis, dashboard, s, C, onGoToAlertas }) {
  const { total, totalAlertas, porLocal, criticos } = dashboard;
  const locaisCores = { "Almoxarifado": C.ok, "Segurança do Trabalho": C.primary };
  const pieData = Object.entries(porLocal).map(([local, val]) => ({
    label: local, value: val, color: locaisCores[local] || C.textSub
  }));

  return (
    <div style={s.tabContent}>
      {/* Cards principais */}
      <div style={s.dashGrid}>
        <div style={s.dashCard}>
          <span style={s.dashCardIcon}>📦</span>
          <span style={s.dashCardVal}>{total}</span>
          <span style={s.dashCardLabel}>EPIs cadastrados</span>
        </div>
        <div style={{ ...s.dashCard, ...(totalAlertas > 0 ? s.dashCardAlert : {}), cursor: totalAlertas>0 ? "pointer" : "default" }}
          onClick={totalAlertas > 0 ? onGoToAlertas : undefined}>
          <span style={s.dashCardIcon}>⚠️</span>
          <span style={{ ...s.dashCardVal, ...(totalAlertas > 0 ? s.dashCardAlertVal : {}) }}>{totalAlertas}</span>
          <span style={s.dashCardLabel}>Em alerta</span>
        </div>
        {Object.entries(porLocal).map(([local, val]) => (
          <div key={local} style={s.dashCard}>
            <span style={s.dashCardIcon}>{local === "Almoxarifado" ? "🏬" : "🦺"}</span>
            <span style={s.dashCardVal}>{val}</span>
            <span style={s.dashCardLabel}>{local}</span>
          </div>
        ))}
      </div>

      <div style={s.dashRow}>
        {/* Gráfico de pizza */}
        <div style={s.dashSection}>
          <div style={s.dashSectionTitle}>📊 Distribuição por Local</div>
          <div style={s.pieWrap}>
            <PieChart data={pieData} C={C} />
            <div style={s.pieLegend}>
              {pieData.map(d => (
                <div key={d.label} style={s.pieLegendItem}>
                  <span style={{ ...s.pieDot, background:d.color }} />
                  {d.label}: <strong>{d.value}</strong>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Top 5 críticos */}
        <div style={s.dashSection}>
          <div style={s.dashSectionTitle}>🔥 Top 5 Itens Críticos</div>
          {criticos.length === 0 ? (
            <div style={{ color:C.ok, fontWeight:600, fontSize:13, padding:"12px 0" }}>
              🎉 Nenhum item crítico no momento!
            </div>
          ) : (
            criticos.map(epi => (
              <div key={epiKey(epi.nome, epi.ca)} style={s.criticoItem}>
                <div>
                  <div style={s.criticoNome}>{epi.nome}</div>
                  <div style={s.criticoCa}>CA: {epi.ca || "—"} · {epi.local}</div>
                </div>
                <span style={s.criticoQtd}>{epi.quantidade}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
//  HISTÓRICO — Timeline de movimentações
// ─────────────────────────────────────────────────────────────────
export function HistoricoTab({ historico, s, C }) {
  return (
    <div style={s.tabContent}>
      {historico.length === 0 ? (
        <div style={s.noAlerts}>📭 Nenhuma movimentação registrada ainda.</div>
      ) : (
        <div style={s.histTimeline}>
          {historico.map((h, i) => (
            <div key={i} style={s.histItem}>
              <span style={h.diferenca > 0 ? s.histIconUp : s.histIconDown}>
                {h.diferenca > 0 ? "▲" : "▼"}
              </span>
              <div style={s.histBody}>
                <div style={s.histTitle}>{h.nome} {h.ca ? `(CA: ${h.ca})` : ""}</div>
                <div style={s.histMeta}>
                  {h.usuario} · {h.data} · {h.qtdAnterior} → {h.qtdNova}
                </div>
              </div>
              <span style={{ ...s.histDiff, color: h.diferenca > 0 ? C.ok : C.accent }}>
                {h.diferenca > 0 ? `+${h.diferenca}` : h.diferenca}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
