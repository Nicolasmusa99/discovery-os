import { useState, useEffect, useRef } from "react";

const ANTHROPIC_API = "/api/claude";
const ANTHROPIC_HEADERS = {
  "Content-Type": "application/json",
};

const STEPS = [
  { id: "problem",    label: "Problema",   num: "01" },
  { id: "evidence",   label: "Evidencia",  num: "02" },
  { id: "hypotheses", label: "Hipótesis",  num: "03" },
  { id: "solutions",  label: "Soluciones", num: "04" },
  { id: "decision",   label: "Decisión",   num: "05" },
];

// ─── SYSTEM PROMPT ────────────────────────────────────────
// New model: one block at a time, not one question at a time.
// With doc: pre-fill what you can, ask only what's genuinely missing.
// Without doc: ask the 3 key questions as a single message, PM answers freely.
function buildBlockPrompt(stepId, stepLabel, docContext) {
  const BLOCK_GOALS = {
    problem:    "entender qué problema existe, quién lo sufre y con qué frecuencia.",
    evidence:   "entender qué datos cuantitativos o cualitativos validan el problema.",
    hypotheses: "identificar la causa raíz y los supuestos críticos del análisis.",
    solutions:  "mapear las opciones evaluadas, los trade-offs y la propuesta elegida.",
    decision:   "definir qué se hace, cómo se mide el éxito y qué pasa si falla.",
  };

  const baseRules = `Sos un facilitador de product discovery senior. Sos directo, no usás relleno.
Reglas:
- Respondés SIEMPRE en español.
- Sin "¡Excelente!", "Perfecto", "Muy bien" ni frases de validación vacías.
- Máximo 4 oraciones por respuesta.
- Si el PM da una respuesta que cubre todo lo necesario para este bloque: escribí un resumen de 1-2 líneas de lo que entendiste y terminá con exactamente [LISTO].
- Si falta algo importante: hacé UNA sola pregunta específica sobre lo que falta.
- No hagas preguntas sobre cosas que ya están cubiertas en el contexto o en la conversación.`;

  if (docContext) {
    return `${baseRules}

OBJETIVO DE ESTE BLOQUE (${stepLabel}): ${BLOCK_GOALS[stepId]}

DOCUMENTO DE CONTEXTO DEL PM:
---
${docContext}
---

INSTRUCCIÓN CLAVE: El documento ya contiene información relevante. 
- Cuando iniciás el bloque: leé el doc, extraé lo que ya responde este bloque, presentáselo al PM como un borrador ("Basándome en tu doc, entiendo que... ¿es correcto o querés ajustar algo?"). Así el PM solo confirma o corrige en lugar de escribir desde cero.
- Si el doc no cubre algo crítico para este bloque: preguntá solo eso.
- No hagas preguntas sobre lo que ya está en el doc.`;
  }

  return `${baseRules}

OBJETIVO DE ESTE BLOQUE (${stepLabel}): ${BLOCK_GOALS[stepId]}

INSTRUCCIÓN: No tenés documento de contexto. Hacé las 2-3 preguntas clave de este bloque en UN solo mensaje, como una lista corta. El PM responde todo junto. Si su respuesta cubre el objetivo del bloque, terminá con [LISTO]. Si falta algo puntual, preguntá solo eso.`;
}

function buildSystemPrompt(stepId, stepLabel, docContext) {
  return buildBlockPrompt(stepId, stepLabel, docContext);
}

// ─── DOC GENERATION ──────────────────────────────────────
function generateDoc(initiative) {
  const lines = [`# ${initiative.title}`, `*${new Date(initiative.createdAt).toLocaleDateString("es-AR")}*`, ""];
  STEPS.forEach(step => {
    const data = initiative.steps[step.id];
    if (!data?.summary) return;
    lines.push(`## ${step.num} — ${step.label.toUpperCase()}`, "", data.summary, "");
  });
  return lines.join("\n");
}

// ─── MAMMOTH / FILE UTILS ────────────────────────────────



// ─── ICONS ───────────────────────────────────────────────
const Ico = {
  upload: () => <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>,
  arrow:  () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>,
  check:  () => <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg>,
  copy:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>,
  x:      () => <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>,
  doc:    () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
  warn:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  plus:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>,
  send:   () => <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>,
  back:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="15 18 9 12 15 6"/></svg>,
  skip:   () => <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="9 18 15 12 9 6"/></svg>,
};

const C = {
  bg: "#F5F4F0", surface: "#FDFCF9", border: "#E4E1DA",
  borderHover: "#C8C4BC", text: "#18181A", muted: "#7A776F",
  faint: "#B8B5AD", pill: "#ECEAE5",
  accentFg: "#FDFCF9", errBg: "#FEE2E2", err: "#991B1B",
};

const labelStyle = { fontSize: 10, color: C.faint, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: 500 };

const btn = (v = "ghost") => ({
  background: v === "fill" ? C.text : "transparent",
  border: `1px solid ${v === "fill" ? C.text : C.border}`,
  color: v === "fill" ? C.accentFg : C.muted,
  padding: "7px 14px", fontSize: 11, cursor: "pointer",
  fontFamily: "inherit", letterSpacing: "0.04em",
  display: "inline-flex", alignItems: "center", gap: 6, transition: "all 0.12s",
});

// ─── APP ──────────────────────────────────────────────────
export default function DiscoveryOS() {
  const [view, setView]               = useState("home");
  const [initiatives, setInit]        = useState([]);
  const [current, setCurrent]         = useState(null);
  const [step, setStep]               = useState(0);
  const [msgs, setMsgs]               = useState([]);
  const [input, setInput]             = useState("");
  const [loading, setLoading]         = useState(false);
  const [blockDone, setBlockDone]     = useState(false); // current block marked as [LISTO]
  const [newTitle, setNewTitle]       = useState("");
  const [showForm, setShowForm]       = useState(false);
  const [docContent, setDocContent]   = useState("");
  const [contextText, setContextText] = useState(""); // texto pegado por el usuario
  const [copied, setCopied]           = useState(false);
  const endRef  = useRef(null);
  const textRef = useRef(null);

  useEffect(() => {
    try { const s = localStorage.getItem("dOS_v5"); if (s) setInit(JSON.parse(s)); } catch {}
  }, []);
  useEffect(() => {
    if (initiatives.length) localStorage.setItem("dOS_v5", JSON.stringify(initiatives));
  }, [initiatives]);
  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs]);
  useEffect(() => { if (view === "discovery") setTimeout(() => textRef.current?.focus(), 80); }, [view, step]);

  // ── Save block summary ──
  const saveBlock = (initId, stepId, summary) => {
    setInit(prev => prev.map(i => {
      if (i.id !== initId) return i;
      return { ...i, steps: { ...i.steps, [stepId]: { summary } } };
    }));
  };

  // ── Start initiative ──
  const startInitiative = () => {
    if (!newTitle.trim()) return;
    const init = {
      id: Date.now().toString(),
      title: newTitle.trim(),
      createdAt: new Date().toISOString(),
      steps: {},
      completed: false,
      docContext: contextText.trim() || null,
      docName: contextText.trim() ? "Contexto manual" : null,
    };
    setInit(prev => [...prev, init]);
    setCurrent(init);
    setStep(0); setBlockDone(false);

    // First message: if doc, bot opens by pre-filling. If no doc, bot asks block questions together.
    const opening = init.docContext
      ? `Iniciativa: **${init.title}**\n\nTengo el contexto que cargaste. Arrancamos con el bloque **Problema** — te presento lo que entendí y confirmás o ajustás.`
      : `Iniciativa: **${init.title}**\n\nArrancamos. Para el bloque **Problema**, contame:\n\n1. ¿Qué problema observaste?\n2. ¿Cómo lo descubriste?\n3. ¿A quién afecta y con qué frecuencia?\n\nResponde todo junto, con lo que tenés.`;

    setMsgs([{ role: "assistant", content: opening }]);

    // If doc, immediately trigger first bot analysis of the problem block
    if (init.docContext) {
      triggerBlockAnalysis(init, 0, [{ role: "assistant", content: opening }]);
    }

    setNewTitle(""); setShowForm(false);
    setView("discovery");
  };

  // ── Trigger block analysis (when doc exists, bot pre-fills) ──
  const triggerBlockAnalysis = async (initiative, stepIndex, currentMsgs) => {
    const stepObj = STEPS[stepIndex];
    setLoading(true);
    try {
      const res = await fetch(ANTHROPIC_API, {
        method: "POST",
        headers: ANTHROPIC_HEADERS,
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 800,
          system: buildSystemPrompt(stepObj.id, stepObj.label, initiative.docContext),
          messages: [
            ...currentMsgs.slice(-6).map(m => ({ role: m.role, content: m.content })),
            { role: "user", content: `Analizá el bloque "${stepObj.label}" basándote en el documento. Presentá un borrador de lo que ya sabés y preguntá solo lo que falta.` },
          ],
        }),
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      const isListo = text.includes("[LISTO]");
      const clean = text.replace("[LISTO]", "").trim();

      setMsgs(p => [...p, { role: "assistant", content: clean, listo: isListo }]);
      if (isListo) {
        setBlockDone(true);
        saveBlock(initiative.id, stepObj.id, clean);
      }
    } catch (err) {
      setMsgs(p => [...p, { role: "assistant", content: `Error: ${err.message}`, error: true }]);
    }
    setLoading(false);
  };

  // ── Open existing initiative ──
  const openInit = (init) => {
    setCurrent(init);
    const li = STEPS.findIndex(s => !init.steps[s.id]);
    const si = li === -1 ? STEPS.length - 1 : Math.max(0, li);
    setStep(si); setBlockDone(false);
    setMsgs([{
      role: "assistant",
      content: init.completed
        ? "Iniciativa completa. Podés ver el documento generado."
        : `Continuamos con el bloque **${STEPS[si].label}**.`,
    }]);
    setView("discovery");
  };

  // ── Send user message ──
  const send = async () => {
    if (!input.trim() || loading) return;
    const msg = input.trim();
    setInput("");

    const stepObj = STEPS[step];
    const next = [...msgs, { role: "user", content: msg }];
    setMsgs(next);
    setLoading(true);

    try {
      const res = await fetch(ANTHROPIC_API, {
        method: "POST",
        headers: ANTHROPIC_HEADERS,
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 800,
          system: buildSystemPrompt(stepObj.id, stepObj.label, current.docContext),
          messages: next.slice(-8).map(m => ({ role: m.role, content: m.content })),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err?.error?.message || `Error ${res.status}`);
      }
      const data = await res.json();
      const text = data.content?.[0]?.text || "";
      const isListo = text.includes("[LISTO]");
      const clean = text.replace("[LISTO]", "").trim();

      setMsgs(p => [...p, { role: "assistant", content: clean, listo: isListo }]);

      if (isListo) {
        setBlockDone(true);
        // Save a summary: last assistant message before [LISTO]
        saveBlock(current.id, stepObj.id, clean);
      }
    } catch (err) {
      setMsgs(p => [...p, { role: "assistant", content: `Error: ${err.message}`, error: true }]);
    }
    setLoading(false);
  };

  // ── Advance to next block ──
  const nextBlock = () => {
    const isLastStep = step >= STEPS.length - 1;
    if (isLastStep) {
      finishInit();
      return;
    }
    const ns = step + 1;
    setStep(ns);
    setBlockDone(false);

    const intro = current.docContext
      ? `Bloque **${STEPS[ns].label}**. Revisando el documento para este bloque...`
      : `Bloque **${STEPS[ns].label}**. ${getBlockOpeningNodoc(STEPS[ns].id)}`;

    const newMsgs = [...msgs, { role: "assistant", content: intro }];
    setMsgs(newMsgs);

    if (current.docContext) {
      triggerBlockAnalysis(current, ns, newMsgs);
    }
  };

  const getBlockOpeningNodoc = (id) => {
    const m = {
      evidence:   "¿Qué datos tenés? ¿Qué te dijeron usuarios? ¿Tiene costo cuantificable?",
      hypotheses: "¿Cuál es la causa raíz? ¿Qué suposiciones críticas tenés? ¿Qué podrías estar equivocado?",
      solutions:  "¿Qué opciones evaluaste? ¿Qué descartaste y por qué? ¿Cuál es tu propuesta?",
      decision:   "¿Qué hacés? ¿Cómo medís el éxito? ¿Plan B si en 60 días no llegás?",
    };
    return m[id] || "";
  };

  // ── Skip block ──
  const skipBlock = () => {
    saveBlock(current.id, STEPS[step].id, "(bloque omitido)");
    nextBlock();
  };

  // ── Finish initiative ──
  const finishInit = () => {
    setInit(prev => prev.map(i => i.id === current.id ? { ...i, completed: true } : i));
    const all = JSON.parse(localStorage.getItem("dOS_v5") || "[]");
    const updated = all.find(i => i.id === current.id) || current;
    const doc = generateDoc({ ...updated, completed: true });
    setDocContent(doc);
    setView("doc");
  };

  const openDoc = (init) => { setDocContent(generateDoc(init)); setCurrent(init); setView("doc"); };
  const kd = (e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } };
  const pct = step / STEPS.length * 100;

  // ── RENDER ────────────────────────────────────────────
  return (
    <div style={{ minHeight: "100vh", background: C.bg, color: C.text, fontFamily: "'IBM Plex Mono','Courier New',monospace", display: "flex", flexDirection: "column" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:ital,wght@0,300;0,400;0,500;1,300&family=IBM+Plex+Sans:wght@300;400;500;600&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        ::-webkit-scrollbar{width:3px}::-webkit-scrollbar-thumb{background:${C.border}}
        textarea,input{font-family:inherit}
        textarea:focus,input:focus{outline:none}
        .hov-card:hover{background:#ECEAE5!important;border-color:${C.borderHover}!important}
        .hov-ghost:hover{color:${C.text}!important;border-color:${C.borderHover}!important}
        .hov-fill:hover{background:#2D2D30!important}
        .hov-send:hover:not(:disabled){background:#2D2D30!important}
        input[type=file]{display:none}
        @keyframes up{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes dot{0%,100%{opacity:.2}50%{opacity:.9}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .msg-in{animation:up 0.18s ease both}
        .d1{animation:dot 1.1s 0s infinite;display:inline-block}
        .d2{animation:dot 1.1s .2s infinite;display:inline-block}
        .d3{animation:dot 1.1s .4s infinite;display:inline-block}
        .spin{animation:spin .75s linear infinite}
        .pulse{animation:pulse 1.8s ease infinite}
      `}</style>

      {/* ── NAV ── */}
      <nav style={{ height: 50, borderBottom: `1px solid ${C.border}`, padding: "0 24px", display: "flex", alignItems: "center", justifyContent: "space-between", background: C.surface, position: "sticky", top: 0, zIndex: 100, flexShrink: 0 }}>
        <button onClick={() => setView("home")} style={{ background: "none", border: "none", display: "flex", alignItems: "center", gap: 10, padding: 0, cursor: "pointer" }}>
          <span style={{ width: 22, height: 22, background: C.text, color: C.surface, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 600 }}>DO</span>
          <span style={{ fontSize: 11, fontWeight: 500, letterSpacing: "0.08em" }}>DISCOVERY OS</span>
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          {view === "discovery" && current && (
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span style={{ fontSize: 11, color: C.muted, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{current.title}</span>
              <div style={{ display: "flex", gap: 2 }}>
                {STEPS.map((s, i) => <div key={s.id} style={{ width: 18, height: 2, background: i < step ? C.text : i === step ? C.faint : C.border, transition: "background 0.3s" }} />)}
              </div>
            </div>
          )}
          {view !== "home" && <button className="hov-ghost" onClick={() => setView("home")} style={btn()}><Ico.back /> inicio</button>}
          {view === "discovery" && current?.completed && <button className="hov-fill" onClick={() => openDoc(current)} style={btn("fill")}>documento <Ico.arrow /></button>}
        </div>
      </nav>

      {/* ════ HOME ════ */}
      {view === "home" && (
        <main style={{ flex: 1, padding: "52px 24px 80px", maxWidth: 820, margin: "0 auto", width: "100%" }}>
          <div style={{ marginBottom: 52 }}>
            <p style={{ ...labelStyle, marginBottom: 14 }}>Product Discovery — Sistema Guiado</p>
            <h1 style={{ fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 300, fontSize: "clamp(28px,4vw,42px)", lineHeight: 1.15, marginBottom: 16 }}>
              Estructurá tu discovery.<br /><span style={{ fontWeight: 600 }}>Sin perder el hilo.</span>
            </h1>
            <p style={{ fontSize: 13, color: C.muted, lineHeight: 1.85, maxWidth: 420, fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 300 }}>
              Cinco bloques guiados por IA. Subí un documento y el sistema pre-completa lo que ya sabés — solo confirmás o ajustás.
            </p>
          </div>

          {/* Steps strip */}
          <div style={{ display: "grid", gridTemplateColumns: "repeat(5,1fr)", marginBottom: 48, borderTop: `1px solid ${C.border}` }}>
            {STEPS.map((s, i) => (
              <div key={s.id} style={{ padding: "14px 0 14px", borderRight: i < STEPS.length - 1 ? `1px solid ${C.border}` : "none", paddingLeft: i > 0 ? 14 : 0 }}>
                <p style={{ ...labelStyle, marginBottom: 5 }}>{s.num}</p>
                <p style={{ fontSize: 12, fontWeight: 500 }}>{s.label}</p>
              </div>
            ))}
          </div>

          {/* Context textarea */}
          <div style={{ marginBottom: 32 }}>
            <p style={{ ...labelStyle, marginBottom: 10 }}>Contexto opcional</p>
            <p style={{ fontSize: 12, color: C.muted, marginBottom: 12, lineHeight: 1.7, fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 300 }}>
              Pegá acá el contenido relevante de tu doc, brief o notas. El sistema lo usa para pre-completar cada bloque y hacer menos preguntas.
            </p>
            <textarea
              value={contextText}
              onChange={e => setContextText(e.target.value)}
              placeholder="Pegá el texto de tu documento, brief, notas de investigación..."
              rows={6}
              style={{ width: "100%", background: C.surface, border: `1px solid ${C.border}`, color: C.text, padding: "12px 14px", fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 300, resize: "vertical", lineHeight: 1.65 }}
              onFocus={e => e.target.style.borderColor = C.text}
              onBlur={e => e.target.style.borderColor = C.border}
            />
            {contextText.trim() && (
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 6 }}>
                <p style={{ fontSize: 11, color: C.faint, fontFamily: "'IBM Plex Sans',sans-serif" }}>~{Math.round(contextText.length / 4)} tokens de contexto</p>
                <button onClick={() => setContextText("")} style={{ background: "none", border: "none", fontSize: 11, color: C.faint, cursor: "pointer", fontFamily: "inherit" }}>limpiar</button>
              </div>
            )}
          </div>

          {/* New initiative */}
          <div style={{ marginBottom: 48 }}>
            {!showForm ? (
              <button className="hov-fill" onClick={() => setShowForm(true)} style={{ ...btn("fill"), padding: "10px 20px", fontSize: 12 }}>
                <Ico.plus /> Nueva iniciativa
              </button>
            ) : (
              <div style={{ border: `1px solid ${C.border}`, background: C.surface }}>
                <div style={{ padding: "18px 18px 0" }}>
                  <p style={{ ...labelStyle, marginBottom: 8 }}>Nombre de la iniciativa</p>
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    onKeyDown={e => e.key === "Enter" && startInitiative()}
                    placeholder="Ej: Rediseño del flujo de checkout"
                    style={{ width: "100%", background: "transparent", border: "none", borderBottom: `1px solid ${C.border}`, color: C.text, padding: "7px 0 11px", fontSize: 15, fontFamily: "'IBM Plex Sans',sans-serif" }}
                  />
                  {contextText.trim() && <p style={{ fontSize: 11, color: C.muted, padding: "8px 0 0", fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 300 }}>Con contexto cargado</p>}
                </div>
                <div style={{ padding: "12px 18px", display: "flex", gap: 8 }}>
                  <button className="hov-fill" onClick={startInitiative} style={btn("fill")}>Empezar <Ico.arrow /></button>
                  <button className="hov-ghost" onClick={() => { setShowForm(false); setNewTitle(""); }} style={btn()}>Cancelar</button>
                </div>
              </div>
            )}
          </div>

          {/* Initiatives list */}
          {initiatives.length > 0 && (
            <div>
              <p style={{ ...labelStyle, marginBottom: 12 }}>Iniciativas — {initiatives.length}</p>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {[...initiatives].reverse().map(init => {
                  const done = STEPS.filter(s => init.steps[s.id]).length;
                  const p = Math.round((done / STEPS.length) * 100);
                  return (
                    <div key={init.id} className="hov-card" onClick={() => init.completed ? openDoc(init) : openInit(init)}
                      style={{ padding: "14px 16px", border: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", transition: "all 0.12s", background: C.surface }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                          {init.completed
                            ? <span style={{ fontSize: 10, background: C.text, color: C.accentFg, padding: "2px 7px", letterSpacing: "0.06em", flexShrink: 0 }}>✓ completo</span>
                            : <span style={{ fontSize: 10, background: C.pill, color: C.muted, padding: "2px 7px", letterSpacing: "0.06em", flexShrink: 0 }}>{p}%</span>
                          }
                          <span style={{ fontSize: 13, color: C.text, fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{init.title}</span>
                        </div>
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <span style={{ fontSize: 11, color: C.faint, fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 300 }}>{new Date(init.createdAt).toLocaleDateString("es-AR")} · {done}/{STEPS.length} bloques</span>
                          {init.docContext && <span style={{ fontSize: 10, color: C.faint, display: "flex", alignItems: "center", gap: 3 }}><Ico.doc /> con contexto</span>}
                        </div>
                      </div>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 14, flexShrink: 0 }}>
                        <div style={{ display: "flex", gap: 2 }}>
                          {STEPS.map((s, i) => <div key={s.id} style={{ width: 14, height: 3, background: init.steps[s.id] ? C.text : C.border }} />)}
                        </div>
                        <span style={{ color: C.faint }}><Ico.arrow /></span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {initiatives.length === 0 && !showForm && (
            <div style={{ border: `1px dashed ${C.border}`, padding: "40px 24px", textAlign: "center" }}>
              <p style={{ fontSize: 12, color: C.faint, fontFamily: "'IBM Plex Sans',sans-serif" }}>Todavía no hay iniciativas. Creá la primera arriba.</p>
            </div>
          )}
        </main>
      )}

      {/* ════ DISCOVERY ════ */}
      {view === "discovery" && (
        <div style={{ flex: 1, display: "flex", flexDirection: "column", maxWidth: 700, margin: "0 auto", width: "100%", minHeight: 0 }}>

          {/* Step bar */}
          <div style={{ display: "flex", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
            {STEPS.map((s, i) => {
              const done = i < step, active = i === step;
              return (
                <div key={s.id} style={{ flex: 1, minWidth: 0, padding: "9px 12px", borderRight: i < STEPS.length - 1 ? `1px solid ${C.border}` : "none", background: active ? C.text : "transparent", opacity: (!done && !active) ? 0.28 : 1, transition: "all 0.2s" }}>
                  <p style={{ fontSize: 9, color: active ? "#888" : C.faint, letterSpacing: "0.1em", marginBottom: 2 }}>{s.num}</p>
                  <p style={{ fontSize: 11, color: active ? C.accentFg : done ? C.text : C.muted, fontWeight: active ? 500 : 400, display: "flex", alignItems: "center", gap: 4 }}>
                    {done && <span style={{ opacity: 0.6, flexShrink: 0 }}><Ico.check /></span>}
                    {s.label}
                  </p>
                </div>
              );
            })}
          </div>

          {/* Doc badge */}
          {current?.docContext && (
            <div style={{ padding: "4px 20px", background: C.pill, borderBottom: `1px solid ${C.border}`, fontSize: 10, color: C.faint, display: "flex", alignItems: "center", gap: 5, flexShrink: 0 }}>
              <Ico.doc /> con contexto
            </div>
          )}

          {/* Messages */}
          <div style={{ flex: 1, overflowY: "auto", padding: "28px 22px", display: "flex", flexDirection: "column", gap: 22, minHeight: 0 }}>
            {msgs.map((m, i) => (
              <div key={i} className="msg-in" style={{ display: "flex", justifyContent: m.role === "user" ? "flex-end" : "flex-start" }}>
                {m.role === "assistant" ? (
                  <div style={{ maxWidth: "80%", fontSize: 14, lineHeight: 1.85, color: m.error ? C.err : C.text, fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 300 }}>
                    {/* [LISTO] indicator */}
                    {m.listo && (
                      <div style={{ fontSize: 10, color: "#2D6A4F", letterSpacing: "0.08em", marginBottom: 8, display: "flex", alignItems: "center", gap: 5, background: "#D1FAE5", padding: "3px 8px", width: "fit-content" }}>
                        <Ico.check /> bloque listo
                      </div>
                    )}
                    <div>
                      {m.content.split("**").map((p, j) =>
                        j % 2 === 0 ? <span key={j}>{p}</span> : <strong key={j} style={{ fontWeight: 600, color: C.text }}>{p}</strong>
                      )}
                    </div>
                  </div>
                ) : (
                  <div style={{ maxWidth: "78%", padding: "11px 15px", background: C.text, color: C.accentFg, fontSize: 13, lineHeight: 1.75, fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 400, whiteSpace: "pre-wrap" }}>
                    {m.content}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div style={{ display: "flex" }}>
                <div style={{ padding: "4px 0", display: "flex", gap: 5, alignItems: "center" }}>
                  <span className="d1" style={{ width: 5, height: 5, background: C.faint, borderRadius: "50%" }} />
                  <span className="d2" style={{ width: 5, height: 5, background: C.faint, borderRadius: "50%" }} />
                  <span className="d3" style={{ width: 5, height: 5, background: C.faint, borderRadius: "50%" }} />
                </div>
              </div>
            )}

            {/* Block done CTA */}
            {blockDone && !loading && (
              <div className="msg-in" style={{ display: "flex", justifyContent: "flex-start" }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <button className="hov-fill" onClick={nextBlock} style={{ ...btn("fill"), fontSize: 11 }}>
                    {step >= STEPS.length - 1 ? "Generar documento" : `Siguiente: ${STEPS[step + 1]?.label}`} <Ico.arrow />
                  </button>
                  {step < STEPS.length - 1 && (
                    <button className="hov-ghost" onClick={skipBlock} style={{ ...btn(), fontSize: 11 }}>
                      Saltar bloque <Ico.skip />
                    </button>
                  )}
                </div>
              </div>
            )}

            <div ref={endRef} />
          </div>

          {/* Input */}
          <div style={{ borderTop: `1px solid ${C.border}`, padding: "14px 22px", background: C.surface, flexShrink: 0 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
              <span style={{ fontSize: 10, color: C.faint, letterSpacing: "0.08em" }}>{STEPS[step]?.label.toUpperCase()}</span>
              {!blockDone && (
                <button className="hov-ghost" onClick={skipBlock} style={{ ...btn(), fontSize: 10, padding: "3px 8px" }}>
                  omitir bloque <Ico.skip />
                </button>
              )}
            </div>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
              <textarea
                ref={textRef}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={kd}
                disabled={blockDone}
                placeholder={blockDone ? "Bloque listo — avanzá al siguiente ↑" : "Escribí tu respuesta aquí"}
                rows={3}
                style={{ flex: 1, background: blockDone ? C.pill : C.bg, border: `1px solid ${C.border}`, color: C.text, padding: "10px 13px", fontSize: 13, fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 300, resize: "none", lineHeight: 1.65, transition: "border-color 0.15s", opacity: blockDone ? 0.5 : 1 }}
                onFocus={e => e.target.style.borderColor = C.text}
                onBlur={e => e.target.style.borderColor = C.border}
              />
              <button className="hov-send" onClick={send} disabled={loading || blockDone}
                style={{ background: (loading || blockDone) ? C.border : C.text, border: "none", color: (loading || blockDone) ? C.faint : C.accentFg, width: 42, height: 42, cursor: (loading || blockDone) ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", transition: "background 0.12s", alignSelf: "flex-end", flexShrink: 0 }}>
                <Ico.send />
              </button>
            </div>
            <p style={{ fontSize: 10, color: C.faint, marginTop: 5 }}>Shift+Enter = nueva línea</p>
          </div>
        </div>
      )}

      {/* ════ DOCUMENT ════ */}
      {view === "doc" && (
        <main style={{ flex: 1, padding: "44px 24px 80px", maxWidth: 720, margin: "0 auto", width: "100%" }}>
          <div style={{ marginBottom: 28, display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 20 }}>
            <div>
              <p style={{ ...labelStyle, marginBottom: 6 }}>Documento generado</p>
              <h2 style={{ fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 500, fontSize: 20, lineHeight: 1.2 }}>{current?.title}</h2>
            </div>
            <div style={{ display: "flex", gap: 8, flexShrink: 0, marginTop: 4 }}>
              <button className="hov-ghost" onClick={() => { navigator.clipboard.writeText(docContent); setCopied(true); setTimeout(() => setCopied(false), 2000); }} style={btn()}>
                {copied ? <><Ico.check /> Copiado</> : <><Ico.copy /> Copiar</>}
              </button>
              <button className="hov-ghost" onClick={() => setView("home")} style={btn()}>← Ver todas</button>
            </div>
          </div>

          <div style={{ border: `1px solid ${C.border}`, background: C.surface }}>
            <div style={{ padding: "36px 40px", lineHeight: 2 }}>
              {docContent.split("\n").map((line, i) => {
                if (line.startsWith("# ")) return <h1 key={i} style={{ fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 600, fontSize: 19, marginBottom: 4, lineHeight: 1.3 }}>{line.slice(2)}</h1>;
                if (line.startsWith("## ")) return <div key={i} style={{ borderTop: `1px solid ${C.border}`, marginTop: 28, marginBottom: 14, paddingTop: 14 }}><p style={labelStyle}>{line.slice(3)}</p></div>;
                if (line.startsWith("*") && line.endsWith("*")) return <p key={i} style={{ fontSize: 11, color: C.faint, fontStyle: "italic", marginBottom: 16, fontFamily: "'IBM Plex Sans',sans-serif" }}>{line.replace(/\*/g, "")}</p>;
                if (!line.trim()) return <div key={i} style={{ height: 4 }} />;
                return <p key={i} style={{ fontFamily: "'IBM Plex Sans',sans-serif", fontWeight: 300, fontSize: 14, color: "#3A3830", lineHeight: 1.85 }}>{line}</p>;
              })}
            </div>
          </div>
        </main>
      )}
    </div>
  );
}
