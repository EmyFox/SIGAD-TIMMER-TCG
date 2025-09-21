import React, { useEffect, useMemo, useRef, useState } from "react";
import "./index.css";
import ReactDOM from "react-dom/client";
import dayjs from "dayjs";
import 'dayjs/locale/es';
import {
  subscribeDisplay,
  subscribeAnnouncements,
  subscribeAdvancedAnnouncements,
  subscribeClearAnnouncements,
  subscribeDisplayZoom,
  type DisplayTournament,
  type TimeFmt,
} from "./displayChannel";
import { BrandLogo } from "./BrandLogo";

/* ==================== Iconos ==================== */
const IconClock = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...p}>
    <path stroke="currentColor" strokeWidth="1.5" d="M12 8v5l3 2" />
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);
const IconBolt = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...p}>
    <path
      d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="currentColor"
    />
  </svg>
);
const IconTarget = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...p}>
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="1.5" fill="currentColor" />
  </svg>
);
const IconCoffee = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...p}>
    <path
      d="M3 8h13v5a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5V8Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path d="M16 9h2.5a2.5 2.5 0 1 1 0 5H16" stroke="currentColor" strokeWidth="1.5" />
    <path
      d="M7 4s1 1 0 2m4-2s1 1 0 2m4-2s1 1 0 2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
const IconTrophy = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...p}>
    <path
      d="M6 3h12v3a6 6 0 0 1-6 6 6 6 0 0 1-6-6V3Z"
      stroke="currentColor"
      strokeWidth="1.5"
    />
    <path d="M9 21h6M9 18h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path
      d="M18 6h2a2 2 0 0 1-2 2M6 6H4a2 2 0 0 0 2 2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
    />
  </svg>
);
const IconLayers = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...p}>
    <path d="M12 3 3 8l9 5 9-5-9-5Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M3 12l9 5 9-5M3 16l9 5 9-5" stroke="currentColor" strokeWidth="1.5" opacity=".6" />
  </svg>
);

/* ==================== Helpers ==================== */
const pad2 = (n: number) => n.toString().padStart(2, "0");
const fmtClock = (tf: TimeFmt) => (tf === "12" ? "hh:mm A" : "HH:mm");
const getParam = (k: string) => new URLSearchParams(location.search).get(k);
const formatSplit = (ms: number) => {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return { h: pad2(h), m: pad2(m), s: pad2(s) };
};
function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Itinerario (máx 3) — FIX incluido */
function computeSchedule(t: DisplayTournament, tf: TimeFmt) {
  const items: { label: string; time: string }[] = [];
  let base = Date.now();

  const inSomething =
    t.timer.target !== null && (t.timer.running || t.timer.remainingMs > 0);
  const inRound = inSomething && t.timer.mode === "round";
  const currentIndex = inRound ? t.roundsCompleted + 1 : t.roundsCompleted;

  const remaining = inSomething ? Math.max(0, (t.timer.target ?? 0) - base) : 0;
  if (remaining > 0) {
    items.push({
      label:
        t.timer.mode === "break"
          ? "Fin break"
          : `Fin ronda ${inRound ? currentIndex : currentIndex + 1}`,
      time: dayjs(base + remaining).format(fmtClock(tf)),
    });
    base += remaining;
  }

  const left = Math.max(0, t.roundsTotal - currentIndex);
  for (let i = 1; i <= left; i++) {
    if (t.breakEnabled && t.breakMinutes > 0) {
      base += t.breakMinutes * 60_000;
      items.push({ label: "Break", time: dayjs(base).format(fmtClock(tf)) });
    }
    base += t.roundMinutes * 60_000;
    items.push({
      label: `Fin ronda ${currentIndex + i}`,
      time: dayjs(base).format(fmtClock(tf)),
    });
  }
  return items.slice(0, 3);
}

type TimelineEntry = { label: string; time: string; kind: 'roundEnd'|'breakStart'|'breakEnd'|'eventEnd' };

/** Timeline detallada de próximos eventos (incluye fin de la ronda actual, breaks, fin de cada ronda y fin del evento) */
function computeTimeline(t: DisplayTournament, tf: TimeFmt) {
  const items: TimelineEntry[] = [];
  let base = Date.now();

  const inSomething = t.timer.target !== null && (t.timer.running || t.timer.remainingMs > 0);
  const inRound = inSomething && t.timer.mode === "round";
  const currentIndex = inRound ? t.roundsCompleted + 1 : t.roundsCompleted;

  // Si hay algo corriendo, agrega el fin de ese bloque (ronda o break)
  const remaining = inSomething ? Math.max(0, (t.timer.target ?? 0) - base) : 0;
  if (remaining > 0) {
    items.push({
      label: t.timer.mode === 'break' ? 'Fin del break' : `Fin ronda ${inRound ? currentIndex : currentIndex + 1}`,
      time: dayjs(base + remaining).format(fmtClock(tf)),
      kind: t.timer.mode === 'break' ? 'breakEnd' : 'roundEnd',
    });
    base += remaining;
  }

  // Para las rondas restantes, agregar bloques de break (inicio/fin) y fin de ronda
  const left = Math.max(0, t.roundsTotal - currentIndex);
  for (let i = 1; i <= left; i++) {
    if (t.breakEnabled && t.breakMinutes > 0) {
      // Inicio de break (coincide con el fin de la ronda previa)
      items.push({ label: 'Inicio del break', time: dayjs(base).format(fmtClock(tf)), kind: 'breakStart' });
      base += t.breakMinutes * 60_000;
      items.push({ label: 'Fin del break', time: dayjs(base).format(fmtClock(tf)), kind: 'breakEnd' });
    }
    base += t.roundMinutes * 60_000;
    items.push({ label: `Fin ronda ${currentIndex + i}`, time: dayjs(base).format(fmtClock(tf)), kind: 'roundEnd' });
  }

  // Fin del evento (siempre al final de toda la secuencia)
  if (t.roundsTotal > 0) {
    items.push({ label: 'Fin del evento', time: dayjs(base).format(fmtClock(tf)), kind: 'eventEnd' });
  }

  // Limitar a un número razonable para UI
  return items.slice(0, 8);
}

/* ==================== Tokens de tema (solo Tailwind) ==================== */
const pick = (isLight: boolean, light: string, dark: string) => (isLight ? light : dark);

/* ==================== Mini componentes (tema-aware) ==================== */
interface PillProps { children: React.ReactNode; isLight: boolean }
const Pill = ({ children, isLight }: PillProps) => (
  <span
    className={pick(
      isLight,
      "inline-flex items-center gap-2 rounded-full bg-zinc-100 text-zinc-800 ring-1 ring-zinc-200 px-3 py-1 text-sm",
      "inline-flex items-center gap-2 rounded-full bg-zinc-800/60 text-zinc-100 ring-1 ring-zinc-700 px-3 py-1 text-sm"
    )}
  >
    {children}
  </span>
);

interface StatCardProps { label: string; children: React.ReactNode; isLight: boolean }
const StatCard = ({ label, children, isLight }: StatCardProps) => (
  <div
    className={`stat-card ${isLight ? "stat-card--light" : "stat-card--dark"}`}
  >
    <div className={pick(isLight, "stat-card-label text-zinc-500", "stat-card-label text-zinc-400")}>{label}</div>
    <div className={pick(isLight, "stat-card-value text-zinc-900", "stat-card-value text-white")}>{children}</div>
  </div>
);

const TimeBlock = ({
  value,
  label,
  accent,
  isLight,
}: {
  value: string;
  label: string;
  accent: "indigo" | "amber";
  isLight: boolean;
}) => {
  const palette =
    accent === "amber"
      ? isLight
        ? ["#f59e0b", "#fbbf24"]
        : ["#facc15", "#fb923c"]
      : isLight
      ? ["#2563eb", "#7c3aed"]
      : ["#22d3ee", "#8b5cf6"];

  return (
    <div
      className={`timer-segment ${isLight ? "timer-segment--light" : "timer-segment--dark"}`}
      style={{
        ["--segment-accent" as any]: palette[0],
        ["--segment-accent-soft" as any]: palette[1],
      }}
    >
      <span className={`timer-segment-value ${isLight ? "timer-segment-value--light" : "timer-segment-value--dark"}`}>
        {value}
      </span>
      <span className={`timer-segment-label ${isLight ? "timer-segment-label--light" : "timer-segment-label--dark"}`}>
        {label}
      </span>
    </div>
  );
};

const PageDots: React.FC<{ count: number; index: number; isLight: boolean }> = ({
  count,
  index,
  isLight,
}) => {
  if (count <= 1) return null;
  return (
    <div className="absolute -top-5 right-1 flex items-center gap-1.5 pointer-events-none">
      {Array.from({ length: count }).map((_, i) => (
        <span
          key={i}
          className={pick(
            isLight,
            `h-1.5 w-3 rounded-full transition-all ${i === index ? "bg-zinc-700" : "bg-zinc-300"}`,
            `h-1.5 w-3 rounded-full transition-all ${i === index ? "bg-zinc-300" : "bg-zinc-600"}`
          )}
          style={{ opacity: i === index ? 1 : 0.75 }}
        />
      ))}
    </div>
  );
};

/* ==================== Mapa de Rondas ==================== */
const RoundMap: React.FC<{ t: DisplayTournament; isLight: boolean }> = ({ t, isLight }) => {
  const inSomething = t.timer.target !== null && (t.timer.running || t.timer.remainingMs > 0);
  const inRound = inSomething && t.timer.mode === 'round';
  const currentIndex = inRound ? t.roundsCompleted + 1 : t.roundsCompleted; // 1-based cuando en ronda
  const total = Math.max(0, t.roundsTotal);
  const rounds = Array.from({ length: total }, (_, i) => i + 1);

  return (
    <div className="flex flex-wrap items-center gap-2">
      {rounds.map((i) => {
        const done = i <= t.roundsCompleted;
        const current = inRound && i === currentIndex;
        const upcoming = !done && !current;
        const baseClassLight = "inline-flex items-center gap-2 rounded-xl ring-1 px-3 py-1.5 text-sm";
        const baseClassDark = "inline-flex items-center gap-2 rounded-xl ring-1 px-3 py-1.5 text-sm";
        const cls = pick(
          isLight,
          done
            ? `${baseClassLight} bg-emerald-50 ring-emerald-200 text-emerald-700`
            : current
            ? `${baseClassLight} bg-indigo-50 ring-indigo-200 text-indigo-700 shadow-sm`
            : `${baseClassLight} bg-white ring-zinc-200 text-zinc-700`,
          done
            ? `${baseClassDark} bg-emerald-900/30 ring-emerald-700 text-emerald-300`
            : current
            ? `${baseClassDark} bg-indigo-900/30 ring-indigo-700 text-indigo-300 shadow-sm`
            : `${baseClassDark} bg-zinc-800/60 ring-zinc-700 text-zinc-200`
        );
        return (
          <React.Fragment key={i}>
            <span className={cls}>
              {done ? (
                <span aria-hidden>✅</span>
              ) : current ? (
                <span className="relative inline-flex">
                  <span className="status-dot bg-indigo-500" />
                  <span className="status-ping bg-indigo-500" />
                </span>
              ) : (
                <span aria-hidden>•</span>
              )}
              <span>Ronda {i}</span>
            </span>
            {t.breakEnabled && t.breakMinutes > 0 && i < total && (
              <span
                className={pick(
                  isLight,
                  "inline-flex items-center gap-1 rounded-full bg-amber-50 ring-1 ring-amber-200 text-amber-700 px-2 py-1 text-[12px]",
                  "inline-flex items-center gap-1 rounded-full bg-amber-900/20 ring-1 ring-amber-700 text-amber-300 px-2 py-1 text-[12px]"
                )}
                title={`Break de ${t.breakMinutes} min`}
              >
                <IconCoffee className={pick(isLight, "size-3.5 text-amber-600", "size-3.5 text-amber-300")} />
                {t.breakMinutes}m
              </span>
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/* ==================== Super Header (solo visual) ==================== */
const SuperHeader: React.FC<{
  isLight: boolean;
  now: number;
  timeFmt: TimeFmt;
  stateLabel: string;
  disableFX: boolean;
}> = ({ isLight, now, timeFmt, stateLabel, disableFX }) => {
  const dotClass =
    stateLabel === "En curso"
      ? "bg-emerald-500"
      : stateLabel === "Pausado"
      ? "bg-amber-500"
      : stateLabel === "Terminado"
      ? "bg-rose-500"
      : "bg-zinc-400";

  return (
    <div
      className={[
        "ux-header relative overflow-hidden rounded-3xl mb-6",
        isLight ? "border border-zinc-200 bg-white/70 ring-1 ring-black/5" : "border border-zinc-800 bg-zinc-900/60",
      ].join(" ")}
    >
      {!disableFX && (
        <>
          <div className="ux-foil" aria-hidden />
          <div className={`ux-aurora ${isLight ? "ux-aurora--light" : ""}`} aria-hidden />
          <div className="ux-grid" aria-hidden />
          <div className="ux-sheen" aria-hidden />
        </>
      )}

      <div className="relative z-10 flex items-center gap-4 flex-wrap p-4 md:p-5">
        <div className="flex items-center gap-2 md:gap-3">
          <span className="brand-mark brand-mark--blend" aria-label="SIGAD">
            <BrandLogo size={44} />
          </span>
          <div className={isLight ? "text-xl md:text-2xl font-extrabold tracking-tight text-zinc-900" : "text-xl md:text-2xl font-extrabold tracking-tight"}>
            <span
              className={[
                "bg-clip-text text-transparent",
                isLight
                  ? "bg-gradient-to-r from-zinc-900 via-zinc-700 to-zinc-500"
                  : "bg-gradient-to-r from-white via-zinc-200 to-white/60",
              ].join(" ")}
            >
              SIGAD • LIVE HUD
            </span>
          </div>
        </div>

        <div className="ml-auto flex items-center gap-2 md:gap-3">
          <span
            className={[
              "inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ring-1",
              isLight ? "bg-zinc-100 text-zinc-700 ring-zinc-200" : "bg-zinc-800/60 text-zinc-200 ring-zinc-700",
            ].join(" ")}
          >
            <span className="relative inline-flex">
              <span className={["status-dot", dotClass].join(" ")} />
              {(stateLabel === "En curso" || stateLabel === "Pausado") && (
                <span className={["status-ping", stateLabel === "En curso" ? "bg-emerald-500" : "bg-amber-500"].join(" ")} />
              )}
            </span>
            {stateLabel}
          </span>

          <span
            className={[
              "hidden md:inline-flex items-center gap-2 rounded-full px-3 py-1 text-[11px] font-semibold ring-1",
              isLight ? "bg-white/70 ring-zinc-200 text-zinc-700" : "bg-zinc-800/60 ring-zinc-700",
            ].join(" ")}
          >
            <IconClock className={isLight ? "size-3.5 text-zinc-500" : "size-3.5 text-zinc-400"} />
            {dayjs(now).format(timeFmt === "12" ? "ddd, DD MMM • hh:mm:ss A" : "ddd, DD MMM • HH:mm:ss")}
          </span>
        </div>
      </div>
    </div>
  );
};

/* ==================== Notificaciones (ANNOUNCE) ==================== */
type AnnItem = { id: number; text: string; level: "info" | "warn" | "success"; duration: number };

type ActiveAdv = {
  id: string; // target tournament id or 'global'
  kind: 'text'|'image'|'url';
  text?: string;
  imageDataUrl?: string;
  imageAspect?: string;
  url?: string;
  interactive?: boolean;
  persistent: boolean;
};

const AnnounceHost: React.FC<{ tournaments?: DisplayTournament[]; isLight?: boolean; onMetrics?: (w: number, open: boolean)=>void }>=({ tournaments, isLight, onMetrics }) => {
  // Legacy short toasts
  const [items, setItems] = useState<AnnItem[]>([]);
  const idRef = useRef(1);

  // Advanced announcements: keep only one per display at a time.
  const [active, setActive] = useState<ActiveAdv | null>(null);
  const PERSIST_KEY = 'sigad_display_adv_ann_v1';
  // Allow any URL; interaction controlled by 'interactive' flag per announcement
  // Panel open/close persisted
  const PANEL_KEY = 'sigad_display_ann_open_v1';
  const [open, setOpen] = useState<boolean>(()=>{ try { return JSON.parse(localStorage.getItem(PANEL_KEY) || 'false'); } catch { return false; } });
  useEffect(()=>{ try { localStorage.setItem(PANEL_KEY, JSON.stringify(open)); } catch {} }, [open]);
  // Auto-open when active exists; auto-hide when none (but respect explicit toggle once user interacts)
  useEffect(()=>{
    if (active && !open) setOpen(true);
    if (!active && open) setOpen(false);
  }, [active]);

  // Load persistent announcement from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PERSIST_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as ActiveAdv | null;
      if (parsed) setActive(parsed);
    } catch {}
  }, []);

  useEffect(() => {
    const off = subscribeAnnouncements((a) => {
      const id = idRef.current++;
      const item: AnnItem = { id, text: a.text, level: a.level, duration: Math.max(1000, a.duration || 8000) };
      setItems((prev) => [item, ...prev].slice(0, 4));
      const t = setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), item.duration);
      return () => clearTimeout(t);
    });
    return off;
  }, []);

  useEffect(() => {
  const off2 = subscribeAdvancedAnnouncements((m) => {
      // If the message has targets and this display has tournaments, check membership
      const thisIds = (tournaments || []).map(t => t.id);
      const targetAll = !m.targets || m.targets.length === 0;
      const matches = targetAll || m.targets!.some(id => thisIds.includes(id));
      if (!matches) return;

      // Only one active advanced announcement per display. Replace previous.
      const id = m.targets && m.targets.length === 1 ? m.targets[0] : 'global';
      const adv: ActiveAdv = {
        id,
        kind: m.kind,
        text: m.payload.text,
        imageDataUrl: m.payload.imageDataUrl,
        imageAspect: m.payload.imageAspect,
        url: m.payload.url,
        interactive: (m.payload as any)?.interactive ? true : false,
        persistent: !!m.persistent,
      };
  setActive(adv);
  setOpen(true);

  // If persistent, save to localStorage so it survives reloads
      try {
        if (adv.persistent) {
          localStorage.setItem(PERSIST_KEY, JSON.stringify(adv));
        } else {
          // If not persistent, clear any stored persistent announcement for this display
          const raw = localStorage.getItem(PERSIST_KEY);
          if (raw) {
            try {
              const prev = JSON.parse(raw) as ActiveAdv | null;
              if (prev && prev.id === adv.id) localStorage.removeItem(PERSIST_KEY);
            } catch {}
          }
        }
      } catch {}

      return undefined;
    });
    return off2;
  }, [tournaments]);

  // Handle CLEAR advanced announcement messages
  useEffect(() => {
    const off = subscribeClearAnnouncements((m) => {
      const thisIds = (tournaments || []).map(t => t.id);
      const targetAll = !m.targets || m.targets.length === 0;
      const matches = targetAll || m.targets!.some(id => thisIds.includes(id));
      if (!matches) return;
      try { localStorage.removeItem(PERSIST_KEY); } catch {}
      setActive(null);
      setOpen(false);
    });
    return off;
  }, [tournaments]);

  const closeToast = (id: number) => setItems((prev) => prev.filter((x) => x.id !== id));
  const tone = (lvl: AnnItem["level"]) =>
    lvl === "success" ? ["#059669", "#10b981"] : lvl === "warn" ? ["#b45309", "#f59e0b"] : ["#3730a3", "#6366f1"];

  // Render Announcement Panel within layout (toggleable) + legacy toasts top-right.
  const asideRef = useRef<HTMLDivElement | null>(null);
  // Drawer sizing responsive to viewport
  const computeDrawerWidth = () => {
    const vw = typeof window !== 'undefined' ? window.innerWidth : 1280;
    // 30-36% del viewport, clamp a [280, 520]
    const base = vw * 0.34;
    return Math.round(Math.min(520, Math.max(280, base)));
  };
  const computeImageMaxH = () => {
    const vh = typeof window !== 'undefined' ? window.innerHeight : 900;
    // 52-60% de la altura de la ventana, clamp a [240, 640]
    const base = vh * 0.56;
    return Math.round(Math.min(640, Math.max(240, base)));
  };
  const [drawerW, setDrawerW] = useState<number>(computeDrawerWidth());
  const [imgMaxH, setImgMaxH] = useState<number>(computeImageMaxH());
  useEffect(()=>{
    const onR = () => { setDrawerW(computeDrawerWidth()); setImgMaxH(computeImageMaxH()); };
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, []);
  // Reportar dimensiones al display para empujar layout
  useEffect(()=>{
    const el = asideRef.current;
    const send = () => {
      if (!onMetrics) return;
      if (active && open && el) {
        const w = Math.round(el.getBoundingClientRect().width);
        // Empuja usando el ancho real del cajón + margen pequeño
        const pad = w + 16;
        onMetrics(pad, true);
      } else {
        onMetrics(0, false);
      }
    };
    send();
    const ro = el && 'ResizeObserver' in window ? new ResizeObserver(send) : null;
    if (el && ro) ro.observe(el);
    const rsz = () => send();
    window.addEventListener('resize', rsz);
    return ()=>{ window.removeEventListener('resize', rsz); if (el && ro) ro.disconnect(); };
  }, [active, open, onMetrics]);

  return (
    <>
      {/* Overlay para énfasis y cerrar al click */}
      {active && (
        <div
          className="fixed inset-0 z-30"
          style={{ background: open ? 'rgba(0,0,0,.08)' : 'transparent', transition: 'background .25s ease', pointerEvents: open ? 'auto' : 'none' }}
          onClick={()=>setOpen(false)}
        />
      )}
      {/* Drawer lateral (right) */}
      {active && (
          <aside
            className={pick(
              isLight ?? false,
              "fixed top-4 right-0 z-40 overflow-hidden rounded-l-2xl border border-zinc-200 bg-white/80 shadow-xl backdrop-blur",
              "fixed top-4 right-0 z-40 overflow-hidden rounded-l-2xl border border-zinc-800 bg-zinc-900/70 shadow-xl backdrop-blur"
            )}
            ref={asideRef}
            style={{ width: drawerW, transform: open ? 'translateX(0)' : 'translateX(100%)', transition: 'transform .35s ease' }}
            aria-live="polite"
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-zinc-700/30">
              <span className={pick(isLight ?? false, "text-zinc-700 font-semibold", "font-semibold")}>Anuncio</span>
              <span className={pick(isLight ?? false, "text-[12px] text-zinc-500", "text-[12px] text-zinc-400")}>
                {active.persistent ? "Persistente" : "Temporal"}
              </span>
              <button
                className={pick(isLight ?? false, "ml-auto text-[12px] px-3 py-1 rounded border border-zinc-300 hover:bg-zinc-100", "ml-auto text-[12px] px-3 py-1 rounded border border-zinc-700 hover:bg-zinc-800/70")}
                onClick={()=>setOpen(o=>!o)}
                aria-expanded={open}
              >
                {open ? 'Ocultar' : 'Mostrar'}
              </button>
            </div>
            {open && (
              <div className="p-4">
                {active.kind === 'text' && (
                  <div className={pick(isLight ?? false, "text-center text-zinc-800 text-lg font-bold leading-snug", "text-center text-lg font-bold leading-snug")}>{active.text}</div>
                )}
                {active.kind === 'image' && active.imageDataUrl && (
                  <div className="flex flex-col items-center gap-2">
                    <img src={active.imageDataUrl} alt="Anuncio" style={{ maxWidth: '100%', maxHeight: imgMaxH, objectFit: 'contain', borderRadius: 12 }} />
                    {active.text && <div className={pick(isLight ?? false, "text-[13px] text-zinc-600 text-center", "text-[13px] text-zinc-400 text-center")}>{active.text}</div>}
                  </div>
                )}
                {active.kind === 'url' && active.url && (
                  <div style={{ width: '100%', height: 420, borderRadius: 10, overflow: 'hidden' }}>
                    <iframe
                      src={active.url}
                      style={{ width: '100%', height: '100%', border: 0 }}
                      title="Anuncio especial"
                      {...(active.interactive ? {} : { sandbox: 'allow-scripts allow-same-origin allow-forms allow-popups' })}
                    />
                  </div>
                )}
              </div>
            )}
          </aside>
        )}

      {items.length > 0 && (
        <div className="sigad-noti-stack tr" style={{ zIndex: 3000 }} aria-live="polite">
          {items.map((it) => {
            const [c1, c2] = tone(it.level);
            const style: React.CSSProperties = {
              ["--accent" as any]: c1,
              ["--accent2" as any]: c2,
              ["--life" as any]: `${it.duration}ms`,
            };
            return (
              <div key={it.id} className="sigad-noti sigad-noti-enter" style={style}>
                <div className="sigad-noti-progress" />
                <div className="sigad-noti-accent" />
                <div className="sigad-noti-body">
                  <div className="sigad-noti-icon" aria-hidden>
                    {it.level === "success" ? "✅" : it.level === "warn" ? "⚠️" : "📢"}
                  </div>
                  <div className="sigad-noti-content">
                    <div className="sigad-noti-text">{it.text}</div>
                  </div>
                  <button className="sigad-noti-close" aria-label="Cerrar" onClick={() => closeToast(it.id)}>
                    ✕
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
};

/* ==================== Display Root ==================== */
const Display: React.FC = () => {
  useEffect(()=>{ try { dayjs.locale('es'); } catch{} }, []);
  const [timeFmt, setTimeFmt] = useState<TimeFmt>("24");
  const [tournaments, setTournaments] = useState<DisplayTournament[]>([]);
  const [connected, setConnected] = useState(false); // reservado por si muestras estado de conexión
  const [page, setPage] = useState(0);

  const fixedId = useRef<string | null>(getParam("id"));
  const disableFX = getParam("nofx") === "1";

  const [now, setNow] = useState<number>(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const unsub = subscribeDisplay((s) => {
      setConnected(true);
      setTimeFmt(s.timeFmt);
      setTournaments(s.tournaments || []);
    });
    return unsub;
  }, []);

  const active: DisplayTournament | null = useMemo(() => {
    if (fixedId.current) return tournaments.find((t) => t.id === fixedId.current) || null;
    const running = tournaments.find((t) => t.timer.running);
    return running || tournaments[0] || null;
  }, [tournaments]);

  const remaining = useMemo(() => {
    if (!active?.timer) return 0;
    const { target, remainingMs, running } = active.timer;
    if (target && running) return Math.max(0, target - Date.now());
    return Math.max(0, remainingMs || 0);
  }, [active, now]);
  const { h, m, s } = formatSplit(remaining);
  const timeline = active ? computeTimeline(active, timeFmt) : [];
  const schedule = active ? computeSchedule(active, timeFmt) : [];

  const progressPct = useMemo(() => {
    if (!active) return 0;
    const total =
      active.timer.mode === "break"
        ? Math.max(1, active.breakMinutes * 60_000)
        : Math.max(1, active.roundMinutes * 60_000);
    const p = total > 0 ? 100 - Math.round((remaining / total) * 100) : 0;
    return Math.min(100, Math.max(0, p));
  }, [active, remaining]);

  const cycleKey = active ? `${active.id}-${active.timer.mode}-${active.timer.target ?? 0}` : "none";

  const [displayPct, setDisplayPct] = useState(0);
  const lastKeyRef = useRef(cycleKey);
  useEffect(() => {
    if (cycleKey !== lastKeyRef.current) {
      lastKeyRef.current = cycleKey;
      setDisplayPct(0);
      requestAnimationFrame(() => setDisplayPct(progressPct));
    } else {
      setDisplayPct((prev) => Math.max(prev, progressPct));
    }
  }, [cycleKey, progressPct]);

  const prevShownRef = useRef(0);
  const transitionClass = useMemo(() => {
    const prev = prevShownRef.current;
    const increasing = displayPct >= prev;
    return increasing || displayPct === 0 ? "transition-width" : "no-transition";
  }, [displayPct]);
  useEffect(() => {
    prevShownRef.current = displayPct;
  }, [displayPct]);

  const stateLabel = useMemo(() => {
    if (!active) return "-";
    const expired = !active.timer.running && active.timer.target !== null && remaining <= 0;
    return expired ? "Terminado" : active.timer.running ? "En curso" : active.timer.target ? "Pausado" : "Sin iniciar";
  }, [active, remaining]);

  const accent: "indigo" | "amber" = active?.timer.mode === "break" ? "amber" : "indigo";
  const isLight = active?.theme === "light";
  const accentPalette = accent === "amber"
    ? {
        primary: isLight ? "#f59e0b" : "#facc15",
        secondary: isLight ? "#fbbf24" : "#fb923c",
      }
    : {
        primary: isLight ? "#2563eb" : "#22d3ee",
        secondary: isLight ? "#7c3aed" : "#8b5cf6",
      };
  const roundIndex = active ? (active.timer.mode === "round" ? active.roundsCompleted + 1 : active.roundsCompleted) : 0;
  const hasRounds = !!active && active.roundsTotal > 0;
  const displayRoundIndex = hasRounds ? Math.min(Math.max(roundIndex, 1), active?.roundsTotal ?? 1) : roundIndex;
  const roundSummary = !active
    ? "-"
    : active.timer.mode === "break"
    ? active.breakEnabled && active.breakMinutes > 0
      ? `Break • ${active.breakMinutes} min`
      : "Break en curso"
    : hasRounds
    ? `Ronda ${displayRoundIndex} / ${active.roundsTotal}`
    : "Rondas sin configurar";

  // ===== Zoom de display controlado por App (por torneo) =====
  const ZOOM_LS = 'sigad_display_zoom_v2';
  const fixedParamId = useRef<string | null>(getParam('id'));
  const readObj = (k: string) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch { return {}; } };
  const [zoomMap, setZoomMap] = useState<Record<string, number>>(() => readObj(ZOOM_LS));
  const activeId = useMemo(() => fixedParamId.current || active?.id || 'global', [active?.id]);
  const currentZoom = useMemo(() => {
    const z = Number(zoomMap[activeId] ?? (fixedParamId.current ? 1 : zoomMap['global'] ?? 1));
    return Number.isFinite(z) && z > 0 ? Math.max(0.01, z) : 1;
  }, [zoomMap, activeId]);
  useEffect(() => { try { localStorage.setItem(ZOOM_LS, JSON.stringify(zoomMap)); } catch {} }, [zoomMap]);
  useEffect(() => {
    const off = subscribeDisplayZoom((m) => {
      // Si no hay targets => usar clave 'global'. Si hay, actualizar por id.
      const z = Math.max(0.01, Number(m.zoom) || 1);
      setZoomMap(prev => {
        const next = { ...prev } as Record<string, number>;
        if (!m.targets || m.targets.length === 0) {
          next['global'] = z;
        } else {
          for (const id of m.targets) next[id] = z;
        }
        return next;
      });
    });
    return off;
  }, []);

  const pages = useMemo(() => chunk(tournaments, 3), [tournaments]);
  useEffect(() => {
    setPage(0);
  }, [tournaments.length]);
  useEffect(() => {
    if (fixedId.current) return;
    if (pages.length <= 1) return;
    const id = setInterval(() => setPage((p) => (p + 1) % pages.length), 7000);
    return () => clearInterval(id);
  }, [pages.length]);

  const [drawerPad, setDrawerPad] = useState(0);
  // Escala automática basada en resolución de pantalla y ancho del drawer
  const [autoScale, setAutoScale] = useState(1);
  const computeAutoScale = React.useCallback(() => {
    const BASE_W = 1280; // ancho objetivo del layout principal
    const BASE_H = 900;  // altura objetivo aproximada
    const availW = Math.max(320, window.innerWidth - drawerPad - 24);
    const availH = Math.max(320, window.innerHeight - 24);
    const s = Math.min(1, availW / BASE_W, availH / BASE_H);
    setAutoScale(s);
  }, [drawerPad]);
  useEffect(() => {
    computeAutoScale();
    const onR = () => computeAutoScale();
    window.addEventListener('resize', onR);
    return () => window.removeEventListener('resize', onR);
  }, [computeAutoScale]);

  const scale = Math.max(0.01, autoScale * currentZoom);
  return (
    <div
      className={pick(
        isLight ?? false,
        "min-h-screen w-full relative overflow-hidden light text-zinc-900 bg-gradient-to-b from-white via-zinc-50 to-zinc-100",
        "min-h-screen w-full relative overflow-hidden text-zinc-100 bg-gradient-to-b from-slate-950 via-neutral-950 to-black"
      )}
    >
      {/* Fondo */}
      <div className="pointer-events-none absolute inset-0">
        <div
          className={pick(
            isLight ?? false,
            "bg-grid opacity-[0.035] absolute inset-0",
            `bg-grid ${disableFX ? "" : "animate-gridPan"} opacity-[0.05] absolute inset-0`
          )}
        />
        {!disableFX && <div className={pick(isLight ?? false, "noise-layer opacity-[.04]", "noise-layer opacity-10")} />}
        <div className={pick(isLight ?? false, "bg-logo bg-logo--light", "bg-logo")} />
        {!disableFX && <div className={pick(isLight ?? false, "scanlines opacity-[.03]", "scanlines opacity-[.06]")} />}
        {!disableFX && (
          <>
            <div className={pick(isLight ?? false, "orb orb--indigo orb--soft", "orb orb--indigo")} />
            <div className={pick(isLight ?? false, "orb orb--pink orb--soft", "orb orb--pink")} />
            <div className={pick(isLight ?? false, "orb orb--cyan orb--soft", "orb orb--cyan")} />
          </>
        )}
        {!disableFX && (
          <>
            <div className={pick(isLight ?? false, "ambient-rail ambient-rail--left ambient-rail--light", "ambient-rail ambient-rail--left")} />
            <div className={pick(isLight ?? false, "ambient-rail ambient-rail--right ambient-rail--light", "ambient-rail ambient-rail--right")} />
          </>
        )}
      </div>

      <div className="relative z-20">
  <div className="relative" style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: `${100/scale}%` }}>
  <div className="max-w-7xl mx-auto px-6 py-8" style={{ marginRight: drawerPad ? `${Math.round(drawerPad / scale)}px` : undefined, transition: 'margin-right .3s ease' }}>
        {/* Notificaciones HUD (solo toasts legacy) */}

        {/* === HEADER SUPER VISUAL === */}
        <SuperHeader
          isLight={!!isLight}
          now={now}
          timeFmt={timeFmt}
          stateLabel={stateLabel}
          disableFX={disableFX}
        />

        {/* Si no hay torneo */}
        {!active && (
          <div
            className={pick(
              isLight ?? false,
              "rounded-3xl border border-zinc-200 bg-white/75 shadow-sm p-10 text-center",
              "rounded-3xl border border-zinc-800 bg-zinc-900/60 p-10 text-center"
            )}
          >
            <IconTrophy className={pick(isLight ?? false, "mx-auto mb-3 size-8 text-zinc-500", "mx-auto mb-3 size-8 text-zinc-400")} />
            <p className={pick(isLight ?? false, "text-zinc-700", "text-zinc-200")}>No hay torneos para mostrar todavía.</p>
          </div>
        )}

        {/* HUD principal */}
        {active && (
          <section className={`hud-shell ${isLight ? "hud-shell--light" : "hud-shell--dark"} sweep`}>
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
              <div
                className={`hud-hero ${isLight ? "hud-hero--light" : "hud-hero--dark"}`}
                style={{
                  ["--hero-accent" as any]: accentPalette.primary,
                  ["--hero-accent-soft" as any]: accentPalette.secondary,
                }}
              >
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <Pill isLight={!!isLight}>
                    <IconTrophy className={pick(!!isLight, "size-4 text-zinc-500", "size-4 text-zinc-300")} /> {active.game}
                  </Pill>
                  <span className={pick(!!isLight, "inline-flex items-center gap-2 text-zinc-600", "inline-flex items-center gap-2 text-zinc-300")}>
                    <IconLayers className={pick(!!isLight, "size-4 text-zinc-500", "size-4 text-zinc-400")} />
                    {roundSummary}
                  </span>
                  <span className={pick(!!isLight, "ml-auto inline-flex items-center gap-2 text-zinc-600", "ml-auto inline-flex items-center gap-2 text-zinc-300")}>
                    <IconTarget className={pick(!!isLight, "size-4 text-zinc-500", "size-4 text-zinc-400")} />
                    Objetivo: {active.timer.target ? dayjs(active.timer.target).format(fmtClock(timeFmt)) : "-"}
                  </span>
                </div>

                <h1 className={pick(!!isLight, "hero-title text-zinc-900", "hero-title text-white")}>
                  <span className="hero-title-gradient">{active.name}</span>
                </h1>

                <div className="timer-hero" aria-live="polite">
                  {[
                    { value: h, label: "HORAS" },
                    { value: m, label: "MINUTOS" },
                    { value: s, label: "SEGUNDOS" },
                  ].map((seg, idx) => (
                    <React.Fragment key={seg.label}>
                      <TimeBlock value={seg.value} label={seg.label} accent={accent} isLight={!!isLight} />
                      {idx < 2 && <span className="timer-hero-colon" aria-hidden>:</span>}
                    </React.Fragment>
                  ))}
                </div>

                <div className="hero-progress">
                  <div className={pick(!!isLight, "flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-zinc-500", "flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-zinc-400")}>
                    <span>Tiempo en curso</span>
                    <span>{Math.round(displayPct)}%</span>
                  </div>
                  <div className="hero-progress-track">
                    <div
                      className={`hero-progress-fill ${transitionClass}`}
                      style={{
                        width: `${displayPct}%`,
                        ["--hero-accent" as any]: accentPalette.primary,
                        ["--hero-accent-soft" as any]: accentPalette.secondary,
                      }}
                    />
                    <span className="hero-progress-glow" aria-hidden />
                  </div>
                  <div className={pick(!!isLight, "mt-2 text-sm text-zinc-600", "mt-2 text-sm text-zinc-300")}>
                    {active.timer.mode === "break"
                      ? "Break en progreso"
                      : roundIndex > 0
                      ? `Ronda ${displayRoundIndex} en progreso`
                      : hasRounds
                      ? "Ronda en preparación"
                      : "Sin rondas configuradas"}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                  <StatCard label="Estado" isLight={!!isLight}>
                    <span
                      className={(() => {
                        const base = "inline-flex items-center gap-2";
                        if (stateLabel === "En curso") return pick(!!isLight, `${base} text-emerald-600`, `${base} text-emerald-400`);
                        if (stateLabel === "Pausado") return pick(!!isLight, `${base} text-amber-600`, `${base} text-amber-400`);
                        if (stateLabel === "Terminado") return pick(!!isLight, `${base} text-rose-600`, `${base} text-rose-400`);
                        return pick(!!isLight, `${base} text-zinc-800`, `${base} text-zinc-100`);
                      })()}
                    >
                      <span className="relative inline-flex">
                        <span
                          className={(() => {
                            if (stateLabel === "En curso") return "status-dot bg-emerald-500";
                            if (stateLabel === "Pausado") return "status-dot bg-amber-500";
                            if (stateLabel === "Terminado") return "status-dot bg-rose-500";
                            return "status-dot bg-zinc-400";
                          })()}
                        />
                        {(stateLabel === "En curso" || stateLabel === "Pausado") && (
                          <span className={stateLabel === "En curso" ? "status-ping bg-emerald-500" : "status-ping bg-amber-500"} />
                        )}
                      </span>
                      {stateLabel}
                    </span>
                  </StatCard>

                  <StatCard label="ETA fin torneo" isLight={!!isLight}>
                    {(() => {
                      const perRound = active.roundMinutes * 60_000;
                      const perBreak = (active.breakEnabled ? active.breakMinutes : 0) * 60_000;
                      const inRound =
                        active.timer.target !== null &&
                        (active.timer.running || active.timer.remainingMs > 0) &&
                        active.timer.mode === "round";
                      const left =
                        active.roundsTotal - (inRound ? active.roundsCompleted + 1 : active.roundsCompleted);
                      const eta =
                        remaining +
                        Math.max(0, left) * (perRound + (active.breakEnabled && active.breakMinutes > 0 ? perBreak : 0));
                      return eta > 0 ? dayjs(Date.now() + eta).format(fmtClock(timeFmt)) : "-";
                    })()}
                  </StatCard>

                  <StatCard label="Duración ronda" isLight={!!isLight}>
                    {active.roundMinutes} min
                  </StatCard>

                  <StatCard label="Break" isLight={!!isLight}>
                    <span className={pick(!!isLight, "inline-flex items-center gap-2 text-zinc-700", "inline-flex items-center gap-2 text-zinc-200")}>
                      <IconCoffee className={pick(!!isLight, "size-4 text-zinc-500", "size-4 text-zinc-400")} />
                      {active.breakEnabled ? `${active.breakMinutes} min` : "No habilitado"}
                    </span>
                  </StatCard>
                </div>

                {schedule.length > 0 && (
                  <div className="hero-schedule">
                    <div className={pick(!!isLight, "text-[11px] uppercase tracking-[0.3em] text-zinc-500", "text-[11px] uppercase tracking-[0.3em] text-zinc-400")}>
                      Itinerario clave
                    </div>
                    <div className="hero-schedule-grid">
                      {schedule.map((it) => (
                        <div
                          key={`${it.label}-${it.time}`}
                          className={`hero-schedule-item ${isLight ? "hero-schedule-item--light" : "hero-schedule-item--dark"}`}
                        >
                          <span className={pick(!!isLight, "text-sm font-medium text-zinc-600", "text-sm font-medium text-zinc-200")}>
                            {it.label}
                          </span>
                          <span className={pick(!!isLight, "text-lg font-semibold tracking-tight text-zinc-900", "text-lg font-semibold tracking-tight text-white")}>
                            {it.time}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-6">
                {timeline.length > 0 && (
                  <div className={`hud-card ${isLight ? "hud-card--light" : "hud-card--dark"}`}>
                    <div className={pick(!!isLight, "text-[11px] uppercase tracking-[0.3em] text-zinc-500", "text-[11px] uppercase tracking-[0.3em] text-zinc-400")}>
                      Próximos eventos
                    </div>
                    <div className="timeline-list">
                      {timeline.map((it, i) => {
                        const tone =
                          it.kind === "eventEnd"
                            ? isLight
                              ? "#ec4899"
                              : "#f472b6"
                            : it.kind === "breakStart" || it.kind === "breakEnd"
                            ? accentPalette.secondary
                            : accentPalette.primary;
                        const hint =
                          it.kind === "eventEnd"
                            ? "Meta final del torneo"
                            : it.kind === "breakStart"
                            ? "Pausa programada"
                            : it.kind === "breakEnd"
                            ? "Reinicio del juego"
                            : "Cierre de ronda";

                        return (
                          <div
                            key={`${it.label}-${i}`}
                            className={`timeline-item ${isLight ? "timeline-item--light" : "timeline-item--dark"}`}
                          >
                            <span className="timeline-bullet" style={{ background: tone }} />
                            {i < timeline.length - 1 && (
                              <span
                                className="timeline-connector"
                                style={{ background: isLight ? "rgba(24,24,27,0.08)" : "rgba(248,250,252,0.12)" }}
                              />
                            )}
                            <div className="timeline-content">
                              <div className="timeline-row">
                                <span className={pick(!!isLight, "timeline-label text-zinc-700", "timeline-label text-zinc-200")}>
                                  {it.label}
                                </span>
                                <span className={pick(!!isLight, "timeline-time text-zinc-900", "timeline-time text-white")}>
                                  {it.time}
                                </span>
                              </div>
                              <div className={pick(!!isLight, "timeline-hint text-zinc-500", "timeline-hint text-zinc-400")}>
                                {hint}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className={`hud-card ${isLight ? "hud-card--light" : "hud-card--dark"}`}>
                  <div className={pick(!!isLight, "text-[11px] uppercase tracking-[0.3em] text-zinc-500", "text-[11px] uppercase tracking-[0.3em] text-zinc-400")}>
                    Mapa de rondas
                  </div>
                  <div className={pick(!!isLight, "mt-3 text-sm text-zinc-600", "mt-3 text-sm text-zinc-300")}>
                    {active.roundsTotal > 0
                      ? `${active.roundsCompleted} de ${active.roundsTotal} rondas completadas`
                      : "Sin rondas registradas"}
                  </div>
                  <div className="mt-4">
                    <RoundMap t={active} isLight={!!isLight} />
                  </div>
                </div>

                <div className={`hud-card ${isLight ? "hud-card--light" : "hud-card--dark"}`}>
                  <div className={pick(!!isLight, "text-[11px] uppercase tracking-[0.3em] text-zinc-500", "text-[11px] uppercase tracking-[0.3em] text-zinc-400")}>
                    Configuración del reloj
                  </div>
                  <dl className="hud-card-specs">
                    <div>
                      <dt className={pick(!!isLight, "hud-card-spec-label text-zinc-500", "hud-card-spec-label text-zinc-400")}>
                        Duración ronda
                      </dt>
                      <dd className={pick(!!isLight, "hud-card-spec-value text-zinc-900", "hud-card-spec-value text-white")}>
                        {active.roundMinutes} min
                      </dd>
                    </div>
                    <div>
                      <dt className={pick(!!isLight, "hud-card-spec-label text-zinc-500", "hud-card-spec-label text-zinc-400")}>
                        Break
                      </dt>
                      <dd className={pick(!!isLight, "hud-card-spec-value text-zinc-900", "hud-card-spec-value text-white")}>
                        {active.breakEnabled ? `${active.breakMinutes} min` : "Sin break"}
                      </dd>
                    </div>
                    <div>
                      <dt className={pick(!!isLight, "hud-card-spec-label text-zinc-500", "hud-card-spec-label text-zinc-400")}>
                        Auto siguiente
                      </dt>
                      <dd className={pick(!!isLight, "hud-card-spec-value text-zinc-900", "hud-card-spec-value text-white")}>
                        {active.autoStartNext ? "Activado" : "Manual"}
                      </dd>
                    </div>
                    <div>
                      <dt className={pick(!!isLight, "hud-card-spec-label text-zinc-500", "hud-card-spec-label text-zinc-400")}>
                        Creado
                      </dt>
                      <dd className={pick(!!isLight, "hud-card-spec-value text-zinc-900", "hud-card-spec-value text-white")}>
                        {dayjs(active.createdAt).format(timeFmt === "12" ? "DD/MM hh:mm A" : "DD/MM HH:mm")}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>
            </div>
          </section>
        )}

  {/* Panel de anuncios: colocar DEBAJO del HUD principal */}
  <AnnounceHost tournaments={tournaments} isLight={!!isLight} onMetrics={(w, open)=> setDrawerPad(open ? w + 24 : 0)} />

        {/* Lista compacta (3 por página) */}
        {!fixedId.current && tournaments.length > 1 && (
          <div className="mt-8 relative">
            <PageDots count={pages.length} index={page} isLight={!!isLight} />
            <div key={page} className="grid grid-cols-1 md:grid-cols-3 gap-4 swap-fade">
              {(pages[page] ?? tournaments.slice(0, 3)).map((t) => {
                const inSomething = t.timer.target !== null && (t.timer.running || t.timer.remainingMs > 0);
                const inRound = inSomething && t.timer.mode === "round";
                const roundIdx = inRound ? t.roundsCompleted + 1 : t.roundsCompleted;
                const lightCard = active?.theme === "light";
                return (
                  <div
                    key={t.id}
                    className={pick(
                      !!lightCard,
                      "rounded-2xl border border-zinc-200 bg-white/80 p-4 min-h-[84px] shadow-sm card-ambient",
                      "rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4 min-h-[84px] card-ambient"
                    )}
                  >
                    <div className={pick(!!lightCard, "flex items-center gap-2 text-sm text-zinc-700", "flex items-center gap-2 text-sm")}>
                      <span className={pick(!!lightCard, "rounded bg-zinc-100 px-2 py-0.5 text-zinc-800", "rounded bg-zinc-800/60 px-2 py-0.5 text-zinc-200")}>
                        {t.game}
                      </span>
                      <span className={pick(!!lightCard, "text-zinc-600", "text-zinc-300")}>
                        {t.timer.mode === "break" ? (
                          <span className="inline-flex items-center gap-1.5">
                            <IconCoffee className={pick(!!lightCard, "size-3.5 text-zinc-500", "size-3.5 text-zinc-400")} /> Break
                          </span>
                        ) : (
                          <>Ronda • {roundIdx} / {t.roundsTotal}</>
                        )}
                      </span>
                      <span className={pick(!!lightCard, "ml-auto text-[11px] text-zinc-400", "ml-auto text-[11px] text-zinc-500")}>
                        {dayjs(t.createdAt).format("DD/MM HH:mm")}
                      </span>
                    </div>
                    <div
                      className={pick(
                        !!lightCard,
                        "font-semibold mt-1 tracking-tight text-ellipsis overflow-hidden whitespace-nowrap text-zinc-900",
                        "font-semibold mt-1 tracking-tight text-ellipsis overflow-hidden whitespace-nowrap text-zinc-100"
                      )}
                    >
                      {t.name}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        </div>
      </div>
    </div>
    </div>
  );
};

/** Mount */
const rootEl = document.getElementById("root")!;
ReactDOM.createRoot(rootEl).render(<Display />);
