import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import dayjs from "dayjs";
import "dayjs/locale/es";
import { emitAll, openDisplayWindow, emitAnnouncement } from "./displayChannel";
import { PanelToastHost, panelNotify } from './notificationsPanel';
import { useAuth } from './auth';
import { BrandLogo } from './BrandLogo';
import { DisplayPreview } from './DisplayPreview';
import { ErrorBoundary } from './ErrorBoundary';

/* =============================================================
   SIGAD - TIMMER • HUD Pro
   - Header/HUD rediseñado (glass, métricas, controles segmentados)
   - Botones principales de control en GRANDE por tarjeta
   - Bootstrap only (tema oscuro)
   ============================================================= */

/* ====================== Tipos y utilidades ====================== */
export type GameType = "Pokémon TCG" | "Yu-Gi-Oh!" | "Magic: The Gathering" | "Otro";
export type TimerMode = 'round' | 'break' | 'custom';

export interface TimerState {
  target: number | null;
  remainingMs: number;
  running: boolean;
  label: string;
  mode: TimerMode;
}

export interface Tournament {
  id: string;
  name: string;
  game: GameType;
  roundsTotal: number;
  roundsCompleted: number;
  roundMinutes: number;
  breakEnabled: boolean;
  breakMinutes: number;
  autoStartNext: boolean;
  nextRoundMinutes?: number | null;
  warned1m?: boolean;
  timer: TimerState;
  createdAt: number;
  notes?: string;
  displayTheme?: 'dark'|'light';
}

export type SortBy = "created" | "eta" | "name" | "game";
export type TimeFmt = '24' | '12';
export type PanelMode = 'advanced' | 'simple';

/* ====================== Helpers ====================== */
const pad2 = (n: number) => n.toString().padStart(2, "0");
const format = (ms: number) => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
};
const uid = () => Math.random().toString(36).slice(2);
const fmtClock = (tf: TimeFmt) => tf === '12' ? 'hh:mm A' : 'HH:mm';

dayjs.locale("es");

/* Pequeño reloj global local (sin crear archivo nuevo) */
const useClock = (step = 250) => {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), step);
    return () => clearInterval(id);
  }, [step]);
  return now;
};

/* Deriva remaining desde target y now (sin tocar estado) */
const getRemainingMs = (t: Tournament, nowMs: number) => {
  if (!t.timer.target) return 0;
  return Math.max(0, t.timer.target - nowMs);
};

/* WebAudio beep simple */
const useBeep = () => {
  const ctxRef = useRef<AudioContext | null>(null);
  const ensure = () => { try { ctxRef.current = ctxRef.current || new (window.AudioContext || (window as any).webkitAudioContext)(); } catch{} return ctxRef.current; };
  return (freq=880, duration=0.2, type: OscillatorType='sine') => {
    const ctx = ensure(); if(!ctx) return;
    const o = ctx.createOscillator(); const g = ctx.createGain();
    o.type = type; o.frequency.value = freq; g.gain.value = 0.05;
    o.connect(g).connect(ctx.destination); o.start();
    setTimeout(()=>{ try{o.stop();}catch{} }, Math.max(10, duration*1000));
  };
};

/* Tokens de color (Bootstrap CSS vars) */
const COLOR = {
  primary: "var(--bs-primary)",
  success: "var(--bs-success)",
  warning: "var(--bs-warning)",
  secondary: "var(--bs-secondary)",
} as const;
const gameColorKey = (g: GameType): keyof typeof COLOR => (
  g === "Pokémon TCG" ? "primary" : g === "Yu-Gi-Oh!" ? "warning" : g === "Magic: The Gathering" ? "success" : "secondary"
);

/* ====================== Persistencia ====================== */
const LS_TOUR = "sigad_tournaments_dark_v3";
const LS_UI = "sigad_ui_dark_v3";
const LS_DISP = "sigad_displays_v1";
const saveTours = (data: Tournament[]) => { try { localStorage.setItem(LS_TOUR, JSON.stringify({version:2, data})); } catch {} };
const loadTours = (): Tournament[] | null => {
  try {
    const raw = localStorage.getItem(LS_TOUR);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed as Tournament[];
    }
    if (parsed && typeof parsed === 'object' && Array.isArray(parsed.data)) {
      return parsed.data as Tournament[];
    }
  } catch {}
  return null;
};

// Sanitiza torneos importados / legacy
const sanitizeTournament = (t: any): Tournament | null => {
  if (!t || typeof t !== 'object') return null;
  const safe = {
    id: typeof t.id === 'string' ? t.id : uid(),
    name: typeof t.name === 'string' && t.name.trim() ? t.name.slice(0,120) : 'Torneo',
    game: games.includes(t.game) ? t.game : 'Otro',
    roundsTotal: Number.isFinite(t.roundsTotal) && t.roundsTotal>0 ? Math.min(500, Math.floor(t.roundsTotal)) : 1,
    roundsCompleted: Number.isFinite(t.roundsCompleted) && t.roundsCompleted>=0 ? Math.min(Math.floor(t.roundsCompleted), Math.max(1, t.roundsTotal||1)) : 0,
    roundMinutes: Number.isFinite(t.roundMinutes) && t.roundMinutes>0 ? Math.min(600, Math.floor(t.roundMinutes)) : 50,
    breakEnabled: !!t.breakEnabled,
    breakMinutes: Number.isFinite(t.breakMinutes) && t.breakMinutes>=0 ? Math.min(240, Math.floor(t.breakMinutes)) : 10,
    autoStartNext: !!t.autoStartNext,
    nextRoundMinutes: Number.isFinite(t.nextRoundMinutes) && t.nextRoundMinutes>0 ? Math.min(600, Math.floor(t.nextRoundMinutes)) : null,
    warned1m: false,
    timer: ((): TimerState => {
      if (t.timer && typeof t.timer === 'object') {
        const remainingMs = Number.isFinite(t.timer.remainingMs) ? Math.max(0, Math.floor(t.timer.remainingMs)) : 0;
        return { target: null, remainingMs, running: false, label: 'Sin iniciar', mode: 'custom' };
      }
      return { target: null, remainingMs: 0, running: false, label: 'Sin iniciar', mode: 'custom' };
    })(),
    createdAt: Number.isFinite(t.createdAt) ? t.createdAt : Date.now(),
    notes: typeof t.notes === 'string' ? t.notes.slice(0, 2000) : '',
    displayTheme: (t.displayTheme === 'light' || t.displayTheme === 'dark') ? t.displayTheme : 'dark'
  } satisfies Tournament;
  return safe;
};

/* ====================== Cálculos (ahora con nowMs opcional) ====================== */
const computeRoundsInfo = (t: Tournament) => {
  const inRound = t.timer.target !== null && (t.timer.running || t.timer.remainingMs > 0) && t.timer.mode === 'round';
  const inBreak = t.timer.target !== null && (t.timer.running || t.timer.remainingMs > 0) && t.timer.mode === 'break';
  const currentIndex = inRound ? t.roundsCompleted + 1 : t.roundsCompleted;
  const roundsLeftAfterCurrent = Math.max(0, t.roundsTotal - (inRound ? t.roundsCompleted + 1 : t.roundsCompleted));
  return { inRound, inBreak, currentIndex, roundsLeftAfterCurrent };
};

const computeETAms = (t: Tournament, nowMs?: number) => {
  const { inRound } = computeRoundsInfo(t);
  const currentRemaining = (t.timer.target && (t.timer.running || t.timer.remainingMs > 0))
    ? (nowMs !== undefined ? getRemainingMs(t, nowMs) : t.timer.remainingMs)
    : 0;
  const perRound = t.roundMinutes * 60_000;
  const perBreak = (t.breakEnabled ? t.breakMinutes : 0) * 60_000;
  const roundsLeftAfterCurrent = Math.max(0, t.roundsTotal - (inRound ? t.roundsCompleted + 1 : t.roundsCompleted));
  const future = roundsLeftAfterCurrent * (perRound + (t.breakEnabled && t.breakMinutes > 0 ? perBreak : 0));
  return currentRemaining + future;
};

const computeETAClock = (t: Tournament, tf: TimeFmt, nowMs?: number) => {
  const ms = computeETAms(t, nowMs);
  if (ms <= 0) return "-";
  return dayjs((nowMs ?? Date.now()) + ms).format(fmtClock(tf));
};

const computeSchedule = (t: Tournament, tf: TimeFmt, nowMs?: number) => {
  const items: { label: string; time: string }[] = [];
  let base = nowMs ?? Date.now();
  const { inRound, currentIndex } = computeRoundsInfo(t);
  const remainingMs = (t.timer.target && (t.timer.running || t.timer.remainingMs > 0))
    ? (nowMs !== undefined ? getRemainingMs(t, nowMs) : t.timer.remainingMs)
    : 0;
  if (remainingMs > 0) {
    items.push({
      label: t.timer.mode === 'break' ? 'Fin del descanso' : `Fin ronda ${inRound ? currentIndex : currentIndex + 1}`,
      time: dayjs(base + remainingMs).format(fmtClock(tf)),
    });
    base += remainingMs;
  }
  const left = Math.max(0, t.roundsTotal - (inRound ? currentIndex : currentIndex));
  for (let i = 1; i <= left; i++) {
    if (t.breakEnabled && t.breakMinutes > 0) {
      base += t.breakMinutes * 60_000;
      items.push({ label: `Descanso`, time: dayjs(base).format(fmtClock(tf)) });
    }
    base += t.roundMinutes * 60_000; items.push({ label: `Fin ronda ${currentIndex + i}`, time: dayjs(base).format(fmtClock(tf)) });
  }
  return items.slice(0, 3);
};

/* ====================== Comunes UI ====================== */
const games: GameType[] = ["Pokémon TCG", "Yu-Gi-Oh!", "Magic: The Gathering", "Otro"];

/* ====================== Offcanvas Crear/Editar ====================== */
interface ModalData { id?: string; name: string; game: GameType; roundsTotal: number; roundsCompleted: number; roundMinutes: number; breakEnabled: boolean; breakMinutes: number; autoStartNext: boolean; nextRoundMinutes?: number | null; displayTheme?: 'dark'|'light'; }
const emptyModal = (d?: Partial<ModalData>): ModalData => ({ name: "", game: "Pokémon TCG", roundsTotal: 5, roundsCompleted: 0, roundMinutes: 50, breakEnabled: true, breakMinutes: 10, autoStartNext: false, nextRoundMinutes: null, displayTheme: 'dark', ...d });

const TournamentOffcanvas: React.FC<{ open:boolean; onClose:()=>void; onSubmit:(data:ModalData)=>void; initial?: ModalData; }>=({open,onClose,onSubmit,initial})=>{
  const [form, setForm] = useState<ModalData>(emptyModal(initial));
  useEffect(()=>{ if(open) setForm(emptyModal(initial)); },[open,initial]);
  const set = (patch: Partial<ModalData>) => setForm(f=>({...f, ...patch}));

  if(!open) return null;

  return (
    <>
      <div className="offcanvas offcanvas-end show text-bg-dark" style={{visibility:'visible'}}>
        <div className="offcanvas-header">
          <h5 className="offcanvas-title">{initial?.id ? 'Editar torneo' : 'Nuevo torneo'}</h5>
          <button className="btn-close btn-close-white" onClick={onClose} aria-label="Cerrar"></button>
        </div>
        <div className="offcanvas-body">
          <div className="mb-3">
            <label className="form-label">Nombre</label>
            <input className="form-control" value={form.name} onChange={e=>set({name:e.target.value})} />
          </div>
          <div className="row g-2">
            <div className="col-12 col-xl-6">
              <label className="form-label">Juego</label>
              <select className="form-select" value={form.game} onChange={e=>set({game:e.target.value as GameType})}>
                {games.map(g=> <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="col-6 col-xl-3">
              <label className="form-label">Rondas</label>
              <input type="number" className="form-control" min={1} value={form.roundsTotal} onChange={e=>set({roundsTotal: Math.max(1, Number(e.target.value))})} />
            </div>
            <div className="col-6 col-xl-3">
              <label className="form-label">Completadas</label>
              <input type="number" className="form-control" min={0} max={form.roundsTotal} value={form.roundsCompleted} onChange={e=>set({roundsCompleted: Math.min(Math.max(0, Number(e.target.value)), form.roundsTotal)})} />
            </div>
            <div className="col-6 col-xl-3">
              <label className="form-label">Min/Ronda</label>
              <input type="number" className="form-control" min={1} value={form.roundMinutes} onChange={e=>set({roundMinutes: Math.max(1, Number(e.target.value))})} />
            </div>
            <div className="col-6 col-xl-3">
              <label className="form-label">Min próxima</label>
              <input type="number" className="form-control" min={0} placeholder="(opcional)" value={form.nextRoundMinutes ?? 0} onChange={e=>{ const v=Number(e.target.value); set({ nextRoundMinutes: v>0? v : null }); }} />
            </div>
            <div className="col-12 col-xl-6">
              <div className="form-check form-switch mt-4">
                <input className="form-check-input" type="checkbox" id="breakSwitch" checked={form.breakEnabled} onChange={e=>set({breakEnabled: e.target.checked})} />
                <label className="form-check-label" htmlFor="breakSwitch">Habilitar break</label>
              </div>
            </div>
            <div className="col-12 col-xl-6">
              <label className="form-label">Tema del Display</label>
              <select className="form-select" value={form.displayTheme||'dark'} onChange={e=>set({displayTheme: (e.target.value as 'dark'|'light')})}>
                <option value="dark">Oscuro</option>
                <option value="light">Luz (claro)</option>
              </select>
            </div>
            <div className="col-6 col-xl-3">
              <label className="form-label">Descanso (min)</label>
              <input type="number" className="form-control" min={0} value={form.breakMinutes} onChange={e=>set({breakMinutes: Math.max(0, Number(e.target.value))})} disabled={!form.breakEnabled} />
            </div>
            <div className="col-6 col-xl-3">
              <div className="form-check form-switch mt-4">
                <input className="form-check-input" type="checkbox" id="autoSwitch" checked={form.autoStartNext} onChange={e=>set({autoStartNext: e.target.checked})} />
                <label className="form-check-label" htmlFor="autoSwitch">Auto iniciar siguiente</label>
              </div>
            </div>
          </div>
        </div>
        <div className="offcanvas-header border-top">
          <div className="btn-group ms-auto">
            <button className="btn btn-outline-light" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={()=>onSubmit(form)}>{initial?.id ? 'Guardar' : 'Crear'}</button>
          </div>
        </div>
      </div>
      <div className="offcanvas-backdrop fade show" onClick={onClose}></div>
    </>
  );
};

/* ====================== Offcanvas Ajustes ====================== */
interface Settings { timeFmt: TimeFmt; cols: 1|2|3; soundEnabled: boolean; warn1m: boolean; autoOpenDisplay: boolean; panelMode: PanelMode; }
const defaultSettings: Settings = { timeFmt: '24', cols: 1, soundEnabled: true, warn1m: true, autoOpenDisplay: false, panelMode: 'advanced' };
const parseSettings = (value: unknown): Settings => {
  if (!value || typeof value !== 'object') return defaultSettings;
  const raw = value as Partial<Settings> & Record<string, unknown>;
  const cols = raw.cols === 2 ? 2 : raw.cols === 3 ? 3 : 1;
  const timeFmt: TimeFmt = raw.timeFmt === '12' ? '12' : '24';
  return {
    timeFmt,
    cols,
    soundEnabled: raw.soundEnabled !== undefined ? !!raw.soundEnabled : defaultSettings.soundEnabled,
    warn1m: raw.warn1m !== undefined ? !!raw.warn1m : defaultSettings.warn1m,
    autoOpenDisplay: raw.autoOpenDisplay !== undefined ? !!raw.autoOpenDisplay : defaultSettings.autoOpenDisplay,
    panelMode: raw.panelMode === 'simple' ? 'simple' : 'advanced',
  };
};

const SettingsOffcanvas: React.FC<{ open:boolean; onClose:()=>void; value:Settings; onChange:(s:Settings)=>void }>=({open,onClose,value,onChange})=>{
  const [s, setS] = useState<Settings>(value);
  useEffect(()=>{ if(open) setS(value); },[open, value]);
  const set = (patch: Partial<Settings>) => setS(prev=>({...prev, ...patch}));
  if(!open) return null;
  return (
    <>
      <div className="offcanvas offcanvas-end show text-bg-dark" style={{visibility:'visible'}}>
        <div className="offcanvas-header">
          <h5 className="offcanvas-title">Ajustes</h5>
          <button className="btn-close btn-close-white" onClick={onClose} aria-label="Cerrar"></button>
        </div>
        <div className="offcanvas-body">
          <div className="row g-3">
            <div className="col-6">
              <label className="form-label">Formato de hora</label>
              <select className="form-select" value={s.timeFmt} onChange={e=>set({timeFmt: e.target.value as TimeFmt})}>
                <option value="24">24h</option>
                <option value="12">12h</option>
              </select>
            </div>
            <div className="col-6">
              <label className="form-label">Columnas</label>
              <select className="form-select" value={s.cols} onChange={e=>set({cols: Number(e.target.value) as 1|2|3})}>
                <option value={1}>1</option>
                <option value={2}>2</option>
                <option value={3}>3</option>
              </select>
            </div>
            <div className="col-12">
              <label className="form-label">Modo del panel</label>
              <select className="form-select" value={s.panelMode} onChange={e=>set({ panelMode: e.target.value as PanelMode })}>
                <option value="advanced">Avanzado</option>
                <option value="simple">Simple</option>
              </select>
            </div>
            <div className="col-12">
              <div className="form-check form-switch">
                <input className="form-check-input" type="checkbox" id="snd" checked={s.soundEnabled} onChange={e=>set({soundEnabled:e.target.checked})} />
                <label className="form-check-label" htmlFor="snd">Sonidos (fin / aviso 1m)</label>
              </div>
            </div>
            <div className="col-12">
              <div className="form-check form-switch">
                <input className="form-check-input" type="checkbox" id="warn1" checked={s.warn1m} onChange={e=>set({warn1m:e.target.checked})} />
                <label className="form-check-label" htmlFor="warn1">Aviso a 1 minuto</label>
              </div>
            </div>
            <div className="col-12">
              <div className="form-check form-switch">
                <input className="form-check-input" type="checkbox" id="autoDisp" checked={s.autoOpenDisplay} onChange={e=>set({autoOpenDisplay:e.target.checked})} />
                <label className="form-check-label" htmlFor="autoDisp">Abrir display al iniciar ronda</label>
              </div>
            </div>
          </div>
        </div>
        <div className="offcanvas-header border-top">
          <div className="btn-group ms-auto">
            <button className="btn btn-outline-light" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={()=>onChange(s)}>Guardar</button>
          </div>
        </div>
      </div>
      <div className="offcanvas-backdrop fade show" onClick={onClose}></div>
    </>
  );
};

/* ====================== HUD / HEADER PRO ====================== */
type HeaderHUDProps = {
  now: string;
  nowMs: number;                          /* nuevo: tiempo numérico para ETA precisos */
  user: any;
  onLock: ()=>void;
  onLogout: ()=>void;
  settings: Settings;
  setSettings: React.Dispatch<React.SetStateAction<Settings>>;
  tournaments: Tournament[];
  runningCount: number;
  anyRunning: boolean;
  onPauseAll: ()=>void;
  onResumeAll: ()=>void;
  onResetAll: ()=>void;
  onNew: ()=>void;
  onCopySchedule: ()=>void;
  onExport: ()=>void;
  onOpenSettings: ()=>void;
  fileInputRef: React.RefObject<HTMLInputElement>;
  importJSON: (f: File)=>void;
  AnnouncementBtn: React.FC<{ pushToast:(t:{kind:any;text:string})=>void }>;
  pushToast: (t:{kind:any;text:string})=>void;
};

const HeaderHUD: React.FC<HeaderHUDProps> = ({
  now: nowLabel, nowMs, user, onLock, onLogout, settings, setSettings, tournaments, runningCount, anyRunning,
  onPauseAll, onResumeAll, onResetAll, onNew, onCopySchedule, onExport, onOpenSettings,
  fileInputRef, importJSON, AnnouncementBtn, pushToast
}) => {
  const total = tournaments.length;
  const simpleMode = settings.panelMode === 'simple';

  const nextEventClock = useMemo(() => {
    const ts = tournaments
      .filter(t => t.timer.running && t.timer.target)
      .map(t => t.timer.target as number);
    if (!ts.length) return "-";
    const next = Math.min(...ts);
    return dayjs(next).format(fmtClock(settings.timeFmt));
  }, [tournaments, settings.timeFmt]);

  const globalETAClock = useMemo(() => {
    if (!tournaments.length) return "-";
    const latestMs = Math.max(...tournaments.map(t => computeETAms(t, nowMs)), 0);
    return latestMs > 0 ? dayjs(nowMs + latestMs).format(fmtClock(settings.timeFmt)) : "-";
  }, [tournaments, settings.timeFmt, nowMs]);

  // Estilos glass HUD
  const glass: React.CSSProperties = {
    background: "linear-gradient(180deg, rgba(20,22,30,.75), rgba(16,18,24,.60))",
    border: "1px solid rgba(255,255,255,.06)",
    boxShadow: "0 10px 30px rgba(0,0,0,.35)",
    backdropFilter: "blur(8px)",
    WebkitBackdropFilter: "blur(8px)",
    borderRadius: 14
  };

  const togglePanelMode = () => setSettings(s => ({ ...s, panelMode: s.panelMode === 'simple' ? 'advanced' : 'simple' }));

  if (simpleMode) {
    return (
      <header className="sticky-top pt-2 pb-3" style={{zIndex: 1030, background: 'transparent'}}>
        <div className="container">
          <div className="p-3" style={glass}>
            <div className="d-flex flex-column gap-3">
              <div className="d-flex align-items-center gap-3 flex-wrap">
                <div className="d-flex align-items-center gap-3">
                  <BrandLogo size={44} />
                  <div className="d-flex flex-column lh-sm">
                    <strong className="fs-5">SIGAD • TIMMER</strong>
                    <small className="text-secondary">Modo simple</small>
                  </div>
                </div>
                <div className="ms-auto d-flex flex-wrap align-items-center gap-2">
                  <span className="badge text-bg-dark" style={{fontVariantNumeric:'tabular-nums'}}>{nowLabel}</span>
                  <button className="btn btn-sm btn-outline-info" onClick={togglePanelMode} title="Cambiar a modo avanzado">Modo avanzado</button>
                </div>
              </div>

              <div className="d-flex flex-wrap gap-2">
                <button className="btn btn-sm btn-primary" onClick={onNew}>➕ Nuevo</button>
                <button className="btn btn-sm btn-outline-warning" onClick={onPauseAll}>⏸ Pausar</button>
                <button className="btn btn-sm btn-outline-success" onClick={onResumeAll}>▶ Reanudar</button>
                <button className="btn btn-sm btn-outline-secondary" onClick={onResetAll}>↺ Reset</button>
                <button className="btn btn-sm btn-outline-info" onClick={onOpenSettings}>⚙️ Ajustes</button>
              </div>

              <details className="simple-panel__details">
                <summary>Más herramientas</summary>
                <div className="pt-2 d-flex flex-wrap gap-2">
                  <button className="btn btn-sm btn-outline-light" onClick={onCopySchedule}>📋 Itinerario</button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="application/json"
                    hidden
                    onChange={e=>{
                      const f=e.target.files?.[0];
                      if(f) importJSON(f);
                      if(fileInputRef.current) fileInputRef.current.value='';
                    }}
                  />
                  <button className="btn btn-sm btn-outline-light" onClick={()=>fileInputRef.current?.click()}>📥 Importar</button>
                  <button className="btn btn-sm btn-outline-light" onClick={onExport}>📤 Exportar</button>
                  <AnnouncementBtn pushToast={pushToast as any}/>
                  {user && (
                    <div className="d-flex flex-wrap gap-2">
                      <button className="btn btn-sm btn-outline-warning" onClick={onLock}>🔒 Bloquear</button>
                      <button className="btn btn-sm btn-outline-danger" onClick={onLogout}>⎋ Cerrar sesión</button>
                    </div>
                  )}
                </div>
              </details>

              <div className="d-flex flex-wrap gap-2 text-secondary small">
                <span className="badge text-bg-dark">Activos <strong className="ms-1">{runningCount}</strong>/<strong>{total}</strong></span>
                <span className="badge text-bg-dark">Próximo: <strong className="ms-1">{nextEventClock}</strong></span>
                <span className="badge text-bg-dark">ETA: <strong className="ms-1">{globalETAClock}</strong></span>
              </div>
            </div>
          </div>
        </div>
      </header>
    );
  }

  const meterDot = (ok:boolean) => (
    <span className={`badge rounded-pill ${ok ? 'text-bg-success' : 'text-bg-secondary'}`} style={{fontVariantNumeric:'tabular-nums'}}>
      ● <span className="ms-1">{ok ? 'Activo' : 'Idle'}</span>
    </span>
  );

  return (
    <header className="sticky-top pt-2 pb-3" style={{zIndex: 1030, background: 'transparent'}}>
      <div className="container">
        {/* HUD principal */}
        <div className="p-3" style={glass}>
          <div className="d-flex align-items-center gap-3 flex-wrap">
            {/* Branding */}
            <div className="d-flex align-items-center gap-3">
              <BrandLogo size={48}/>
              <div className="d-flex flex-column lh-sm">
                <strong className="fs-5">SIGAD • TIMMER</strong>
                <small className="text-secondary">HUD de control de torneos</small>
              </div>
            </div>

            {/* Métricas claves */}
            <div className="ms-auto d-none d-xl-flex align-items-center gap-3">
              <div className="d-flex align-items-center gap-2">
                {meterDot(anyRunning)}
                <span className="text-secondary small">Corriendo</span>
                <span className="fw-bold">{runningCount}</span>
                <span className="text-secondary">/</span>
                <span className="fw-bold">{total}</span>
              </div>
              <div className="vr" />
              <div className="d-flex flex-column">
                <span className="text-secondary small">Próximo evento</span>
                <span className="fw-semibold">{nextEventClock}</span>
              </div>
              <div className="vr" />
              <div className="d-flex flex-column">
                <span className="text-secondary small">ETA global</span>
                <span className="fw-semibold">{globalETAClock}</span>
              </div>
              <div className="vr" />
              <div className="d-flex flex-column align-items-end">
                <span className="text-secondary small">Ahora</span>
                <span className="fw-semibold" style={{fontVariantNumeric:'tabular-nums'}}>{nowLabel}</span>
              </div>
            </div>

            {/* Sesión */}
            <div className="ms-xl-3 d-flex align-items-center gap-2 ms-auto">
              {user && (
                <div className="btn-group btn-group-sm" role="group" aria-label="Sesion">
                  <button className="btn btn-outline-warning" onClick={onLock} title="Bloquear">🔒</button>
                  <button className="btn btn-outline-danger" onClick={onLogout} title="Cerrar sesión">⎋</button>
                </div>
              )}
            </div>
          </div>

          {/* Controles: segmentados + acciones */}
          <div className="mt-3 d-flex flex-wrap align-items-center gap-3">
            {/* Controles segmentados */}
            <div className="d-flex align-items-center gap-2">
              <div className="d-flex align-items-center gap-2">
                <span className="text-secondary small">Hora</span>
                <div className="btn-group btn-group-sm" role="group" aria-label="Hora">
                  <input type="radio" className="btn-check" name="tf" id="tf24"
                         checked={settings.timeFmt==='24'}
                         onChange={()=>setSettings(s=>({...s, timeFmt:'24'}))}/>
                  <label className="btn btn-outline-light" htmlFor="tf24">24h</label>

                  <input type="radio" className="btn-check" name="tf" id="tf12"
                         checked={settings.timeFmt==='12'}
                         onChange={()=>setSettings(s=>({...s, timeFmt:'12'}))}/>
                  <label className="btn btn-outline-light" htmlFor="tf12">12h</label>
                </div>
              </div>

              <div className="d-flex align-items-center gap-2">
                <span className="text-secondary small">Cols</span>
                <div className="btn-group btn-group-sm" role="group" aria-label="Cols">
                  <input type="radio" className="btn-check" name="cols" id="c1"
                         checked={settings.cols===1}
                         onChange={()=>setSettings(s=>({...s, cols:1}))}/>
                  <label className="btn btn-outline-light" htmlFor="c1">1</label>

                  <input type="radio" className="btn-check" name="cols" id="c2"
                         checked={settings.cols===2}
                         onChange={()=>setSettings(s=>({...s, cols:2}))}/>
                  <label className="btn btn-outline-light" htmlFor="c2">2</label>

                  <input type="radio" className="btn-check" name="cols" id="c3"
                         checked={settings.cols===3}
                         onChange={()=>setSettings(s=>({...s, cols:3}))}/>
                  <label className="btn btn-outline-light" htmlFor="c3">3</label>
                </div>
              </div>
            </div>

            {/* Acciones rápidas */}
            <div className="vr d-none d-md-block"/>
            <div className="d-flex flex-wrap gap-2">
              <button className="btn btn-sm btn-outline-warning" onClick={onPauseAll} title="Pausar todos (P / Space)">⏸ Pausar</button>
              <button className="btn btn-sm btn-outline-success" onClick={onResumeAll} title="Reanudar todos (R / Space)">▶ Reanudar</button>
              <button className="btn btn-sm btn-outline-secondary" onClick={onResetAll} title="Resetear todos">↺ Reset</button>
              <button className="btn btn-sm btn-primary" onClick={onNew} title="Nuevo (N)">➕ Nuevo</button>
              <button className="btn btn-sm btn-outline-secondary" onClick={onCopySchedule} title="Copiar itinerario">📋 Itinerario</button>

              {/* Importar/Exportar/Ajustes/Anuncio */}
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                hidden
                onChange={e=>{
                  const f=e.target.files?.[0];
                  if(f) importJSON(f);
                  if(fileInputRef.current) fileInputRef.current.value='';
                }}
              />
              <button className="btn btn-sm btn-outline-light" onClick={()=>fileInputRef.current?.click()}>📥 Importar</button>
              <button className="btn btn-sm btn-outline-light" onClick={onExport}>📤 Exportar</button>
              <button className="btn btn-sm btn-outline-info" onClick={onOpenSettings} title="Ajustes (S)">⚙️ Ajustes</button>
              <AnnouncementBtn pushToast={pushToast as any}/>
              <button className="btn btn-sm btn-outline-secondary" onClick={togglePanelMode} title="Cambiar a modo simple">Modo simple</button>
            </div>

            {/* Métricas (responsive) */}
            <div className="ms-auto d-flex d-xl-none align-items-center gap-3">
              <span className="badge text-bg-dark">Próx: <strong className="ms-1">{nextEventClock}</strong></span>
              <span className="badge text-bg-dark">ETA: <strong className="ms-1">{globalETAClock}</strong></span>
              <span className="badge text-bg-dark">⏱ {runningCount}/{total}</span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
};

/* ====================== Panel Maestro (tema oscuro) ====================== */
export const MasterPanel: React.FC = () => {
  const { lock, logout, user } = useAuth();
  useEffect(()=>{ document.documentElement.setAttribute('data-bs-theme','dark'); },[]);
  const showBrandBg = useMemo(()=>{
    try { return !new URLSearchParams(window.location.search).has('noBrand'); } catch { return true; }
  }, []);

  // Estado principal
  const [tournaments, setTournaments] = useState<Tournament[]>(() => {
    const fromLS = loadTours();
    if (fromLS && Array.isArray(fromLS) && fromLS.length) return fromLS;
    return [{ id: uid(), name: "Torneo A", game: "Pokémon TCG", roundsTotal: 5, roundsCompleted: 0, roundMinutes: 50, breakEnabled: true, breakMinutes: 10, autoStartNext: false, nextRoundMinutes: null, warned1m:false, timer: { target: null, remainingMs: 0, running: false, label: "Sin iniciar", mode: 'custom' }, createdAt: Date.now(), notes: '', displayTheme:'dark' }];
  });
  useEffect(() => { saveTours(tournaments); }, [tournaments]);

  // UI + Ajustes
  const [settings, setSettings] = useState<Settings>(()=> {
    try {
      const raw = localStorage.getItem(LS_UI);
      if (!raw) return defaultSettings;
      return parseSettings(JSON.parse(raw));
    } catch {}
    return defaultSettings;
  });
  useEffect(()=>{ try { localStorage.setItem(LS_UI, JSON.stringify(settings)); } catch{} }, [settings]);

  // Displays persistidos
  const [openDisplays, setOpenDisplays] = useState<string[]>(()=>{ try { return JSON.parse(localStorage.getItem(LS_DISP)||"[]"); } catch { return []; } });
  useEffect(()=>{ try { localStorage.setItem(LS_DISP, JSON.stringify(openDisplays)); } catch{} }, [openDisplays]);

  // Emitir a DISPLAY (eventos estructurales)
  useEffect(() => { emitAll(tournaments, settings.timeFmt); }, [tournaments, settings.timeFmt]);

  // Reloj principal (numérico + etiqueta formateada)
  const nowMs = useClock(1000);
  const nowLabel = useMemo(
    () => dayjs(nowMs).format(settings.timeFmt === '12' ? "ddd DD MMM • hh:mm:ss A" : "ddd DD MMM • HH:mm:ss"),
    [nowMs, settings.timeFmt]
  );

  // Toasts
  const pushToast = useCallback((t: { kind: any; text: string }) => {
    switch(t.kind){
      case 'success': panelNotify.success(t.text); break;
      case 'warning': panelNotify.warning(t.text); break;
      case 'secondary': panelNotify.secondary(t.text); break;
      case 'info': panelNotify.info(t.text); break;
      case 'danger': panelNotify.danger(t.text); break;
      default: panelNotify.info(t.text);
    }
  }, []);
  const beep = useBeep();

  // Timers -> gestionar solo eventos (aviso 1m y finalización)
  useEffect(() => {
    setTournaments(prev => {
      let changed = false;
      const updated = prev.map(t => {
        const tm = t.timer;
        if (tm.target === null) return t;

        const remaining = getRemainingMs(t, nowMs);

        // Aviso 1 minuto (solo ronda)
        if (settings.soundEnabled && settings.warn1m && tm.mode === 'round' && !t.warned1m && remaining <= 60_000 && remaining > 0) {
          try { beep(520, 0.12, 'square'); } catch {}
          changed = true;
          return { ...t, warned1m: true };
        }

        // Fin de fase
        if (remaining <= 0 && tm.running) {
          if (settings.soundEnabled) { try { beep(880, 0.2, 'sawtooth'); } catch {} }
          if (tm.mode === 'round') {
            const done = Math.min(t.roundsTotal, t.roundsCompleted + 1);
            let next: Tournament = { ...t, roundsCompleted: done, warned1m: false };
            pushToast({ kind: 'warning', text: `⏱️ ${t.name}: ronda ${done} terminada` });
            const now2 = nowMs;
            if (t.autoStartNext && done < t.roundsTotal) {
              if (t.breakEnabled && t.breakMinutes > 0) {
                const dur = t.breakMinutes * 60_000;
                next = {
                  ...next,
                  timer: {
                    target: now2 + dur,
                    remainingMs: dur,
                    running: true,
                    label: 'Descanso',
                    mode: 'break' as TimerMode,
                  },
                };
              } else {
                const m = t.nextRoundMinutes && t.nextRoundMinutes > 0 ? t.nextRoundMinutes : t.roundMinutes;
                const dur = m * 60_000;
                next = { ...next, timer: { target: now2 + dur, remainingMs: dur, running: true, label: `Ronda ${done + 1}`, mode: 'round' as TimerMode } };
              }
            } else {
              next = { ...next, timer: { target: null, remainingMs: 0, running: false, label: 'Terminado', mode: 'custom' as TimerMode } };
            }
            changed = true;
            return next;
          } else if (tm.mode === 'break') {
            const now2 = nowMs;
            if (t.autoStartNext && t.roundsCompleted < t.roundsTotal) {
              const m = t.nextRoundMinutes && t.nextRoundMinutes > 0 ? t.nextRoundMinutes : t.roundMinutes;
              const dur = m * 60_000;
              changed = true;
              return { ...t, warned1m: false, timer: { target: now2 + dur, remainingMs: dur, running: true, label: `Ronda ${t.roundsCompleted + 1}`, mode: 'round' as TimerMode } };
            }
            changed = true;
            return { ...t, warned1m: false, timer: { target: null, remainingMs: 0, running: false, label: 'Terminado', mode: 'custom' as TimerMode } };
          } else {
            changed = true;
            return { ...t, warned1m: false, timer: { target: null, remainingMs: 0, running: false, label: 'Terminado', mode: 'custom' as TimerMode } };
          }
        }

        return t;
      });
      return changed ? updated : prev;
    });
  }, [nowMs, settings.soundEnabled, settings.warn1m, beep, pushToast]);

  // Enviar ticks al DISPLAY con remaining derivado (sin tocar otros archivos)
  useEffect(() => {
    const derived = tournaments.map(t => {
      const rm = getRemainingMs(t, nowMs);
      if (t.timer.remainingMs === rm) return t;
      return { ...t, timer: { ...t.timer, remainingMs: rm } };
    });
    emitAll(derived, settings.timeFmt);
  }, [nowMs, tournaments, settings.timeFmt]);

  const anyRunning = tournaments.some(t => t.timer.running && t.timer.target !== null);
  const isDisplayOpen = useCallback((id: string) => openDisplays.includes(id), [openDisplays]);
  const markOpenDisplay = (id: string) => setOpenDisplays(s => s.includes(id) ? s : [...s, id]);
  const closeDisplayMark = (id: string) => setOpenDisplays(s => s.filter(x => x !== id));

  /* ===== Acciones timer ===== */
  const startRound = useCallback((id: string, minutes?: number, label?: string) => {
    setTournaments(prev => prev.map(t => {
      if (t.id !== id) return t;
      const m = Math.max(1, minutes ?? (t.nextRoundMinutes && t.nextRoundMinutes > 0 ? t.nextRoundMinutes : t.roundMinutes));
      const now2 = Date.now();
      pushToast({ kind: 'success', text: `▶ ${t.name}: nueva ronda (${m} min)` });
      if (settings.autoOpenDisplay) { markOpenDisplay(id); openDisplayWindow(id); }
      return { ...t, warned1m: false, timer: { target: now2 + m * 60_000, remainingMs: m * 60_000, running: true, label: label ?? `Ronda ${computeRoundsInfo(t).currentIndex + 1}`, mode: 'round' } };
    }));
  }, [settings.autoOpenDisplay, pushToast]);
  const startBreakNow = useCallback((id: string) => setTournaments(prev => prev.map(t => {
    if (t.id !== id) return t; if (!t.breakEnabled || t.breakMinutes<=0) return t;
    const now2 = Date.now(); const dur = t.breakMinutes * 60_000;
    pushToast({ kind:'secondary', text:`☕ ${t.name}: descanso iniciado (${t.breakMinutes}m)` });
    return {
      ...t,
      warned1m: false,
      timer: {
        target: now2 + dur,
        remainingMs: dur,
        running: true,
        label: 'Descanso',
        mode: 'break',
      },
    };
  })), [pushToast]);
  const skipBreak = useCallback((id: string) => setTournaments(prev => prev.map(t => {
    if (t.id !== id) return t;
    const now2 = Date.now(); const m = Math.max(1, t.nextRoundMinutes && t.nextRoundMinutes>0 ? t.nextRoundMinutes : t.roundMinutes);
    return { ...t, warned1m:false, timer: { target: now2 + m*60_000, remainingMs: m*60_000, running: true, label:`Ronda ${t.roundsCompleted+1}`, mode:'round' } };
  })), []);
  const pause = useCallback((id: string) => setTournaments(prev => prev.map(t => t.id === id ? ({ ...t, timer: { ...t.timer, running: false } }) : t)), []);
  const resume = useCallback((id: string) => setTournaments(prev => prev.map(t => (t.id === id && t.timer.target) ? ({ ...t, timer: { ...t.timer, running: true } }) : t)), []);
  const resetTimer = useCallback((id: string) => setTournaments(prev => prev.map(t => t.id === id ? ({ ...t, warned1m:false, timer: { target: null, remainingMs: 0, running: false, label: "Sin iniciar", mode:'custom' } }) : t)), []);
  const addMinutes = useCallback((id: string, m: number) => setTournaments(prev => prev.map(t => {
    if (t.id !== id) return t; const tm = t.timer; if (!tm.target) return t;
    const newTarget = tm.target + m * 60_000;
    const newRemaining = Math.max(0, (tm.target - Date.now()) + m * 60_000);
    const rearmWarn = newRemaining > 60_000;  // rearmar si volvimos a >60s
    pushToast({ kind:'secondary', text:`${m>0?'+':''}${m}m en ${t.name}` });
    if (newRemaining <= 0) return { ...t, warned1m:false, timer: { target:null, remainingMs:0, running:false, label:'Terminado', mode:'custom' } };
    return { ...t, warned1m: rearmWarn ? false : t.warned1m, timer: { ...tm, target: newTarget, remainingMs: newRemaining } };
  })), [pushToast]);
  const restartCurrentRound = useCallback((id: string) => setTournaments(prev => prev.map(t => {
    if (t.id !== id) return t; const m = Math.max(1, t.roundMinutes); const now2=Date.now();
    return { ...t, warned1m:false, timer: { target: now2 + m*60_000, remainingMs: m*60_000, running:true, label:`Ronda ${computeRoundsInfo(t).currentIndex + 1}`, mode:'round' } };
  })), []);
  const prevRound = useCallback((id: string) => setTournaments(prev => prev.map(t => {
    if (t.id !== id) return t; const back = Math.max(0, t.roundsCompleted - 1);
    pushToast({ kind:'secondary', text:`↩ ${t.name}: volver a ronda ${back}` });
    return { ...t, roundsCompleted: back, warned1m:false, timer: { target: null, remainingMs: 0, running:false, label:'Sin iniciar', mode:'custom' } };
  })), [pushToast]);
  const completeRound = useCallback((id: string) => setTournaments(prev => prev.map(t => {
    if (t.id !== id) return t; const done = Math.min(t.roundsTotal, t.roundsCompleted + 1);
    pushToast({ kind:'warning', text:`✅ ${t.name}: fin de ronda (${done}/${t.roundsTotal})` });
    return { ...t, roundsCompleted: done, warned1m:false, timer: { target: null, remainingMs: 0, running: false, label: "Sin iniciar", mode:'custom' } };
  })), [pushToast]);
  const nextRound = useCallback((id: string) => setTournaments(prev => prev.map(t => {
    if (t.id !== id) return t; const done = Math.min(t.roundsTotal, t.roundsCompleted + 1);
    if (done > t.roundsTotal) return t;
    const now2 = Date.now(); const m = Math.max(1, t.nextRoundMinutes && t.nextRoundMinutes>0 ? t.nextRoundMinutes : t.roundMinutes);
    if (done >= t.roundsTotal) {
      return { ...t, roundsCompleted: t.roundsTotal, warned1m:false, timer: { target: null, remainingMs: 0, running:false, label:'Terminado', mode:'custom' } };
    }
    return { ...t, roundsCompleted: done, warned1m:false, timer: { target: now2 + m * 60_000, remainingMs: m * 60_000, running: true, label: `Ronda ${done + 1}`, mode:'round' } };
  })), []);

  // Acciones globales
  const pauseAll = useCallback(() => setTournaments(prev => prev.map(t => ({ ...t, timer: { ...t.timer, running: false } }))), []);
  const resumeAll = useCallback(() => setTournaments(prev => prev.map(t => t.timer.target ? ({ ...t, timer: { ...t.timer, running: true } }) : t)), []);
  const resetAll = useCallback(() => setTournaments(prev => prev.map(t => ({ ...t, warned1m:false, timer: { target: null, remainingMs: 0, running: false, label: "Sin iniciar", mode:'custom' } }))), []);

  /* ===== Offcanvas Torneo ===== */
  const [canvasOpen, setCanvasOpen] = useState(false);
  const [canvasInitial, setCanvasInitial] = useState<ModalData|undefined>(undefined);
  const openCreate = () => { setCanvasInitial(undefined); setCanvasOpen(true); };
  const openEdit = (t: Tournament) => { setCanvasInitial({ id: t.id, name: t.name, game: t.game, roundsTotal: t.roundsTotal, roundsCompleted: t.roundsCompleted, roundMinutes: t.roundMinutes, breakEnabled: t.breakEnabled, breakMinutes: t.breakMinutes, autoStartNext: t.autoStartNext, nextRoundMinutes: t.nextRoundMinutes ?? null, displayTheme: t.displayTheme || 'dark' }); setCanvasOpen(true); };
  const closeCanvas = () => setCanvasOpen(false);
  const submitCanvas = (data: ModalData) => {
    if (data.id) {
      setTournaments(prev => prev.map(t => t.id === data.id ? ({ ...t, name: data.name, game: data.game, roundsTotal: data.roundsTotal, roundsCompleted: Math.min(data.roundsCompleted, data.roundsTotal), roundMinutes: data.roundMinutes, breakEnabled: data.breakEnabled, breakMinutes: data.breakMinutes, autoStartNext: data.autoStartNext, nextRoundMinutes: data.nextRoundMinutes ?? null, displayTheme: data.displayTheme || 'dark' }) : t));
    } else {
      const id = uid();
      const newT: Tournament = { id, name: data.name || `Torneo ${tournaments.length+1}`, game: data.game, roundsTotal: Math.max(1, data.roundsTotal), roundsCompleted: 0, roundMinutes: Math.max(1, data.roundMinutes), breakEnabled: data.breakEnabled, breakMinutes: Math.max(0, data.breakMinutes), autoStartNext: data.autoStartNext, nextRoundMinutes: data.nextRoundMinutes ?? null, warned1m:false, timer: { target: null, remainingMs: 0, running: false, label: 'Sin iniciar', mode:'custom' }, createdAt: Date.now(), notes: '', displayTheme: data.displayTheme || 'dark' };
      setTournaments(prev => [newT, ...prev]);
    }
    setCanvasOpen(false);
  };

  /* ===== Offcanvas Ajustes ===== */
  const [settingsOpen, setSettingsOpen] = useState(false);

  /* ===== CRUD ===== */
  const duplicateTournament = useCallback((id: string) => setTournaments(prev => {
    const src = prev.find(t=>t.id===id); if(!src) return prev;
    const copy: Tournament = { ...src, id: uid(), name: `${src.name} (copia)`, warned1m:false, timer: { target:null, remainingMs:0, running:false, label:'Sin iniciar', mode:'custom' }, createdAt: Date.now(), notes: src.notes || '' };
    return [copy, ...prev];
  }), []);
  const removeTournament = useCallback((id: string) => { if (!confirm("Eliminar torneo?")) return; setTournaments(prev => prev.filter(t => t.id !== id)); closeDisplayMark(id); }, []);

  /* ===== Export / Import ===== */
  const exportJSON = useCallback(() => {
    const payload = { version: 2, tournaments, settings, exportedAt: Date.now() };
    const blob = new Blob([JSON.stringify(payload,null,2)], {type:'application/json'});
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `sigad_export_${dayjs().format('YYYYMMDD_HHmmss')}.json`; a.click();
    URL.revokeObjectURL(url);
  }, [tournaments, settings]);
  const importJSON = useCallback((file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!data || typeof data !== 'object') throw new Error('JSON inválido');
        if (Array.isArray(data.tournaments)) {
          const sanitized: Tournament[] = [];
          const ids = new Set<string>();
          for (const raw of data.tournaments) {
            const st = sanitizeTournament(raw);
            if (st) {
              if (ids.has(st.id)) st.id = uid();
              ids.add(st.id);
              sanitized.push(st);
            }
          }
          setTournaments(sanitized);
        }
        if (data.settings) setSettings(parseSettings(data.settings));
        pushToast({kind:'success', text:'📥 Importado correctamente'});
      } catch(err) { pushToast({kind:'warning', text:'Error al importar JSON'}); }
    };
    reader.readAsText(file);
  }, [pushToast]);
  const fileInputRef = useRef<HTMLInputElement|null>(null);

  const runningCount = tournaments.filter(t => t.timer.running).length;

  // Copiar schedule (usar nowMs para precisión)
  const copySchedule = () => {
    try {
      const lines: string[] = [];
      tournaments.forEach(t => {
        const sch = computeSchedule(t, settings.timeFmt, nowMs);
        if (sch.length) {
          lines.push(`${t.name}:`);
          sch.forEach(s => lines.push(`  • ${s.label}: ${s.time}`));
        }
      });
      if (!lines.length) { pushToast({kind:'secondary', text:'Nada que copiar'}); return; }
      navigator.clipboard.writeText(lines.join('\n'));
      pushToast({kind:'success', text:'📋 Itinerario copiado'});
    } catch { pushToast({kind:'warning', text:'Error al copiar'}); }
  };

  const showAdvanced = settings.panelMode === 'advanced';
  const effectiveCols = showAdvanced ? settings.cols : 1;
  const gridClasses = `row g-3 row-cols-1 ${effectiveCols===2 ? 'row-cols-xl-2' : ''} ${effectiveCols===3 ? 'row-cols-xxl-3' : ''}`.trim();
  const compact = showAdvanced && effectiveCols === 3;
  const CardComponent = showAdvanced ? TournamentCard : SimpleTournamentCard;

  // Atajos (sin passive:true)
  useEffect(()=>{
    const handler = (e: KeyboardEvent) => {
      if (announcementState.open) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (target && (target.isContentEditable || tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT')) return;
      const k = e.key.toLowerCase();
      if (k === ' '){ e.preventDefault(); anyRunning ? pauseAll() : resumeAll(); }
      else if (k === 'n'){ openCreate(); }
      else if (k === 's'){ setSettingsOpen(true); }
      else if (k === 'p'){ pauseAll(); }
      else if (k === 'r'){ resumeAll(); }
      else if (k === 'a'){
        announcementState.open = true;
        announcementState.setOpen?.(true);
      }
    };
    window.addEventListener('keydown', handler);
    return ()=> window.removeEventListener('keydown', handler);
  }, [anyRunning, pauseAll, resumeAll]);

  // Torneos "derivados" para DisplayPreview (si internamente usa remainingMs)
  const tournamentsForPreview = useMemo(() => {
    return tournaments.map(t => {
      const rm = getRemainingMs(t, nowMs);
      return (t.timer.remainingMs === rm) ? t : ({ ...t, timer: { ...t.timer, remainingMs: rm } });
    });
  }, [tournaments, nowMs]);

  return (
    <>
      {/* Background watermark */}
      {showBrandBg && (
        <div
          aria-hidden
          style={{
            position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 0,
            background: `radial-gradient(circle at 30% 20%, rgba(99,102,241,.18), transparent 60%),
                      radial-gradient(circle at 70% 80%, rgba(236,72,153,.10), transparent 65%)`,
            opacity: .18,
            filter: 'saturate(.9) contrast(1.05) brightness(.9)',
            mixBlendMode: 'luminosity'
          }}
        >
          <div style={{
            position:'absolute', inset:0, backgroundImage: 'var(--sigad-logo-url)',
            backgroundRepeat:'no-repeat', backgroundPosition:'center 32%', backgroundSize:'min(56vw, 760px) auto'
          }} />
        </div>
      )}

      {/* ======= HUD Pro (HEADER) ======= */}
      <HeaderHUD
        now={nowLabel}
        nowMs={nowMs}
        user={user}
        onLock={lock}
        onLogout={logout}
        settings={settings}
        setSettings={setSettings}
        tournaments={tournaments}
        runningCount={runningCount}
        anyRunning={anyRunning}
        onPauseAll={pauseAll}
        onResumeAll={resumeAll}
        onResetAll={resetAll}
        onNew={openCreate}
        onCopySchedule={copySchedule}
        onExport={exportJSON}
        onOpenSettings={()=>setSettingsOpen(true)}
        fileInputRef={fileInputRef}
        importJSON={importJSON}
        AnnouncementBtn={AnnouncementButton}
        pushToast={pushToast as any}
      />

      {/* Grid + sidebar preview layout */}
      <main className="container pb-3" style={{maxHeight: 'calc(100vh - 170px)', overflowY: 'auto'}}>
        <div className="row g-3">
          <div className="col-12 col-xl-8 col-xxl-8">
            <div className={gridClasses}>
              {tournaments.map(t => (
                <div className="col" key={t.id}>
                  <CardComponent
                    t={t}
                    nowMs={nowMs}
                    timeFmt={settings.timeFmt}
                    compact={compact}
                    onEdit={()=>openEdit(t)}
                    onChange={(patch) => setTournaments(prev => prev.map(x => x.id === t.id ? ({ ...x, ...patch }) : x))}
                    startRound={(mins?: number, label?: string) => startRound(t.id, mins, label)}
                    startBreak={()=>startBreakNow(t.id)}
                    skipBreak={()=>skipBreak(t.id)}
                    pause={() => pause(t.id)}
                    resume={() => resume(t.id)}
                    reset={() => resetTimer(t.id)}
                    add1={() => addMinutes(t.id, 1)}
                    add5={() => addMinutes(t.id, 5)}
                    sub1={() => addMinutes(t.id, -1)}
                    sub5={() => addMinutes(t.id, -5)}
                    restartRound={()=>restartCurrentRound(t.id)}
                    prevRound={()=>prevRound(t.id)}
                    completeRound={() => completeRound(t.id)}
                    nextRound={() => nextRound(t.id)}
                    remove={() => removeTournament(t.id)}
                    duplicate={() => duplicateTournament(t.id)}
                    openDisplay={() => { markOpenDisplay(t.id); openDisplayWindow(t.id); }}
                    isDisplayOpen={isDisplayOpen(t.id)}
                  />
                </div>
              ))}
            </div>
          </div>
          <div className="col-12 col-xl-4 col-xxl-4 d-flex flex-column gap-3">
            <DisplayPreview
              tournaments={tournamentsForPreview}
              timeFmt={settings.timeFmt}
              onToggleTheme={(id)=> setTournaments(prev => prev.map(t => t.id===id ? ({...t, displayTheme: (t.displayTheme||'dark')==='dark'?'light':'dark'}) : t))}
            />
          </div>
        </div>
      </main>

      {/* Offcanvas & Toasts */}
      <TournamentOffcanvas open={canvasOpen} onClose={closeCanvas} onSubmit={submitCanvas} initial={canvasInitial} />
      <SettingsOffcanvas open={settingsOpen} onClose={()=>setSettingsOpen(false)} value={settings} onChange={(s)=>{ setSettings(s); setSettingsOpen(false); }} />
      <PanelToastHost position="top-right" />
      <AnnouncementConfigurator />
    </>
  );
};

/* ====================== Tarjeta ====================== */
type TournamentCardProps = {
  t: Tournament;
  nowMs: number;
  timeFmt: TimeFmt;
  compact?: boolean;
  onEdit: () => void;
  onChange: (patch: Partial<Tournament>) => void;
  startRound: (minutes?: number, label?: string) => void;
  startBreak: () => void;
  skipBreak: () => void;
  pause: () => void;
  resume: () => void;
  reset: () => void;
  add1: () => void;
  add5: () => void;
  sub1: () => void;
  sub5: () => void;
  restartRound: () => void;
  prevRound: () => void;
  completeRound: () => void;
  nextRound: () => void;
  remove: () => void;
  duplicate: () => void;
  openDisplay: () => void;
  isDisplayOpen: boolean;
};

const SimpleTournamentCard: React.FC<TournamentCardProps> = ({ t, nowMs, timeFmt, onEdit, onChange, startRound, startBreak, skipBreak, pause, resume, reset, add1, add5, sub1, sub5, restartRound, prevRound, completeRound, nextRound, remove, duplicate, openDisplay, isDisplayOpen }) => {
  const { inRound, currentIndex, roundsLeftAfterCurrent } = useMemo(() => computeRoundsInfo(t), [t]);
  const remainingMs = getRemainingMs(t, nowMs);
  const expired = !t.timer.running && t.timer.target !== null && remainingMs <= 0;
  const status = expired ? 'Terminado' : t.timer.running ? 'En curso' : t.timer.target ? 'Pausado' : 'Sin iniciar';
  const colorCss = COLOR[gameColorKey(t.game)];
  const schedule = computeSchedule(t, timeFmt, nowMs);
  const totalSecs = Math.max(0, Math.floor(remainingMs / 1000));
  const phaseTotalSecs = t.timer.mode === 'break' ? (t.breakMinutes * 60) : (t.roundMinutes * 60);
  const progress = phaseTotalSecs > 0 ? Math.min(100, Math.max(0, 100 - Math.round((totalSecs / phaseTotalSecs) * 100))) : 0;
  const eta = computeETAClock(t, timeFmt, nowMs);
  const quickMinutes = [30,40,45,50,60];
  const phaseLabel = t.timer.mode === 'break' ? 'Descanso' : inRound ? `Ronda ${currentIndex}` : `Ronda ${Math.min(currentIndex + 1, t.roundsTotal)}`;

  return (
    <article className="card h-100 bg-body border-0 shadow-sm" style={{borderLeft: `6px solid ${colorCss}`, minWidth: 0}}>
      <header className="card-header bg-body border-0 py-2" style={{minWidth: 0}}>
        <div className="d-flex align-items-center gap-2 flex-wrap" style={{minWidth: 0}}>
          <span className="badge" style={{backgroundColor: colorCss}}>{t.game}</span>
          <span className="text-secondary small text-truncate" style={{minWidth: 0}}>
            {phaseLabel} • {t.roundsCompleted}/{t.roundsTotal}
          </span>
          <div className="ms-auto d-flex gap-1 flex-wrap">
            <button className="btn btn-sm btn-outline-light" onClick={onEdit} title="Editar">✎</button>
            <button className={`btn btn-sm ${isDisplayOpen ? 'btn-secondary' : 'btn-outline-light'}`} onClick={openDisplay} title="Display">🖥</button>
            <button className="btn btn-sm btn-outline-light" onClick={duplicate} title="Duplicar">⧉</button>
            <button className="btn btn-sm btn-outline-danger" onClick={remove} title="Eliminar">🗑</button>
          </div>
        </div>
      </header>

      <div className="card-body d-flex flex-column gap-3">
        <input aria-label="Nombre del torneo" className="form-control form-control-sm fw-semibold" value={t.name} onChange={e=>onChange({ name: e.target.value })} />

        <div className="d-flex flex-wrap align-items-start gap-3">
          <div className="d-flex flex-column">
            <span className="text-secondary small">Tiempo restante</span>
            <span className={`fw-bold ${expired ? 'text-danger' : ''}`} style={{fontVariantNumeric:'tabular-nums', fontSize:'2rem', lineHeight:1.1, color: expired ? undefined : colorCss}}>{format(remainingMs)}</span>
            <span className="text-secondary small">Estado: {status}</span>
          </div>
          <div className="d-flex flex-column">
            <span className="text-secondary small">Fase actual</span>
            <span className="fw-semibold">{phaseLabel}</span>
            <span className="text-secondary small">Objetivo: {t.timer.target ? dayjs(t.timer.target).format(fmtClock(timeFmt)) : '-'}</span>
          </div>
          <div className="ms-auto text-end small text-secondary">
            <div>ETA global: <strong className="ms-1 text-light">{eta}</strong></div>
            <div>Rondas restantes: {roundsLeftAfterCurrent}</div>
          </div>
        </div>

        <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-bar" style={{width: `${progress}%`, backgroundColor: colorCss}}></div>
        </div>

        {schedule.length > 0 && (
          <div className="d-flex flex-wrap gap-2">
            {schedule.map((it, i) => (
              <span key={i} className="badge text-bg-secondary">
                <span className="me-1">{it.label}:</span>
                <strong>{it.time}</strong>
              </span>
            ))}
          </div>
        )}

        <div className="d-flex flex-wrap gap-2">
          {t.timer.running ? (
            <>
              <button className="btn btn-sm btn-warning px-3" onClick={pause}>⏸ Pausar</button>
              <div className="btn-group btn-group-sm" role="group">
                <button className="btn btn-outline-light" onClick={sub5}>−5m</button>
                <button className="btn btn-outline-light" onClick={sub1}>−1m</button>
                <button className="btn btn-outline-light" onClick={add1}>+1m</button>
                <button className="btn btn-outline-light" onClick={add5}>+5m</button>
              </div>
            </>
          ) : !t.timer.running && t.timer.target !== null && remainingMs > 0 ? (
            <>
              <button className="btn btn-sm btn-success px-3" onClick={resume}>▶ Reanudar</button>
              <button className="btn btn-sm btn-outline-light px-3" onClick={reset}>↺ Reset</button>
            </>
          ) : (
            <>
              <button className="btn btn-sm btn-primary px-3" onClick={()=>startRound()}>▶ Iniciar</button>
              {t.breakEnabled && t.breakMinutes > 0 && (
                <button className="btn btn-sm btn-outline-light px-3" onClick={startBreak}>☕ Descanso</button>
              )}
              {expired && (
                <button className="btn btn-sm btn-outline-light px-3" onClick={reset}>↺ Reset</button>
              )}
            </>
          )}
          {t.timer.mode === 'break' && t.timer.running && (
            <button className="btn btn-sm btn-outline-light px-3" onClick={skipBreak}>⏭ Omitir descanso</button>
          )}
        </div>

        <details className="simple-panel__details mt-1">
          <summary>Controles avanzados</summary>
          <div className="pt-2 d-flex flex-column gap-3">
            <div className="row g-2">
              <div className="col-6">
                <label className="form-label small mb-1">Rondas totales</label>
                <input type="number" className="form-control form-control-sm" value={t.roundsTotal} min={1} onChange={e=>onChange({ roundsTotal: Math.max(1, Number(e.target.value)), roundsCompleted: Math.min(t.roundsCompleted, Math.max(1, Number(e.target.value))) })} />
              </div>
              <div className="col-6">
                <label className="form-label small mb-1">Completadas</label>
                <input type="number" className="form-control form-control-sm" value={t.roundsCompleted} min={0} max={t.roundsTotal} onChange={e=>onChange({ roundsCompleted: Math.min(Math.max(0, Number(e.target.value)), t.roundsTotal) })} />
              </div>
              <div className="col-6">
                <label className="form-label small mb-1">Min/Ronda</label>
                <input type="number" className="form-control form-control-sm" value={t.roundMinutes} min={1} onChange={e=>onChange({ roundMinutes: Math.max(1, Number(e.target.value)) })} />
              </div>
              <div className="col-6">
                <label className="form-label small mb-1">Min próxima</label>
                <input type="number" className="form-control form-control-sm" value={t.nextRoundMinutes ?? 0} min={0} onChange={e=>{ const v = Number(e.target.value); onChange({ nextRoundMinutes: v>0 ? v : null }); }} />
              </div>
            </div>

            <div className="row g-2">
              <div className="col-6">
                <div className="form-check form-switch">
                  <input className="form-check-input" type="checkbox" id={`simple-break-${t.id}`} checked={t.breakEnabled} onChange={e=>onChange({ breakEnabled: e.target.checked })} />
                  <label className="form-check-label" htmlFor={`simple-break-${t.id}`}>Descanso habilitado</label>
                </div>
              </div>
              <div className="col-6">
                <label className="form-label small mb-1">Descanso (min)</label>
                <input type="number" className="form-control form-control-sm" value={t.breakMinutes} min={0} disabled={!t.breakEnabled} onChange={e=>onChange({ breakMinutes: Math.max(0, Number(e.target.value)) })} />
              </div>
            </div>

            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" id={`simple-auto-${t.id}`} checked={t.autoStartNext} onChange={e=>onChange({ autoStartNext: e.target.checked })} />
              <label className="form-check-label" htmlFor={`simple-auto-${t.id}`}>Auto siguiente</label>
            </div>

            <div>
              <label className="form-label small mb-1">Tema del display</label>
              <select className="form-select form-select-sm" value={t.displayTheme || 'dark'} onChange={e=>onChange({ displayTheme: e.target.value as 'dark'|'light' })}>
                <option value="dark">Oscuro</option>
                <option value="light">Luz (claro)</option>
              </select>
            </div>

            <div className="d-flex flex-wrap gap-1">
              {quickMinutes.map(m => (
                <button key={m} className="btn btn-sm btn-outline-light" onClick={()=>startRound(m, `Ronda rápida (${m}m)`)}>{m}m</button>
              ))}
            </div>

            <div className="d-flex flex-wrap gap-2">
              <button className="btn btn-sm btn-outline-secondary" onClick={restartRound}>⟲ Reiniciar</button>
              <button className="btn btn-sm btn-outline-secondary" onClick={prevRound} disabled={t.roundsCompleted<=0}>↩ Atrás</button>
              <button className="btn btn-sm btn-outline-secondary" onClick={completeRound} disabled={t.roundsCompleted >= t.roundsTotal}>✅ Fin</button>
              <button className="btn btn-sm btn-outline-secondary" onClick={nextRound} disabled={t.roundsCompleted >= t.roundsTotal}>⏭ Sig.</button>
            </div>

            <div>
              <label className="form-label small mb-1" htmlFor={`simple-notes-${t.id}`}>Notas</label>
              <textarea id={`simple-notes-${t.id}`} className="form-control form-control-sm" rows={2} maxLength={2000} value={t.notes || ''} placeholder="Notas del organizador..." onChange={e=>onChange({notes: e.target.value})}></textarea>
            </div>
          </div>
        </details>
      </div>
    </article>
  );
};

const TournamentCard: React.FC<TournamentCardProps> = ({ t, nowMs, timeFmt, compact, onEdit, onChange, startRound, startBreak, skipBreak, pause, resume, reset, add1, add5, sub1, sub5, restartRound, prevRound, completeRound, nextRound, remove, duplicate, openDisplay, isDisplayOpen }) => {
  const { inRound, currentIndex, roundsLeftAfterCurrent } = useMemo(() => computeRoundsInfo(t), [t]);
  const remainingMs = getRemainingMs(t, nowMs);
  const expired = !t.timer.running && t.timer.target !== null && remainingMs <= 0;
  const sch = computeSchedule(t, timeFmt, nowMs);
  const colorCss = COLOR[gameColorKey(t.game)];
  const totalSecs = Math.max(0, Math.floor(remainingMs / 1000));
  const phaseTotalSecs = t.timer.mode === 'break' ? (t.breakMinutes * 60) : (t.roundMinutes * 60);
  const progress = phaseTotalSecs > 0 ? Math.min(100, Math.max(0, 100 - Math.round((totalSecs / phaseTotalSecs) * 100))) : 0;
  const QUICK_MINUTES = [30,40,45,50,60];

  const colStat = compact ? "col-6" : "col-6 col-lg-3";
  const colSmall3 = compact ? "col-6" : "col-6 col-sm-3";
  const colHalf = compact ? "col-12" : "col-12 col-sm-6";
  const nameInputClass = `form-control ${compact ? "" : "form-control-lg"} fw-semibold`;
  const timerFontSize = compact ? '1.75rem' : '2.25rem';

  // Botones
  const smallBtn = "btn btn-sm";
  const mainBtn = `btn btn-lg ${compact ? 'w-100' : ''}`; // en 3 cols ocupa ancho y no desborda

  return (
    <article className="card h-100 bg-body border-0 shadow-sm" style={{borderLeft: `6px solid ${colorCss}`, minWidth: 0}}>
      {/* Cabecera compacta */}
      <header className="card-header bg-body border-0 py-2" style={{ minWidth: 0 }}>
        <div className="d-flex align-items-center gap-2 flex-wrap" style={{ minWidth: 0 }}>
          <span className="badge" style={{backgroundColor: colorCss}}>{t.game}</span>
          <span className="ms-1 text-secondary small text-truncate" style={{ minWidth: 0 }}>
            {t.timer.mode==='break'? 'Descanso' : 'Ronda'} • {inRound ? currentIndex : Math.min(currentIndex + 1, t.roundsTotal)} / {t.roundsTotal}
          </span>

          <div className="ms-auto d-flex gap-1 flex-wrap">
            <button className="btn btn-sm btn-outline-light" onClick={onEdit} title="Editar">✎</button>
            <button className={`btn btn-sm ${isDisplayOpen ? 'btn-secondary' : 'btn-outline-light'}`} onClick={openDisplay} title="Display">🖥</button>
            <button className="btn btn-sm btn-outline-light" onClick={duplicate} title="Duplicar">⧉</button>
            <button className="btn btn-sm btn-outline-danger" onClick={remove} title="Eliminar">🗑</button>
          </div>
        </div>
      </header>

      <div className="card-body d-flex flex-column gap-3">
        <input aria-label="Nombre del torneo" className={nameInputClass} value={t.name} onChange={e=>onChange({ name: e.target.value })} />

        {/* Stats */}
        <div className="row g-2 align-items-end">
          <div className={colStat}>
            <div className="text-secondary small">Estado</div>
            <div className="fw-bold text-info text-truncate">{expired ? 'Terminado' : t.timer.running ? 'En curso' : t.timer.target ? 'Pausado' : 'Sin iniciar'}</div>
            <div className="text-secondary small">{dayjs().format(timeFmt==='12'?'hh:mm:ss A':'HH:mm:ss')}</div>
          </div>
          <div className={colStat}>
            <div className="text-secondary small">Timer</div>
            <div className={`${expired ? 'text-danger' : ''} fw-bold`} style={{fontVariantNumeric:'tabular-nums', fontSize: timerFontSize, lineHeight: 1, color: expired? undefined : colorCss}}>{format(remainingMs)}</div>
            <div className="text-secondary small">Objetivo: {t.timer.target ? dayjs(t.timer.target).format(fmtClock(timeFmt)) : '-'}</div>
          </div>
          <div className={colStat}>
            <div className="text-secondary small">ETA fin torneo</div>
            <div className="fw-bold">{computeETAClock(t, timeFmt, nowMs)}</div>
            <div className="text-secondary small">Rondas restantes: {roundsLeftAfterCurrent}</div>
          </div>
          <div className={colStat}>
            <div className="text-secondary small">Fase</div>
            <div className="fw-bold">{t.timer.mode==='break' ? 'Descanso' : inRound ? `Ronda ${currentIndex}` : `Ronda ${Math.min(currentIndex+1, t.roundsTotal)}`}</div>
            <div className="text-secondary small">{t.autoStartNext ? 'Auto siguiente: Sí' : 'Auto siguiente: No'}</div>
          </div>
        </div>

        {/* Config rápida */}
        <div className="row g-2">
          <div className={colSmall3}>
            <label className="form-label small mb-1">Rondas</label>
            <input type="number" className="form-control" value={t.roundsTotal} min={1}
                   onChange={e=>onChange({ roundsTotal: Math.max(1, Number(e.target.value)), roundsCompleted: Math.min(t.roundsCompleted, Math.max(1, Number(e.target.value))) })} />
          </div>
          <div className={colSmall3}>
            <label className="form-label small mb-1">Completadas</label>
            <input type="number" className="form-control" value={t.roundsCompleted} min={0} max={t.roundsTotal}
                   onChange={e=>onChange({ roundsCompleted: Math.min(Math.max(0, Number(e.target.value)), t.roundsTotal) })} />
          </div>
          <div className={colSmall3}>
            <label className="form-label small mb-1">Min/Ronda</label>
            <input type="number" className="form-control" value={t.roundMinutes} min={1}
                   onChange={e=>onChange({ roundMinutes: Math.max(1, Number(e.target.value)) })} />
          </div>
          <div className={colSmall3}>
            <label className="form-label small mb-1">Min próxima</label>
            <input type="number" className="form-control" value={t.nextRoundMinutes ?? 0} min={0}
                   onChange={e=>{ const v=Number(e.target.value); onChange({ nextRoundMinutes: v>0? v : null }); }} />
          </div>
        </div>

        <div className="row g-2">
          <div className={colHalf}>
            <div className="form-check form-switch">
              <input className="form-check-input" type="checkbox" id={`break-${t.id}`} checked={t.breakEnabled} onChange={e=>onChange({ breakEnabled: e.target.checked })} />
              <label className="form-check-label" htmlFor={`break-${t.id}`}>Habilitar descanso</label>
            </div>
          </div>
          <div className="col-6 col-sm-3">
            <label className="form-label small mb-1">Descanso (min)</label>
            <input type="number" className="form-control" value={t.breakMinutes} min={0} disabled={!t.breakEnabled}
                   onChange={e=>onChange({ breakMinutes: Math.max(0, Number(e.target.value)) })} />
          </div>
          <div className="col-6 col-sm-3">
            <div className="form-check form-switch mt-4">
              <input className="form-check-input" type="checkbox" id={`auto-${t.id}`} checked={t.autoStartNext} onChange={e=>onChange({ autoStartNext: e.target.checked })} />
              <label className="form-check-label" htmlFor={`auto-${t.id}`}>Auto siguiente</label>
            </div>
          </div>
          <div className={colHalf}>
            <label className="form-label small mb-1">Tema del Display</label>
            <div className="d-flex gap-2">
              <select className="form-select" style={{maxWidth:220}} value={t.displayTheme||'dark'} onChange={e=>onChange({ displayTheme: e.target.value as 'dark'|'light' })}>
                <option value="dark">Oscuro</option>
                <option value="light">Luz (claro)</option>
              </select>
              <button className={`${smallBtn} btn-outline-secondary`} onClick={()=>onChange({ displayTheme: (t.displayTheme||'dark')==='dark'?'light':'dark' })}>
                Alternar
              </button>
            </div>
          </div>
        </div>

        {/* Progreso de fase */}
        <div className="progress" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100}>
          <div className="progress-bar" style={{width: `${progress}%`, backgroundColor: colorCss}}></div>
        </div>

        {/* Próximos hitos */}
        {sch.length > 0 && (
          <div className="d-flex flex-wrap gap-2 align-items-center">
            {sch.map((it, i)=> (
              <span key={i} className="badge text-bg-dark border"><span className="me-1">{it.label}:</span><strong>{it.time}</strong></span>
            ))}
          </div>
        )}

        {/* Notas */}
        <details>
          <summary className="small text-secondary pointer">📝 Notas</summary>
          <textarea className="form-control mt-1" rows={3} maxLength={2000} value={t.notes || ''} placeholder="Notas del organizador..." onChange={e=>onChange({notes: e.target.value})}></textarea>
        </details>

        {/* ===== Controles prioritarios en GRANDE ===== */}
        <div className="mt-auto d-flex flex-column gap-2">
          {/* Estado: sin iniciar */}
          {(!t.timer.running && t.timer.target === null) && (
            <>
              <div className="d-flex flex-wrap gap-2">
                <button className={`${mainBtn} btn-primary px-4`} onClick={()=>startRound()}>▶ Iniciar</button>
                {t.breakEnabled && t.breakMinutes>0 && (
                  <button className={`${mainBtn} btn-outline-light px-4`} onClick={startBreak}>☕ Descanso</button>
                )}
              </div>
              <div className="d-flex flex-wrap gap-1">
                <div className="btn-group btn-group-sm" role="group" aria-label="Rápido">
                  {[30,40,45,50,60].map(m=> (
                    <button key={m} className="btn btn-outline-secondary" onClick={()=>startRound(m, `Ronda rápida (${m}m)`)}>{m}m</button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* Estado: corriendo */}
          {t.timer.running && (
            <>
              <div className="d-flex flex-wrap gap-2">
                <button className={`${mainBtn} btn-warning px-4`} onClick={pause}>⏸ Pausar</button>
              </div>
              <div className="btn-group btn-group-sm" role="group">
                <button className="btn btn-outline-light" onClick={sub5}>−5m</button>
                <button className="btn btn-outline-light" onClick={sub1}>−1m</button>
                <button className="btn btn-outline-light" onClick={add1}>+1m</button>
                <button className="btn btn-outline-light" onClick={add5}>+5m</button>
              </div>
            </>
          )}

          {/* Estado: pausado */}
          {!t.timer.running && t.timer.target !== null && remainingMs > 0 && (
            <div className="d-flex flex-wrap gap-2">
              <button className={`${mainBtn} btn-success px-4`} onClick={resume}>▶ Reanudar</button>
              <button className={`${mainBtn} btn-outline-light px-4`} onClick={reset}>↺ Reset</button>
            </div>
          )}

          {/* En break */}
          {t.timer.mode==='break' && (
            <div className="d-flex flex-wrap gap-2">
              <button className={`${mainBtn} btn-secondary px-4`} onClick={skipBreak}>⏭ Omitir descanso</button>
            </div>
          )}

          {/* Acciones secundarias */}
          <div className="d-flex flex-wrap gap-2 justify-content-end">
            <button className={`${smallBtn} btn-outline-light`} onClick={restartRound}>⟲ Reiniciar</button>
            <button className={`${smallBtn} btn-secondary`} onClick={prevRound} disabled={t.roundsCompleted<=0}>↩ Atrás</button>
            <button className={`${smallBtn} btn-secondary`} onClick={completeRound} disabled={t.roundsCompleted >= t.roundsTotal}>✅ Fin</button>
            <button className={`${smallBtn} btn-dark border`} onClick={nextRound} disabled={t.roundsCompleted >= t.roundsTotal}>⏭ Sig.</button>
            <button className={`${smallBtn} btn-outline-secondary`} onClick={()=>{
              const inp = prompt('Minutos nuevos (reemplaza el timer actual):');
              if (!inp) return; const v = Number(inp);
              if (!Number.isFinite(v) || v<=0) return;
              startRound(v, v+ 'm manual');
            }}>✎ Set</button>
          </div>
        </div>
      </div>
    </article>
  );
};

/* ====================== App raíz ====================== */
export const App: React.FC = () => (
  <ErrorBoundary>
    <MasterPanel />
  </ErrorBoundary>
);

/* =================== Anuncio avanzado =================== */
interface AnnouncementDraft { text: string; kind: 'info'|'warn'|'success'; duration: number; color: string; sound: boolean; }
const defaultAnnouncement: AnnouncementDraft = { text: '', kind: 'info', duration: 15000, color: '#6366f1', sound: true };

// Estado global simple (ref) para abrir configurador desde botón
const announcementState: { open: boolean; setOpen?: (v:boolean)=>void; submit?: (d:AnnouncementDraft)=>void; draft: AnnouncementDraft } = { open:false, draft: defaultAnnouncement };

const AnnouncementButton: React.FC<{ pushToast: (t: {kind:any; text:string; icon?:string})=>void }> = () => {
  return (
    <button className="btn btn-sm btn-outline-warning" onClick={()=>{ announcementState.open = true; announcementState.setOpen?.(true); }} title="Anuncio público avanzado (A)">📢 Anunciar</button>
  );
};

const AnnouncementConfigurator: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<AnnouncementDraft>(defaultAnnouncement);
  announcementState.setOpen = setOpen;
  announcementState.submit = (d) => setDraft(d);
  useEffect(()=>{ if(open) setDraft(announcementState.draft); },[open]);
  const close = () => { announcementState.open = false; setOpen(false); };
  const send = () => {
    if(!draft.text.trim()) return close();
    emitAnnouncement(`[${draft.kind.toUpperCase()}] ${draft.text}`, draft.kind==='warn'?'warn': draft.kind==='success'?'success':'info', draft.duration);
    if(draft.sound){ try { const ctx = new (window.AudioContext || (window as any).webkitAudioContext)(); const osc = ctx.createOscillator(); const gain = ctx.createGain(); osc.frequency.value = draft.kind==='warn'? 520 : draft.kind==='success'? 660 : 440; gain.gain.value = 0.08; osc.connect(gain).connect(ctx.destination); osc.start(); setTimeout(()=>osc.stop(), 260); } catch{} }
    close();
  };
  useEffect(()=>{
    if(!open) return; const key = (e: KeyboardEvent) => { if(e.key==='Escape'){ e.preventDefault(); close(); } if(e.key==='Enter' && (e.metaKey||e.ctrlKey)){ send(); } }; window.addEventListener('keydown', key); return ()=>window.removeEventListener('keydown', key);
  },[open, draft]);
  if(!open) return null;
  return (
    <div style={{position:'fixed', inset:0, zIndex:2500, display:'flex', alignItems:'center', justifyContent:'center'}} aria-modal="true" role="dialog">
      <div onClick={close} style={{position:'absolute', inset:0, background:'rgba(0,0,0,.55)', backdropFilter:'blur(2px)'}} />
      <div className="shadow-lg" style={{position:'relative', width:'min(640px, 92%)', background:'#12141a', border:'1px solid #2c313a', borderTop:`4px solid ${draft.color}`, borderRadius:12, padding:'1.25rem 1.25rem 1rem'}}>
        <div className="d-flex align-items-center mb-2">
          <h5 className="m-0">Anuncio público</h5>
          <button className="btn btn-sm btn-outline-secondary ms-auto" onClick={close}>✕</button>
        </div>
        <div className="mb-3">
          <label className="form-label">Mensaje</label>
          <textarea className="form-control" maxLength={500} rows={3} value={draft.text} onChange={e=>setDraft(d=>({...d, text:e.target.value}))} />
          <div className="form-text text-secondary">Máx 500 caracteres</div>
        </div>
        <div className="row g-2">
          <div className="col-6">
            <label className="form-label">Tipo</label>
            <select className="form-select" value={draft.kind} onChange={e=>setDraft(d=>({...d, kind:e.target.value as any}))}>
              <option value="info">Info</option>
              <option value="warn">Aviso</option>
              <option value="success">Éxito</option>
            </select>
          </div>
          <div className="col-6">
            <label className="form-label">Duración (s)</label>
            <input type="number" className="form-control" min={1} max={180} value={draft.duration/1000} onChange={e=>setDraft(d=>({...d, duration: Math.min(180, Math.max(1, Number(e.target.value)))*1000}))} />
          </div>
          <div className="col-6">
            <label className="form-label">Color</label>
            <input type="color" className="form-control form-control-color" value={draft.color} onChange={e=>setDraft(d=>({...d, color:e.target.value}))} />
          </div>
          <div className="col-6 d-flex align-items-end">
            <div className="form-check">
              <input className="form-check-input" type="checkbox" id="ann-snd" checked={draft.sound} onChange={e=>setDraft(d=>({...d, sound:e.target.checked}))} />
              <label className="form-check-label" htmlFor="ann-snd">Sonido</label>
            </div>
          </div>
        </div>
        <div className="mt-3 small text-secondary">Enter (Ctrl/Cmd) para enviar • ESC para cerrar</div>
        <div className="mt-3 d-flex gap-2 justify-content-end">
          <button className="btn btn-outline-light" onClick={close}>Cancelar</button>
          <button className="btn btn-primary" style={{background:draft.color,borderColor:draft.color}} onClick={send} disabled={!draft.text.trim()}>Enviar</button>
        </div>
      </div>
    </div>
  );
};
