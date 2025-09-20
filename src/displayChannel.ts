// Canal de sincronización Display <-> App (BroadcastChannel)
export type TimeFmt = "24" | "12";
export type TimerMode = "round" | "break" | "custom";

export interface DisplayTimer {
  target: number | null;
  remainingMs: number;
  running: boolean;
  label: string;
  mode: TimerMode;
}

export interface DisplayTournament {
  id: string;
  name: string;
  game: string;
  roundsTotal: number;
  roundsCompleted: number;
  roundMinutes: number;
  breakEnabled: boolean;
  breakMinutes: number;
  autoStartNext: boolean;
  nextRoundMinutes?: number | null;
  timer: DisplayTimer;
  createdAt: number;
  theme?: 'dark'|'light';
}

export interface DisplayStateMsg {
  type: "STATE";
  now: number;
  timeFmt: TimeFmt;
  tournaments: DisplayTournament[];
}

export interface AnnouncementMsg {
  type: "ANNOUNCE";
  text: string;
  level: 'info'|'warn'|'success';
  duration: number; // ms
}

export interface AdvancedAnnouncementMsg {
  type: 'ANNOUNCE_ADV';
  // targets: undefined or empty => broadcast to all displays; otherwise array of tournament ids
  targets?: string[];
  // kind: 'text' | 'image' | 'url'
  kind: 'text' | 'image' | 'url';
  payload: {
    text?: string;
    // base64 data URL for image uploads (recommended 1:1)
    imageDataUrl?: string;
    // optional: hint about aspect ratio
    imageAspect?: string;
    // url for special iframe announcements
    url?: string;
    // whether the URL iframe should be fully interactive (no sandbox)
    interactive?: boolean;
  };
  persistent?: boolean; // if true, display should keep until replaced
  duration?: number; // ms — used when not persistent
}

export interface ClearAnnouncementMsg {
  type: 'ANNOUNCE_CLEAR';
  // targets: undefined or empty => broadcast to all displays; otherwise array of tournament ids
  targets?: string[];
}

export interface DisplayZoomMsg {
  type: 'DISPLAY_ZOOM';
  // targets: undefined or empty => broadcast to all displays; otherwise array of tournament ids
  targets?: string[];
  // zoom scale factor (e.g., 0.5 .. 2.0)
  zoom: number;
}

const CHANNEL = "sigad-display";

// En APP: emite todos los torneos (se llama cada cambio de estado)
export function emitAll(tournaments: any[], timeFmt: TimeFmt) {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    // strip básico por si el objeto tiene métodos/refs
    const payload: DisplayStateMsg = {
      type: "STATE",
      now: Date.now(),
      timeFmt,
      tournaments: tournaments.map((t) => ({
        id: t.id,
        name: t.name,
        game: t.game,
        roundsTotal: t.roundsTotal,
        roundsCompleted: t.roundsCompleted,
        roundMinutes: t.roundMinutes,
        breakEnabled: t.breakEnabled,
        breakMinutes: t.breakMinutes,
        autoStartNext: t.autoStartNext,
        nextRoundMinutes: t.nextRoundMinutes ?? null,
        timer: {
          target: t.timer?.target ?? null,
          remainingMs: t.timer?.remainingMs ?? 0,
          running: !!t.timer?.running,
          label: String(t.timer?.label ?? ""),
          mode: t.timer?.mode ?? "custom",
        },
        createdAt: t.createdAt,
        theme: (t.displayTheme ?? 'dark') as 'dark'|'light',
      })),
    };
    ch.postMessage(payload);
    ch.close();
  } catch {}
}

// En APP: abre la ventana del display (un visor por torneo o vista global)
export function openDisplayWindow(id?: string) {
  const qs = id ? `?id=${encodeURIComponent(id)}` : "";
  const name = `SIGAD_DISPLAY_${id ?? "all"}`;
  window.open(`/display.html${qs}`, name, "width=1280,height=720,noopener");
}

// En DISPLAY: suscribirse a cambios de estado
export function subscribeDisplay(onState: (s: DisplayStateMsg) => void) {
  const ch = new BroadcastChannel(CHANNEL);
  const handler = (ev: MessageEvent) => {
    const d = ev.data as DisplayStateMsg | AnnouncementMsg;
    if ((d as any)?.type === "STATE") onState(d as DisplayStateMsg);
  };
  ch.addEventListener("message", handler);
  return () => ch.close();
}

// Emitir un anuncio para el HUD (DISPLAY). El HUD decidirá cómo mostrarlo.
export function emitAnnouncement(text: string, level: 'info'|'warn'|'success' = 'info', duration = 8000) {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    const payload: AnnouncementMsg = { type: 'ANNOUNCE', text, level, duration };
    ch.postMessage(payload);
    ch.close();
  } catch {}
}

// Emit a richer, targeted announcement. targets undefined or empty means broadcast to all.
export function emitAdvancedAnnouncement(msg: {
  targets?: string[];
  kind: 'text'|'image'|'url';
  payload: { text?: string; imageDataUrl?: string; imageAspect?: string; url?: string; interactive?: boolean };
  persistent?: boolean;
  duration?: number;
}) {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    const payload: AdvancedAnnouncementMsg = {
      type: 'ANNOUNCE_ADV',
      targets: msg.targets && msg.targets.length ? msg.targets : undefined,
      kind: msg.kind,
      payload: msg.payload,
      persistent: !!msg.persistent,
      duration: msg.duration ?? 8000,
    };
    ch.postMessage(payload);
    ch.close();
  } catch {}
}

// Clear active advanced announcement on targeted displays
export function emitClearAnnouncement(opts?: { targets?: string[] }) {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    const payload: ClearAnnouncementMsg = {
      type: 'ANNOUNCE_CLEAR',
      targets: opts?.targets && opts.targets.length ? opts.targets : undefined,
    };
    ch.postMessage(payload);
    ch.close();
  } catch {}
}

// Emit a zoom command to targeted displays. Zoom recommended range: 0.5 - 2.0
export function emitDisplayZoom(opts: { targets?: string[]; zoom: number }) {
  try {
    const ch = new BroadcastChannel(CHANNEL);
    const payload: DisplayZoomMsg = {
      type: 'DISPLAY_ZOOM',
      targets: opts.targets && opts.targets.length ? opts.targets : undefined,
      zoom: opts.zoom,
    };
    ch.postMessage(payload);
    ch.close();
  } catch {}
}

// Compatibilidad: algunas versiones del HUD esperan subscribeAnnouncements
// Devuelve una función para desuscribirse, igual que subscribeDisplay
export function subscribeAnnouncements(onAnnounce: (a: AnnouncementMsg) => void) {
  const ch = new BroadcastChannel(CHANNEL);
  const handler = (ev: MessageEvent) => {
    const d = ev.data as DisplayStateMsg | AnnouncementMsg;
    if ((d as any)?.type === 'ANNOUNCE') onAnnounce(d as AnnouncementMsg);
  };
  ch.addEventListener('message', handler);
  return () => ch.close();
}

// Subscribe to advanced announcement messages (targeted, image, url, persistent)
export function subscribeAdvancedAnnouncements(onAnn: (a: AdvancedAnnouncementMsg) => void) {
  const ch = new BroadcastChannel(CHANNEL);
  const handler = (ev: MessageEvent) => {
    const d = ev.data as any;
    if (d && d.type === 'ANNOUNCE_ADV') onAnn(d as AdvancedAnnouncementMsg);
  };
  ch.addEventListener('message', handler);
  return () => ch.close();
}

// Subscribe to clear announcement messages
export function subscribeClearAnnouncements(onClear: (a: ClearAnnouncementMsg) => void) {
  const ch = new BroadcastChannel(CHANNEL);
  const handler = (ev: MessageEvent) => {
    const d = ev.data as any;
    if (d && d.type === 'ANNOUNCE_CLEAR') onClear(d as ClearAnnouncementMsg);
  };
  ch.addEventListener('message', handler);
  return () => ch.close();
}

// Subscribe to display zoom control messages
export function subscribeDisplayZoom(onZoom: (z: DisplayZoomMsg) => void) {
  const ch = new BroadcastChannel(CHANNEL);
  const handler = (ev: MessageEvent) => {
    const d = ev.data as any;
    if (d && d.type === 'DISPLAY_ZOOM') onZoom(d as DisplayZoomMsg);
  };
  ch.addEventListener('message', handler);
  return () => ch.close();
}
