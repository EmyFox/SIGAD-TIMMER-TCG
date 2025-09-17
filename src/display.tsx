import React, { useEffect, useMemo, useRef, useState } from "react";
import "./index.css";
import ReactDOM from "react-dom/client";
import dayjs from "dayjs";
import {
  subscribeDisplay,
  subscribeAnnouncements,
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
const IconPlay = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...p}>
    <path d="m8 5 12 7-12 7V5Z" fill="currentColor" />
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
const IconNote = (p: React.SVGProps<SVGSVGElement>) => (
  <svg viewBox="0 0 24 24" fill="none" aria-hidden {...p}>
    <path d="M6 3h9l3 3v13a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V6a3 3 0 0 1 3-3Z" stroke="currentColor" strokeWidth="1.5" />
    <path d="M15 3v3h3" stroke="currentColor" strokeWidth="1.5" />
    <path d="M8 10h8M8 14h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

/* ==================== Helpers ==================== */
const pad2 = (n: number) => n.toString().padStart(2, "0");
const fmtClock = (tf: TimeFmt) => (tf === "12" ? "hh:mm A" : "HH:mm");
const getParam = (k: string) => new URLSearchParams(location.search).get(k);
const pluralize = (value: number, singular: string, plural: string) => (value === 1 ? singular : plural);
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
    className={pick(
      isLight,
      "rounded-xl border border-zinc-200 bg-white/80 shadow-sm p-4 transition-colors hover:bg-white",
      "rounded-xl border border-zinc-800 bg-zinc-900/50 p-4 transition-colors hover:bg-zinc-900/70"
    )}
  >
    <div className={pick(isLight, "text-zinc-600 text-[13px]", "text-zinc-400 text-[13px]")}>{label}</div>
    <div className={pick(isLight, "mt-1.5 font-semibold text-zinc-900", "mt-1.5 font-semibold text-zinc-100")}>{children}</div>
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
}) => (
  <div className="group relative overflow-hidden rounded-2xl hud-corners time-ambient">
    <div className={`neon-border ${accent === "amber" ? "neon-amber" : "neon-indigo"}`} />
    <div
      className={pick(
        isLight,
        "relative z-10 rounded-2xl bg-zinc-50 px-5 py-4 md:px-6 md:py-5",
        "relative z-10 rounded-2xl bg-zinc-900/60 px-5 py-4 md:px-6 md:py-5"
      )}
    >
      <div
        className={pick(
          isLight,
          "tabular-nums font-black leading-none tracking-tight text-5xl md:text-7xl animate-flipTick will-change-transform digit-glow text-zinc-900",
          "tabular-nums font-black leading-none tracking-tight text-5xl md:text-7xl animate-flipTick will-change-transform digit-glow text-zinc-100"
        )}
        style={{ fontFeatureSettings: "'tnum' on", fontVariantNumeric: "tabular-nums" }}
      >
        {value}
      </div>
      <div
        className={pick(
          isLight,
          "mt-1 text-xs uppercase tracking-[0.2em] text-zinc-500",
          "mt-1 text-xs uppercase tracking-[0.2em] text-zinc-400"
        )}
      >
        {label}
      </div>
    </div>
  </div>
);

const makeRoundMarkers = (total: number) => {
  if (total <= 0) return [] as number[];
  if (total <= 10) return Array.from({ length: total }, (_, i) => i + 1);
  const slots = 12;
  const step = (total - 1) / Math.max(1, slots - 1);
  const values = new Set<number>();
  for (let i = 0; i < slots; i++) {
    const value = Math.round(i * step) + 1;
    values.add(Math.min(total, Math.max(1, value)));
  }
  values.add(1);
  values.add(total);
  return Array.from(values).sort((a, b) => a - b);
};

type MetaAccent = "indigo" | "amber" | "emerald" | "rose" | "cyan" | "violet";

const MetaCard: React.FC<{
  accent: MetaAccent;
  label: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  icon: React.ReactNode;
  className?: string;
}> = ({ accent, label, title, description, icon, className }) => {
  const classes = ["meta-card"];
  if (className) classes.push(className);
  return (
    <div className={classes.join(" ")} data-accent={accent}>
      <div className="meta-card__icon" aria-hidden>
        {icon}
      </div>
      <div className="meta-card__label">{label}</div>
      {title ? <div className="meta-card__title">{title}</div> : null}
      {description ? <div className="meta-card__description">{description}</div> : null}
    </div>
  );
};

const NotesCard: React.FC<{ text: string; className?: string }> = ({ text, className }) => (
  <MetaCard
    accent="violet"
    label="Notas del organizador"
    description={text}
    icon={<IconNote className="size-5" />}
    className={className ? `meta-card--note ${className}` : "meta-card--note"}
  />
);

const RoundTimeline: React.FC<{
  total: number;
  completed: number;
  currentIndex: number;
  mode: DisplayTournament["timer"]["mode"];
  accent: "indigo" | "amber";
  stateLabel: string;
  isLight: boolean;
  roundsLeft: number;
}> = ({ total, completed, currentIndex, mode, accent, stateLabel, isLight, roundsLeft }) => {
  const markers = useMemo(() => makeRoundMarkers(total), [total]);
  if (total <= 1 || markers.length === 0) return null;

  const pointerRound =
    stateLabel === "Terminado"
      ? total
      : mode === "round"
      ? Math.max(1, Math.min(total, currentIndex || completed + 1))
      : Math.min(total, completed);

  const fillPct = total > 0 ? (Math.min(total, pointerRound) / total) * 100 : 0;
  const pointerPct = total > 0 ? (Math.min(total, pointerRound) / total) * 100 : 0;
  const pointerPosition = Math.max(2, Math.min(98, pointerPct));

  const showCurrent = stateLabel !== "Terminado" && mode === "round";
  const currentRound = showCurrent ? Math.max(1, Math.min(total, currentIndex || completed + 1)) : null;

  const label =
    stateLabel === "Terminado"
      ? "Finalizado"
      : mode === "break"
      ? "Break"
      : mode === "round"
      ? `Ronda ${currentRound ?? 1}`
      : completed === 0
      ? "Listo"
      : "Pausado";

  const colors =
    accent === "amber"
      ? ["#fbbf24", "#fb7185"]
      : isLight
      ? ["#0ea5e9", "#6366f1"]
      : ["#00eaff", "#8b5cf6"];

  const completedLabel = `${completed} ${pluralize(completed, "ronda completada", "rondas completadas")}`;
  const remainingLabel =
    stateLabel === "Terminado"
      ? "Torneo finalizado"
      : roundsLeft > 0
      ? `${roundsLeft} ${pluralize(roundsLeft, "ronda restante", "rondas restantes")}`
      : "Última etapa";

  const timelineStyle = {
    ["--timeline-c1" as any]: colors[0],
    ["--timeline-c2" as any]: colors[1],
  } as React.CSSProperties;

  return (
    <section className="round-timeline" style={timelineStyle} aria-label="Progreso de rondas">
      <div className="round-timeline__track" aria-hidden>
        <div className="round-timeline__fill" style={{ width: `${fillPct}%` }} />
        <span className="round-timeline__pin" style={{ left: `${pointerPosition}%` }}>
          <span className="round-timeline__pin-dot" />
          <span className="round-timeline__pin-label">{label}</span>
        </span>
      </div>
      <div className="round-timeline__meta">
        <span>{completedLabel}</span>
        <span>{remainingLabel}</span>
      </div>
      <div className="round-timeline__chips" aria-hidden>
        {markers.map((num) => {
          const classes = ["round-chip"];
          if (stateLabel === "Terminado" || num <= completed) classes.push("round-chip--done");
          if (showCurrent && currentRound === num) classes.push("round-chip--current");
          return (
            <span key={num} className={classes.join(" ")} title={`Ronda ${num}`}>
              R{num}
            </span>
          );
        })}
      </div>
    </section>
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
const AnnounceHost: React.FC = () => {
  const [items, setItems] = useState<AnnItem[]>([]);
  const idRef = useRef(1);
  useEffect(() => {
    const off = subscribeAnnouncements((a) => {
      const id = idRef.current++;
      const item: AnnItem = {
        id,
        text: a.text,
        level: a.level,
        duration: Math.max(1000, a.duration || 8000),
      };
      setItems((prev) => [item, ...prev].slice(0, 4));
      const t = setTimeout(() => setItems((prev) => prev.filter((x) => x.id !== id)), item.duration);
      return () => clearTimeout(t);
    });
    return off;
  }, []);

  const close = (id: number) => setItems((prev) => prev.filter((x) => x.id !== id));
  const tone = (lvl: AnnItem["level"]) =>
    lvl === "success" ? ["#059669", "#10b981"] : lvl === "warn" ? ["#b45309", "#f59e0b"] : ["#3730a3", "#6366f1"];

  if (!items.length) return null;
  return (
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
              <button className="sigad-noti-close" aria-label="Cerrar" onClick={() => close(it.id)}>
                ✕
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
};

/* ==================== Display Root ==================== */
const Display: React.FC = () => {
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
  const schedule = active ? computeSchedule(active, timeFmt) : [];
  const nextEvent = schedule[0];

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
  const inSomething = active ? active.timer.target !== null && (active.timer.running || active.timer.remainingMs > 0) : false;
  const inRoundStage = inSomething && active?.timer.mode === "round";
  const currentIndex = active ? (inRoundStage ? active.roundsCompleted + 1 : active.roundsCompleted) : 0;
  const roundsLeftAfterCurrent =
    active ? Math.max(0, active.roundsTotal - (inRoundStage ? active.roundsCompleted + 1 : active.roundsCompleted)) : 0;
  const totalRounds = active?.roundsTotal ?? 0;
  const completedRounds = active?.roundsCompleted ?? 0;
  const notes = active?.notes?.trim() ?? "";
  const roundsSummaryDescription = active
    ? `${completedRounds} ${pluralize(completedRounds, "ronda completada", "rondas completadas")} de ${totalRounds} ${pluralize(totalRounds, "programada", "programadas")}${
        active.breakEnabled ? ` • Breaks de ${active.breakMinutes} min en agenda.` : "."
      }`
    : "";

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

      <div className="relative z-10 max-w-7xl mx-auto px-6 py-8">
        {/* Notificaciones HUD */}
        <AnnounceHost />

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
          <section
            className={pick(
              isLight ?? false,
              "relative overflow-hidden rounded-3xl border border-zinc-200 bg-white/70 shadow-sm backdrop-blur p-6 md:p-8 hud-frame sweep",
              "relative overflow-hidden rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 md:p-8 hud-frame sweep"
            )}
          >
            {/* Encabezado */}
            <div className="flex flex-wrap items-center gap-3 mb-6">
              <Pill isLight={!!isLight}>
                <IconTrophy className={pick(!!isLight, "size-4 text-zinc-500", "size-4 text-zinc-300")} /> {active.game}
              </Pill>

              <span className={pick(!!isLight, "text-zinc-600 text-sm inline-flex items-center gap-2", "text-zinc-300 text-sm inline-flex items-center gap-2")}>
                <IconLayers className={pick(!!isLight, "size-4 text-zinc-500", "size-4 text-zinc-400")} />
                {active.timer.mode === "break" ? <>Break</> : <>Ronda • {active.timer.mode === "round" ? active.roundsCompleted + 1 : active.roundsCompleted} / {active.roundsTotal}</>}
              </span>

              <span className={pick(!!isLight, "ml-auto text-zinc-600 text-sm inline-flex items-center gap-2", "ml-auto text-zinc-300 text-sm inline-flex items-center gap-2")}>
                <IconTarget className={pick(!!isLight, "size-4 text-zinc-500", "size-4 text-zinc-400")} />
                Objetivo: {active.timer.target ? dayjs(active.timer.target).format(fmtClock(timeFmt)) : "-"}
              </span>
            </div>

            {/* Título */}
            <h1
              className={pick(
                !!isLight,
                "mb-5 text-2xl md:text-4xl font-extrabold tracking-tight text-balance text-zinc-900",
                "mb-5 text-2xl md:text-4xl font-extrabold tracking-tight text-balance"
              )}
            >
              <span
                className={pick(
                  !!isLight,
                  "title-shine bg-gradient-to-r from-zinc-900 via-zinc-800 to-zinc-600 bg-clip-text text-transparent",
                  "title-shine bg-gradient-to-r from-white via-zinc-200 to-white/70 bg-clip-text text-transparent"
                )}
              >
                {active.name}
              </span>
            </h1>

            {/* HH : MM : SS */}
            <div className="grid grid-cols-3 gap-4 mb-7" aria-live="polite">
              <TimeBlock value={h} label="HORAS" accent={active?.timer.mode === "break" ? "amber" : "indigo"} isLight={!!isLight} />
              <TimeBlock value={m} label="MINUTOS" accent={active?.timer.mode === "break" ? "amber" : "indigo"} isLight={!!isLight} />
              <TimeBlock value={s} label="SEGUNDOS" accent={active?.timer.mode === "break" ? "amber" : "indigo"} isLight={!!isLight} />
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6 text-sm">
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

              <StatCard label="Break" isLight={!!isLight}>
                <span className={pick(!!isLight, "inline-flex items-center gap-2 text-zinc-700", "inline-flex items-center gap-2 text-zinc-200")}>
                  <IconCoffee className={pick(!!isLight, "size-4 text-zinc-500", "size-4 text-zinc-400")} />
                  {active.breakEnabled ? `${active.breakMinutes} min` : "No habilitado"}
                </span>
              </StatCard>
            </div>

            {active.roundsTotal > 1 && (
              <div className="mb-6">
                <RoundTimeline
                  total={active.roundsTotal}
                  completed={active.roundsCompleted}
                  currentIndex={currentIndex}
                  mode={active.timer.mode}
                  accent={accent}
                  stateLabel={stateLabel}
                  isLight={!!isLight}
                  roundsLeft={roundsLeftAfterCurrent}
                />
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <MetaCard
                accent={active.autoStartNext ? "emerald" : "rose"}
                label="Auto inicio"
                title={active.autoStartNext ? "Activado" : "Manual"}
                description={
                  active.autoStartNext
                    ? "La siguiente ronda comenzará automáticamente al finalizar el conteo."
                    : "El staff inicia la siguiente ronda desde el panel de control."
                }
                icon={<IconBolt className="size-5" />}
              />
              <MetaCard
                accent={accent}
                label="Próximo hito"
                title={
                  nextEvent
                    ? nextEvent.time
                    : stateLabel === "Terminado"
                    ? "Torneo cerrado"
                    : active.timer.target
                    ? dayjs(active.timer.target).format(fmtClock(timeFmt))
                    : "Pendiente"
                }
                description={
                  nextEvent
                    ? nextEvent.label
                    : stateLabel === "Terminado"
                    ? "Celebrando a los ganadores."
                    : active.timer.mode === "break"
                    ? "Break en progreso."
                    : "Configura el siguiente evento para mostrarlo aquí."
                }
                icon={<IconClock className="size-5" />}
              />
              <MetaCard
                accent="cyan"
                label="Resumen de rondas"
                title={
                  roundsLeftAfterCurrent > 0
                    ? `${roundsLeftAfterCurrent} ${pluralize(roundsLeftAfterCurrent, "ronda por jugar", "rondas por jugar")}`
                    : stateLabel === "Terminado"
                    ? "Torneo finalizado"
                    : "Última ronda"
                }
                description={roundsSummaryDescription}
                icon={<IconTarget className="size-5" />}
              />
              {notes && <NotesCard text={notes} className="md:col-span-2 lg:col-span-3" />}
            </div>

            {/* Progreso */}
            <div className="mb-2">
              <div
                className={pick(
                  !!isLight,
                  "neon-progress h-2 w-full overflow-hidden rounded-full bg-zinc-200/70 relative",
                  "neon-progress h-2 w-full overflow-hidden rounded-full bg-zinc-800/80 relative"
                )}
                style={
                  {
                    ["--p" as any]: displayPct,
                    ["--c1" as any]: accent === "amber" ? "#FFB457" : isLight ? "#0ea5e9" : "#00eaff",
                    ["--c2" as any]: accent === "amber" ? "#FF3D81" : isLight ? "#6366f1" : "#8b5cf6",
                    color: "var(--c2)",
                  } as React.CSSProperties
                }
              >
                <div className={`h-full progress-stripes progress-fill ${transitionClass}`} style={{ width: `${displayPct}%` }} />
                <span className="progress-comet" aria-hidden />
                <span className="progress-tip" aria-hidden />
                <span className="progress-edge" aria-hidden />
              </div>
              <div className={pick(!!isLight, "mt-2 text-[12px] text-zinc-600 flex items-center gap-2", "mt-2 text-[12px] text-zinc-400 flex items-center gap-2")}>
                <IconPlay className={pick(!!isLight, "size-3.5 text-zinc-500", "size-3.5 text-zinc-400")} />
                {active.timer.mode === "break" ? "Progreso del break" : "Progreso de la ronda"}
              </div>
            </div>

            {/* Hitos */}
            {schedule.length > 0 && (
              <div
                className={pick(
                  !!isLight,
                  "mt-5 rounded-2xl border border-zinc-200 bg-white/75 p-4 shadow-sm",
                  "mt-5 rounded-2xl border border-zinc-800 bg-zinc-900/60 p-4"
                )}
              >
                <div className={pick(!!isLight, "text-zinc-600 text-sm mb-2", "text-zinc-400 text-sm mb-2")}>
                  Próximos hitos
                </div>
                <div className="flex flex-wrap gap-2">
                  {schedule.map((it, i) => (
                    <span
                      key={i}
                      className={pick(
                        !!isLight,
                        "inline-flex items-center gap-2 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-sm chip-glow",
                        "inline-flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-800/60 px-3 py-1.5 text-sm chip-glow"
                      )}
                    >
                      <IconClock className={pick(!!isLight, "size-4 text-zinc-500", "size-4 text-zinc-400")} />
                      <span className={pick(!!isLight, "text-zinc-600", "text-zinc-300")}>{it.label}:</span>
                      <strong className={pick(!!isLight, "tracking-tight text-zinc-900", "tracking-tight text-zinc-100")}>
                        {it.time}
                      </strong>
                    </span>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}

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
  );
};

/** Mount */
const rootEl = document.getElementById("root")!;
ReactDOM.createRoot(rootEl).render(<Display />);
