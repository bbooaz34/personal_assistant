/* making-of.jsx — "The Making Of" video: code → Tailwind → iOS 26 → Zemingo (intern dashboard) */
const { useScene } = window;
const E = window.Easing;
const seg = (p, a, b, e) => (e || E.easeInOutCubic)(window.clamp((p - a) / (b - a), 0, 1));

/* ---------- color / theme mixing ---------- */
function pc(c) {
  if (c[0] === "#") { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1]; }
  const m = c.match(/[\d.]+/g).map(Number); return [m[0], m[1], m[2], m.length > 3 ? m[3] : 1];
}
function mixColor(a, b, t) {
  const A = pc(a), B = pc(b), v = A.map((x, i) => x + (B[i] - x) * t);
  return `rgba(${v[0] | 0},${v[1] | 0},${v[2] | 0},${+v[3].toFixed(3)})`;
}
const isCol = (v) => typeof v === "string" && (v[0] === "#" || v.startsWith("rgb"));
function mixTheme(a, b, t) {
  const o = {};
  for (const k in a) {
    const va = a[k], vb = b[k];
    o[k] = typeof va === "number" ? va + (vb - va) * t : isCol(va) ? mixColor(va, vb, t) : (t < 0.5 ? va : vb);
  }
  return o;
}

/* ---------- themes ---------- */
const T_TW = {
  page: "#F3F4F6", card: "#FFFFFF", sep: "#E5E7EB", r: 8, pr: 6,
  text: "#111827", sub: "#6B7280", segTrack: "#E5E7EB", segSel: "#FFFFFF", segSelFg: "#111827",
  bar: "#2563EB", barTrack: "#E5E7EB", badgeBg: "#DC2626", badgeFg: "#FFFFFF",
  avBg: "#E5E7EB", avFg: "#374151", sbw: 0, sbo: 0, logoOp: 0, navSel: "#EFF6FF", navSelFg: "#2563EB",
  font: "ui-sans-serif, system-ui, 'Helvetica Neue', Arial, sans-serif",
  shadow: "0 1px 2px rgba(0,0,0,0.06)", cardBorder: "1px solid #E5E7EB",
  tile: "#F9FAFB", tileBorder: "1px solid #E5E7EB", btnBg: "#2563EB", btnFg: "#FFFFFF",
  good: "#16A34A", goodBg: "rgba(22,163,74,0.10)", goodFg: "#15803D",
  wait: "#2563EB", waitBg: "rgba(37,99,235,0.10)", waitFg: "#1D4ED8", box: "#9CA3AF",
};
const T_IOS = {
  page: "#F2F2F7", card: "#FFFFFF", sep: "rgba(0,0,0,0.10)", r: 26, pr: 100,
  text: "#000000", sub: "rgba(60,60,67,0.6)", segTrack: "rgba(118,118,128,0.12)", segSel: "#FFFFFF", segSelFg: "#000000",
  bar: "#0088FF", barTrack: "rgba(118,118,128,0.12)", badgeBg: "#FF383C", badgeFg: "#FFFFFF",
  avBg: "rgba(0,136,255,0.16)", avFg: "#0088FF", sbw: 232, sbo: 1, logoOp: 0, navSel: "#FFFFFF", navSelFg: "#0088FF",
  font: "-apple-system, BlinkMacSystemFont, 'SF Pro Text', 'Helvetica Neue', sans-serif",
  shadow: "0 8px 40px rgba(0,0,0,0.10)", cardBorder: "1px solid rgba(0,0,0,0)",
  tile: "rgba(118,118,128,0.08)", tileBorder: "1px solid rgba(0,0,0,0)", btnBg: "#0088FF", btnFg: "#FFFFFF",
  good: "#34C759", goodBg: "rgba(52,199,89,0.15)", goodFg: "#248A3D",
  wait: "#0088FF", waitBg: "rgba(0,122,255,0.15)", waitFg: "#0071E3", box: "rgba(60,60,67,0.3)",
};
const T_ZEM = { ...T_IOS,
  bar: "#FF8FB0", badgeBg: "#FF8FB0", badgeFg: "#000000", segSel: "#FFF282", segSelFg: "#000000",
  avBg: "#E5E5EA", avFg: "#000000", navSel: "#FFF282", navSelFg: "#000000", logoOp: 1,
  font: "'Rubik', 'Helvetica Neue', Arial, sans-serif",
  btnBg: "#FFF282", btnFg: "#000000",
  good: "#1F6E47", goodBg: "rgba(31,110,71,0.12)", goodFg: "#1F6E47",
  wait: "#FF8FB0", waitBg: "rgba(255,143,176,0.4)", waitFg: "#000000",
};

/* ---------- intern dashboard mini UI ---------- */
const STATS = [["Worked", "118 h"], ["Remaining", "62 h"], ["Time off", "18 h"], ["Projected end", "Aug 13"]];
const TASKS = [
  { n: "Studio design methodology walkthrough", s: "a" },
  { n: "Figma fundamentals & file structure", s: "a" },
  { n: "Components & variants exercise", s: "a" },
  { n: "Design-to-dev handoff practices", s: "a" },
  { n: "Accessibility basics", s: "w" },
  { n: "Design review shadowing", s: "o" },
];
const LOGS = [["Jul 1", "Work", "9"], ["Jun 30", "Work", "8.5"], ["Jun 29", "Work", "9"], ["Jun 26", "Sick", "9"], ["Jun 25", "Work", "7.5"]];
const NAV = ["My dashboard", "My program", "Hours"];

function MiniApp({ th, reveal = 1 }) {
  const st = (i) => {
    if (reveal >= 1) return {};
    const s = seg(reveal, i * 0.07, i * 0.07 + 0.28, E.easeOutCubic);
    return { opacity: s, transform: `translateY(${(1 - s) * 20}px)` };
  };
  const lbl = { fontSize: 9.5, fontWeight: 500, letterSpacing: "0.07em", color: th.sub, textTransform: "uppercase" };
  return (
    <div style={{ display: "flex", width: "100%", height: "100%", background: th.page, fontFamily: th.font, overflow: "hidden", color: th.text }}>
      {th.sbw > 4 && (
        <div style={{ width: th.sbw, flexShrink: 0, padding: "24px 14px", boxSizing: "border-box", opacity: th.sbo, overflow: "hidden" }}>
          <div style={{ position: "relative", height: 30, marginLeft: 10, marginBottom: 18 }}>
            <img src="zemingo/assets/zemingo-logo-full.svg" alt="" style={{ position: "absolute", left: 0, top: 3, width: 108, opacity: th.logoOp }} />
            <div style={{ position: "absolute", left: 0, top: 2, fontSize: 17, fontWeight: 700, opacity: 1 - th.logoOp, whiteSpace: "nowrap" }}>Internship</div>
          </div>
          {NAV.map((n, i) => (
            <div key={n} style={{ height: 36, display: "flex", alignItems: "center", padding: "0 12px", marginBottom: 2, whiteSpace: "nowrap",
              borderRadius: th.pr, fontSize: 14, fontWeight: i === 0 ? 500 : 400,
              background: i === 0 ? th.navSel : "transparent", color: i === 0 ? th.navSelFg : th.text,
              boxShadow: i === 0 ? th.shadow : "none" }}>{n}</div>
          ))}
        </div>
      )}
      <div style={{ flex: 1, minWidth: 0, padding: "24px 30px", boxSizing: "border-box" }}>
        <div style={{ ...st(0) }}>
          <div style={{ fontSize: 25, fontWeight: 700, letterSpacing: "-0.3px" }}>Welcome, Noa</div>
          <div style={{ marginTop: 2, fontSize: 12.5, color: th.sub }}>Track your tasks and log your hours here.</div>
        </div>
        <div style={{ marginTop: 14, background: th.card, borderRadius: th.r, border: th.cardBorder, boxShadow: th.shadow, padding: "14px 18px 16px", ...st(1) }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <div style={{ fontSize: 13, fontWeight: 500 }}>Internship progress</div>
            <div style={{ fontSize: 12, color: th.sub }}>118 of 180 hours · 66%</div>
          </div>
          <div style={{ marginTop: 8, height: 5, borderRadius: th.pr, background: th.barTrack, overflow: "hidden" }}>
            <div style={{ height: "100%", width: "66%", borderRadius: th.pr, background: th.bar }} />
          </div>
          <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {STATS.map(([k, v]) => (
              <div key={k} style={{ background: th.tile, border: th.tileBorder, borderRadius: th.r * 0.62, padding: "8px 12px" }}>
                <div style={{ fontSize: 10.5, color: th.sub }}>{k}</div>
                <div style={{ marginTop: 1, fontSize: 15.5, fontWeight: 600 }}>{v}</div>
              </div>
            ))}
          </div>
        </div>
        <div style={{ marginTop: 14, display: "grid", gridTemplateColumns: "1.15fr 1fr", gap: 14, alignItems: "start" }}>
          <div style={{ ...st(2) }}>
            <div style={{ ...lbl, padding: "0 14px 5px" }}>Your program</div>
            <div style={{ background: th.card, borderRadius: th.r, border: th.cardBorder, boxShadow: th.shadow, padding: "12px 16px 4px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingBottom: 8 }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>Figma Alignment</div>
                <div style={{ fontSize: 11, color: th.sub }}>4 of 6 approved</div>
              </div>
              {TASKS.map((t, i) => {
                const ap = t.s === "a", wa = t.s === "w";
                return (
                  <div key={t.n} style={{ display: "flex", alignItems: "center", gap: 9, minHeight: 34, borderTop: `1px solid ${th.sep}`, ...st(3 + i * 0.5) }}>
                    <div style={{ width: 16, height: 16, borderRadius: "50%", flexShrink: 0, boxSizing: "border-box", display: "flex", alignItems: "center", justifyContent: "center",
                      background: ap ? th.good : wa ? th.wait : "transparent", border: ap || wa ? "none" : `1.5px solid ${th.box}` }}>
                      {(ap || wa) && <svg width="8" height="7" viewBox="0 0 11 9"><path d="M 1 4.5 L 4 7.5 L 10 1" fill="none" stroke={wa && th.wait === "#FF8FB0" ? "#000" : "#fff"} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                    </div>
                    <div style={{ flex: 1, fontSize: 12.5, color: ap ? th.sub : th.text, textDecoration: ap ? "line-through" : "none", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{t.n}</div>
                    {(ap || wa) && (
                      <div style={{ fontSize: 9.5, fontWeight: 500, borderRadius: th.pr, padding: "2px 7px", whiteSpace: "nowrap",
                        color: ap ? th.goodFg : th.waitFg, background: ap ? th.goodBg : th.waitBg }}>{ap ? "Approved" : "Awaiting"}</div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div style={{ ...st(3) }}>
            <div style={{ ...lbl, padding: "0 14px 5px" }}>Hours</div>
            <div style={{ background: th.card, borderRadius: th.r, border: th.cardBorder, boxShadow: th.shadow, padding: "12px 16px 10px" }}>
              <div style={{ fontSize: 14, fontWeight: 500 }}>Log time</div>
              <div style={{ marginTop: 9, display: "flex", gap: 6, alignItems: "center" }}>
                <div style={{ height: 27, borderRadius: th.pr, background: th.segTrack, display: "flex", alignItems: "center", padding: "0 10px", fontSize: 11.5, whiteSpace: "nowrap" }}>Jul 2</div>
                <div style={{ height: 27, width: 30, borderRadius: th.pr, background: th.segTrack, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11.5 }}>9</div>
                <div style={{ display: "flex", background: th.segTrack, borderRadius: th.pr, padding: 2, gap: 2 }}>
                  {["Work", "Vac", "Sick"].map((s, i) => (
                    <div key={s} style={{ padding: "3px 9px", borderRadius: th.pr, fontSize: 10.5, fontWeight: i === 0 ? 500 : 400,
                      background: i === 0 ? th.segSel : "transparent", color: i === 0 ? th.segSelFg : th.text,
                      boxShadow: i === 0 ? "0 1px 4px rgba(0,0,0,0.10)" : "none" }}>{s}</div>
                  ))}
                </div>
                <div style={{ height: 27, borderRadius: th.pr, background: th.btnBg, color: th.btnFg, display: "flex", alignItems: "center", padding: "0 13px", fontSize: 11.5, fontWeight: 500 }}>Add</div>
              </div>
              <div style={{ marginTop: 10 }}>
                {LOGS.map((l, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", minHeight: 29, borderTop: `1px solid ${th.sep}`, fontSize: 11.5, ...st(4 + i * 0.5) }}>
                    <div style={{ flex: 1 }}>{l[0]}</div>
                    <div style={{ width: 52, color: th.sub }}>{l[1]}</div>
                    <div style={{ width: 30, textAlign: "right" }}>{l[2]}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- chrome + caption ---------- */
function Browser({ url, w = 1240, h = 780, children }) {
  return (
    <div style={{ width: w, height: h, borderRadius: 16, overflow: "hidden", boxShadow: "0 40px 120px rgba(0,0,0,0.55)", display: "flex", flexDirection: "column", background: "#fff" }}>
      <div style={{ height: 44, background: "#EDEDF0", display: "flex", alignItems: "center", gap: 8, padding: "0 16px", flexShrink: 0 }}>
        <div style={{ display: "flex", gap: 7 }}>
          {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />)}
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center" }}>
          <div style={{ background: "#FFFFFF", borderRadius: 8, fontSize: 12.5, color: "#5B5B60", padding: "5px 46px", fontFamily: "ui-sans-serif, system-ui" }}>{url}</div>
        </div>
        <div style={{ width: 25 }} />
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}
function Caption({ step, title, sub, show }) {
  return (
    <div style={{ position: "absolute", left: 70, bottom: 56, opacity: show, transform: `translateY(${(1 - show) * 22}px)`, fontFamily: "'Rubik', sans-serif",
      background: "rgba(14,14,16,0.78)", backdropFilter: "blur(10px)", borderRadius: 20, padding: "18px 28px 20px", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div style={{ display: "flex", alignItems: "baseline", gap: 16 }}>
        <div style={{ fontSize: 15, fontWeight: 500, color: "#FFF282", letterSpacing: "0.2em" }}>{step}</div>
        <div style={{ fontSize: 34, fontWeight: 500, color: "#FFFFFF", letterSpacing: "-0.3px" }}>{title}</div>
      </div>
      <div style={{ marginTop: 4, marginLeft: 47, fontSize: 16, color: "rgba(255,255,255,0.55)" }}>{sub}</div>
    </div>
  );
}
const StageBg = ({ children }) => (
  <div style={{ position: "absolute", inset: 0, background: "radial-gradient(120% 90% at 50% 12%, #1B1B20 0%, #0E0E10 62%)", overflow: "hidden" }}>{children}</div>
);
const Center = ({ zoom = 1, ox = 0, oy = 0, origin = "50% 45%", children }) => (
  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
    transform: `scale(${zoom}) translate(${ox}px, ${oy}px)`, transformOrigin: origin }}>{children}</div>
);

/* ---------- scene 1: opening ---------- */
function Opening() {
  const { progress: p } = useScene();
  const a = seg(p, 0.04, 0.28, E.easeOutCubic), b = seg(p, 0.22, 0.46, E.easeOutCubic), c = seg(p, 0.4, 0.62, E.easeOutCubic);
  return (
    <StageBg>
      <Center zoom={1 + 0.035 * p}>
        <div style={{ textAlign: "center", fontFamily: "'Rubik', sans-serif" }}>
          <img src="zemingo/assets/zemingo-logo-full.svg" alt="" style={{ width: 320, filter: "invert(1)", opacity: a, transform: `translateY(${(1 - a) * 26}px)` }} />
          <div style={{ marginTop: 44, fontSize: 58, fontWeight: 500, letterSpacing: "0.3em", color: "#FFF282", opacity: b, transform: `translateY(${(1 - b) * 26}px)` }}>THE MAKING OF</div>
          <div style={{ marginTop: 18, fontSize: 21, color: "rgba(255,255,255,0.55)", opacity: c, transform: `translateY(${(1 - c) * 20}px)` }}>
            The intern dashboard — from code to interface
          </div>
        </div>
      </Center>
    </StageBg>
  );
}

/* ---------- scene 2: the code ---------- */
const CODE_COLORS = { k: "#C678DD", f: "#61AFEF", t: "#E5C07B", s: "#98C379", p: "#ABB2BF", c: "#5C6370", v: "#E06C75" };
const CODE = [
  [["c", "// app/intern/page.tsx"]],
  [["k", "export default async function "], ["f", "InternPage"], ["p", "() {"]],
  [["p", "  "], ["k", "const "], ["v", "user"], ["p", " = "], ["k", "await "], ["f", "requireRole"], ["p", "("], ["s", "\"intern\""], ["p", ");"]],
  [["p", "  "], ["k", "const "], ["p", "{ data: "], ["v", "intern"], ["p", " } = "], ["k", "await "], ["v", "supabase"]],
  [["p", "    ."], ["f", "from"], ["p", "("], ["s", "\"interns\""], ["p", ")."], ["f", "eq"], ["p", "("], ["s", "\"user_id\""], ["p", ", user.id)."], ["f", "single"], ["p", "();"]],
  [["p", "  "], ["k", "const "], ["p", "{ data: "], ["v", "logs"], ["p", " } = "], ["k", "await "], ["v", "supabase"]],
  [["p", "    ."], ["f", "from"], ["p", "("], ["s", "\"hours_logs\""], ["p", ")."], ["f", "order"], ["p", "("], ["s", "\"date\""], ["p", ");"]],
  [["p", ""]],
  [["p", "  "], ["k", "return"], ["p", " ("]],
  [["p", "    <"], ["v", "main"], ["p", " "], ["t", "className"], ["p", "="], ["s", "\"mx-auto max-w-4xl p-8\""], ["p", ">"]],
  [["p", "      <"], ["v", "h1"], ["p", " "], ["t", "className"], ["p", "="], ["s", "\"text-2xl font-bold\""], ["p", ">Welcome, {user.name}</"], ["v", "h1"], ["p", ">"]],
  [["p", "      <"], ["t", "HoursOverview"], ["p", " "], ["t", "logs"], ["p", "={logs} "], ["t", "target"], ["p", "={intern.target_hours} />"]],
  [["p", "      <"], ["t", "InternTaskList"], ["p", " "], ["t", "internId"], ["p", "={intern.id} />"]],
  [["p", "    </"], ["v", "main"], ["p", ">"]],
  [["p", "  );"]],
  [["p", "}"]],
];
const FILES = ["app/", "  leader/", "  intern/", "  › page.tsx", "  designer/", "components/", "  HoursLogger.tsx", "  InternTaskList.tsx", "lib/", "  auth.ts"];
function CodeScene() {
  const { progress: p, localTime } = useScene();
  const total = CODE.reduce((n, l) => n + l.reduce((m, t) => m + t[1].length, 0), 0);
  let budget = Math.floor(seg(p, 0.04, 0.84, (x) => x) * total);
  const cursorOn = Math.floor(localTime * 2.4) % 2 === 0;
  return (
    <StageBg>
      <Center zoom={1.05 + 0.14 * seg(p, 0, 1, E.easeInOutSine)} origin="56% 40%">
        <div style={{ width: 1250, height: 770, borderRadius: 16, overflow: "hidden", background: "#17171B", boxShadow: "0 40px 120px rgba(0,0,0,0.6)", display: "flex", flexDirection: "column" }}>
          <div style={{ height: 42, background: "#212127", display: "flex", alignItems: "center", padding: "0 16px", gap: 8, flexShrink: 0 }}>
            <div style={{ display: "flex", gap: 7 }}>
              {["#FF5F57", "#FEBC2E", "#28C840"].map((c) => <div key={c} style={{ width: 11, height: 11, borderRadius: "50%", background: c }} />)}
            </div>
            <div style={{ flex: 1, textAlign: "center", fontSize: 12.5, color: "#8B8B93", fontFamily: "ui-sans-serif" }}>page.tsx — internship-management-tool</div>
            <div style={{ width: 47 }} />
          </div>
          <div style={{ flex: 1, display: "flex", minHeight: 0, fontFamily: "'SF Mono', ui-monospace, Menlo, monospace" }}>
            <div style={{ width: 220, flexShrink: 0, borderRight: "1px solid #26262C", padding: "16px 0", fontSize: 12.5 }}>
              {FILES.map((f) => (
                <div key={f} style={{ padding: "4px 18px", whiteSpace: "pre", color: f.includes("›") ? "#FFF282" : "#6E6E78", background: f.includes("›") ? "rgba(255,242,130,0.07)" : "none" }}>{f.replace("› ", "")}</div>
              ))}
            </div>
            <div style={{ flex: 1, padding: "16px 0", fontSize: 14.5, lineHeight: "24px", overflow: "hidden" }}>
              {CODE.map((line, li) => {
                const parts = [];
                let lineDone = true;
                for (const [c, txt] of line) {
                  if (budget <= 0) { lineDone = false; break; }
                  const take = Math.min(budget, txt.length);
                  parts.push(<span key={parts.length} style={{ color: CODE_COLORS[c] }}>{txt.slice(0, take)}</span>);
                  budget -= txt.length;
                  if (take < txt.length) { lineDone = false; break; }
                }
                const isCursorLine = !lineDone || (budget === 0 && li === CODE.length - 1);
                return (
                  <div key={li} style={{ display: "flex", whiteSpace: "pre" }}>
                    <span style={{ width: 44, flexShrink: 0, textAlign: "right", paddingRight: 18, color: "#3F3F47" }}>{li + 1}</span>
                    <span>{parts}{isCursorLine && cursorOn && <span style={{ display: "inline-block", width: 8, height: 17, background: "#FFF282", verticalAlign: "-3px" }} />}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </Center>
      <Caption step="01" title="It starts with code" sub="Next.js · Supabase · TypeScript" show={seg(p, 0.08, 0.22, E.easeOutCubic)} />
    </StageBg>
  );
}

/* ---------- scene 3: tailwind ---------- */
function TailwindScene() {
  const { progress: p } = useScene();
  return (
    <StageBg>
      <Center zoom={1.04 + 0.05 * p} oy={-8 * p}>
        <Browser url="localhost:3000/intern">
          <MiniApp th={T_TW} reveal={seg(p, 0.06, 0.75, (x) => x)} />
        </Browser>
      </Center>
      <Caption step="02" title="First interface" sub="A working prototype — plain Tailwind, zero design opinion" show={seg(p, 0.1, 0.24, E.easeOutCubic)} />
    </StageBg>
  );
}

/* ---------- scene 4: iOS 26 ---------- */
function IOSScene() {
  const { progress: p } = useScene();
  const t = seg(p, 0.14, 0.6, E.easeInOutCubic);
  const th = mixTheme(T_TW, T_IOS, t);
  const chips = ["SF Pro", "26px radius", "Pill controls", "Liquid Glass"];
  const zoom = 1.03 + 0.09 * seg(p, 0.05, 0.55, E.easeInOutSine) - 0.07 * seg(p, 0.66, 0.95, E.easeInOutSine);
  return (
    <StageBg>
      <Center zoom={zoom} origin="46% 42%">
        <Browser url="localhost:3000/intern">
          <MiniApp th={th} />
        </Browser>
      </Center>
      {chips.map((c, i) => {
        const a = seg(p, 0.5 + i * 0.07, 0.6 + i * 0.07, E.easeOutBack) * (1 - seg(p, 0.87, 0.97, E.easeInOutCubic));
        return (
          <div key={c} style={{ position: "absolute", right: 96, top: 300 + i * 74, opacity: Math.min(1, a),
            transform: `translateX(${(1 - a) * 40}px)`, background: "rgba(255,255,255,0.09)", border: "1px solid rgba(255,255,255,0.16)",
            backdropFilter: "blur(6px)", color: "#fff", borderRadius: 100, padding: "12px 24px", fontSize: 17, fontFamily: "'Rubik', sans-serif" }}>{c}</div>
        );
      })}
      <Caption step="03" title="iOS 26 design language" sub="Grouped lists · pills · segmented controls · soft glass shadows" show={seg(p, 0.1, 0.24, E.easeOutCubic)} />
    </StageBg>
  );
}

/* ---------- scene 5: zemingo ---------- */
function ZemingoScene() {
  const { progress: p } = useScene();
  const t = seg(p, 0.16, 0.56, E.easeInOutCubic);
  const th = mixTheme(T_IOS, T_ZEM, t);
  const sweepOp = t > 0 && t < 1 ? Math.sin(Math.PI * t) : 0;
  const dots = ["#FFF282", "#FF8FB0", "#1F6E47", "#000000"];
  return (
    <StageBg>
      <Center zoom={1.05 + 0.07 * seg(p, 0.1, 0.7, E.easeInOutSine)} origin="34% 40%">
        <div style={{ position: "relative" }}>
          <Browser url="internship.zemingo.com">
            <MiniApp th={th} />
          </Browser>
          <div style={{ position: "absolute", top: 0, bottom: 0, left: `${t * 100}%`, width: 4, background: "#FFF282", opacity: sweepOp, boxShadow: "0 0 34px 8px rgba(255,242,130,0.6)" }} />
        </div>
      </Center>
      <div style={{ position: "absolute", right: 96, top: 330, display: "flex", flexDirection: "column", gap: 18 }}>
        {dots.map((c, i) => {
          const a = seg(p, 0.42 + i * 0.06, 0.54 + i * 0.06, E.easeOutBack) * (1 - seg(p, 0.88, 0.97, E.easeInOutCubic));
          return <div key={c} style={{ width: 52, height: 52, borderRadius: "50%", background: c, border: "2px solid rgba(255,255,255,0.25)",
            opacity: Math.min(1, a), transform: `scale(${0.4 + 0.6 * Math.min(1, a)})` }} />;
        })}
      </div>
      <Caption step="04" title="The Zemingo layer" sub="Sun selection · Neon progress · Rubik · the wordmark moves in" show={seg(p, 0.08, 0.22, E.easeOutCubic)} />
    </StageBg>
  );
}

/* ---------- scene 6: finale ---------- */
function Finale() {
  const { progress: p } = useScene();
  const card = seg(p, 0.5, 0.78, E.easeInOutCubic);
  const a = seg(p, 0.62, 0.8, E.easeOutCubic), b = seg(p, 0.7, 0.88, E.easeOutCubic);
  return (
    <StageBg>
      <Center zoom={1.16 - 0.16 * seg(p, 0, 0.5, E.easeInOutSine)}>
        <Browser url="internship.zemingo.com">
          <MiniApp th={T_ZEM} />
        </Browser>
      </Center>
      <div style={{ position: "absolute", inset: 0, background: "#0E0E10", opacity: card, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <div style={{ textAlign: "center", fontFamily: "'Rubik', sans-serif" }}>
          <img src="zemingo/assets/zemingo-logo-full.svg" alt="" style={{ width: 300, filter: "invert(1)", opacity: a, transform: `translateY(${(1 - a) * 24}px)` }} />
          <div style={{ marginTop: 36, fontSize: 26, color: "rgba(255,255,255,0.8)", opacity: b, transform: `translateY(${(1 - b) * 18}px)` }}>
            Internship Platform — iOS 26 × Zemingo
          </div>
          <div style={{ marginTop: 12, fontSize: 16, color: "rgba(255,255,255,0.4)", opacity: b }}>July 2026</div>
        </div>
      </div>
    </StageBg>
  );
}

/* ---------- root ---------- */
function MakingOf() {
  return (
    <window.SceneStage width={1920} height={1080} scenes={window.OM_SCENES} playback={window.OM_PLAYBACK} bg="#0E0E10">
      {{ "Opening": Opening, "The code": CodeScene, "First interface": TailwindScene, "iOS 26": IOSScene, "Zemingo": ZemingoScene, "Finale": Finale }}
    </window.SceneStage>
  );
}
window.MakingOf = MakingOf;

function MakingOfTweaks() {
  const [t, setTweak] = window.useTweaks(window.TWEAK_DEFAULTS);
  return (
    <window.TweaksPanel>
      <window.TweakSection label="Motion" />
      <window.TweakToggle label="Motion editor" value={t.motionEditor} onChange={(v) => setTweak("motionEditor", v)} />
    </window.TweaksPanel>
  );
}
window.MakingOfTweaks = MakingOfTweaks;
