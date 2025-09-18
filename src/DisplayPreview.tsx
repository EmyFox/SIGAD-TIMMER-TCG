import React, { useEffect, useMemo, useRef, useState } from 'react';
import { emitAll, type TimeFmt } from './displayChannel';
import type { Tournament } from './App';

type HudDensity = 'compact' | 'standard' | 'expanded';
const HUD_DENSITIES: HudDensity[] = ['compact', 'standard', 'expanded'];
const HUD_DENSITY_KEY_GLOBAL = 'sigad-hud-density';
const HUD_SCALE_KEY_GLOBAL = 'sigad-hud-scale';
const ZOOM_PRESETS = [70, 85, 100, 115, 130, 140];

/**
 * DisplayPreview • v4.2
 * - Prioriza torneos corriendo (max 3).
 * - Escala 16:9 con modos: contain / width / height (persistentes por ID).
 * - ResizeObserver: el preview se adapta al ancho real del panel.
 * - Micro-HUD superpuesto (estado + countdown + fase) responsive.
 * - Carga con shimmer y spinner; indicador de escala/mode.
 * - Drag de altura (sidebar) + drag de altura (overlay) + wheel fine-tune.
 * - Escala nítida: “snap” a pasos pequeños considerando devicePixelRatio.
 * - Atajos: ESC cierra overlay; Doble clic en barra = reset; Doble clic en preview = cambia modo.
 * - NUEVO: Barra de herramientas con **grupos** (Ajuste/Expandir · Tema/FX · Ventana/Recargar),
 *          separadores fluidos y etiquetas que aparecen en md+ (icon-only en móvil).
 */
export const DisplayPreview: React.FC<{
  tournaments: Tournament[];
  timeFmt: TimeFmt;
  onToggleTheme: (id: string) => void;
}> = ({ tournaments, timeFmt, onToggleTheme }) => {
  /* ---------- Orden de previews ---------- */
  const sorted = useMemo(() => {
    const running = tournaments.filter(t => t.timer.running);
    const others = tournaments.filter(t => !t.timer.running);
    return [...running, ...others].slice(0, 3);
  }, [tournaments]);

  /* ---------- Persistencia ---------- */
  const readObj = (k: string) => {
    try {
      const o = JSON.parse(localStorage.getItem(k) || '{}');
      return (o && typeof o === 'object') ? (o as Record<string, any>) : {};
    } catch { return {}; }
  };
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v|0));

  // Sidebar heights
  const LS_H = 'sigad_preview_h_v4';
  const [heights, setHeights] = useState<Record<string, number>>(() => readObj(LS_H));
  const DEFAULT_H = 260;
  const clampSidebarH = (v: number) => clamp(v, 140, 860);

  // FX on/off
  const LS_FX = 'sigad_preview_fx_v1';
  const [fxMap, setFxMap] = useState<Record<string, boolean>>(() => readObj(LS_FX));

  // Fit mode
  const LS_FIT = 'sigad_preview_fit_v1';
  const [fitMap, setFitMap] = useState<Record<string, 'contain'|'width'|'height'>>(() => readObj(LS_FIT));

  // HUD density
  const LS_DENSITY = 'sigad_preview_density_v1';
  const [densityMap, setDensityMap] = useState<Record<string, HudDensity>>(() => readObj(LS_DENSITY));

  // HUD scale
  const LS_SCALE = 'sigad_preview_scale_v1';
  const [scaleMap, setScaleMap] = useState<Record<string, number>>(() => readObj(LS_SCALE));

  // Overlay heights
  const LS_H_EXP = 'sigad_preview_h_exp_v1';
  const [expHeights, setExpHeights] = useState<Record<string, number>>(() => readObj(LS_H_EXP));
  const DEFAULT_H_EXP = 580;
  const clampOverlayH = (v: number) => clamp(v, 240, Math.max(780, Math.floor(window.innerHeight * 0.95)));

  useEffect(() => { try { localStorage.setItem(LS_H, JSON.stringify(heights)); } catch {} }, [heights]);
  useEffect(() => { try { localStorage.setItem(LS_FX, JSON.stringify(fxMap)); } catch {} }, [fxMap]);
  useEffect(() => { try { localStorage.setItem(LS_FIT, JSON.stringify(fitMap)); } catch {} }, [fitMap]);
  useEffect(() => { try { localStorage.setItem(LS_DENSITY, JSON.stringify(densityMap)); } catch {} }, [densityMap]);
  useEffect(() => { try { localStorage.setItem(LS_SCALE, JSON.stringify(scaleMap)); } catch {} }, [scaleMap]);
  useEffect(() => { try { localStorage.setItem(LS_H_EXP, JSON.stringify(expHeights)); } catch {} }, [expHeights]);

  const getH     = (id: string) => clampSidebarH(heights[id] ?? DEFAULT_H);
  const setH     = (id: string, v: number) => setHeights(prev => ({ ...prev, [id]: clampSidebarH(v) }));
  const isFxOn   = (id: string) => fxMap[id] !== false; // por defecto ON
  const toggleFx = (id: string) => setFxMap(prev => ({ ...prev, [id]: !(prev[id] !== false) }));
  const getFit   = (id: string) => (fitMap[id] ?? 'contain') as 'contain'|'width'|'height';
  const cycleFit = (id: string) => setFitMap(prev => {
    const cur = (prev[id] ?? 'contain') as 'contain'|'width'|'height';
    const next = cur === 'contain' ? 'width' : cur === 'width' ? 'height' : 'contain';
    return { ...prev, [id]: next };
  });
  const pushDensity = (id: string, mode: HudDensity) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '*';
    const targetOrigin = origin || '*';
    const frame = document.getElementById(`prev-${id}`) as HTMLIFrameElement | null;
    frame?.contentWindow?.postMessage({ type: 'HUD_DENSITY', value: mode }, targetOrigin);
    const expanded = document.getElementById(`prev-exp-${id}`) as HTMLIFrameElement | null;
    expanded?.contentWindow?.postMessage({ type: 'HUD_DENSITY', value: mode }, targetOrigin);
    try { localStorage.setItem(HUD_DENSITY_KEY_GLOBAL, mode); } catch {}
  };
  const pushScale = (id: string, value: number) => {
    const origin = typeof window !== 'undefined' ? window.location.origin : '*';
    const targetOrigin = origin || '*';
    const frame = document.getElementById(`prev-${id}`) as HTMLIFrameElement | null;
    frame?.contentWindow?.postMessage({ type: 'HUD_SCALE', value }, targetOrigin);
    const expanded = document.getElementById(`prev-exp-${id}`) as HTMLIFrameElement | null;
    expanded?.contentWindow?.postMessage({ type: 'HUD_SCALE', value }, targetOrigin);
    try { localStorage.setItem(HUD_SCALE_KEY_GLOBAL, String(value)); } catch {}
  };
  const getDensity = (id: string): HudDensity => (densityMap[id] as HudDensity) ?? 'standard';
  const setDensity = (id: string, mode: HudDensity) => setDensityMap(prev => ({ ...prev, [id]: mode }));
  const applyDensity = (id: string, mode: HudDensity) => {
    setDensity(id, mode);
    pushDensity(id, mode);
  };
  const cycleDensityMode = (id: string) => {
    const current = getDensity(id);
    const idx = HUD_DENSITIES.indexOf(current);
    const next = HUD_DENSITIES[(idx + 1) % HUD_DENSITIES.length];
    applyDensity(id, next);
  };
  const densityLabel = (mode: HudDensity) => (mode === 'compact' ? 'Compacto' : mode === 'expanded' ? 'Amplio' : 'Equilibrado');
  const clampScalePct = (v: number) => Math.max(70, Math.min(140, Math.round(v)));
  const getScale = (id: string) => clampScalePct(scaleMap[id] ?? 100);
  const updateScale = (id: string, value: number) => {
    const next = clampScalePct(value);
    setScaleMap(prev => {
      if (prev[id] === next) return prev;
      return { ...prev, [id]: next };
    });
    pushScale(id, next);
  };
  const nudgeScale = (id: string, delta: number) => {
    const current = getScale(id);
    updateScale(id, current + delta);
  };
  const getExpH  = (id: string) => clampOverlayH(expHeights[id] ?? DEFAULT_H_EXP);
  const setExpH  = (id: string, v: number) => setExpHeights(prev => ({ ...prev, [id]: clampOverlayH(v) }));

  /* ---------- Base display 16:9 ---------- */
  const baseW = 1280, baseH = 720;

  /* ---------- Sincronización inicial con displays ---------- */
  useEffect(() => { try { emitAll(tournaments, timeFmt); } catch {} }, [tournaments, timeFmt]);

  /* ---------- TICK local para HUD (countdown vivo) ---------- */
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick(v => (v+1)%1_000_000), 1000);
    return () => clearInterval(id);
  }, []);

  /* ---------- Drag (sidebar) ---------- */
  const [hoverId, setHoverId] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const prevCursorRef = useRef<string>('');
  const prevUserSelectRef = useRef<string>('');
  const dragRef = useRef<{ id: string; startY: number; startH: number } | null>(null);

  const onPointerMove = (e: PointerEvent) => {
    if (!dragRef.current) return;
    const dy = e.clientY - dragRef.current.startY;
    const nh = clampSidebarH(dragRef.current.startH + dy);
    setH(dragRef.current.id, nh);
  };
  const endDrag = () => {
    dragRef.current = null;
    setDraggingId(null);
    document.body.style.cursor = prevCursorRef.current;
    (document.body.style as any).userSelect = prevUserSelectRef.current;
    window.removeEventListener('pointermove', onPointerMove as any);
    window.removeEventListener('pointerup', endDrag as any);
  };
  const onDragStart = (id: string) => (e: React.PointerEvent) => {
    dragRef.current = { id, startY: e.clientY, startH: getH(id) };
    setDraggingId(id);
    prevCursorRef.current = document.body.style.cursor;
    prevUserSelectRef.current = (document.body.style as any).userSelect || '';
    document.body.style.cursor = 'ns-resize';
    (document.body.style as any).userSelect = 'none';
    window.addEventListener('pointermove', onPointerMove as any);
    window.addEventListener('pointerup', endDrag as any);
  };
  useEffect(() => () => { endDrag(); }, []);

  // Wheel fine-tune en la barra (Alt = +/− 6px, Shift = +/− 2px, normal = 12px)
  const wheelAdjust = (id: string) => (e: React.WheelEvent) => {
    const step = e.shiftKey ? 2 : e.altKey ? 6 : 12;
    const dir = Math.sign(e.deltaY);
    setH(id, getH(id) + dir * step);
  };

  /* ---------- Overlay (expandido) ---------- */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const overlayDragRef = useRef<{ startY: number; startH: number } | null>(null);
  const [overlayDragging, setOverlayDragging] = useState(false);
  const [hudMenuFor, setHudMenuFor] = useState<string | null>(null);
  const hudMenuRef = useRef<HTMLDivElement | null>(null);
  const hudButtonRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const toggleHudMenu = (id: string) => setHudMenuFor(prev => (prev === id ? null : id));
  const closeHudMenu = () => setHudMenuFor(null);
  const onOverlayMove = (e: PointerEvent) => {
    if (!overlayDragRef.current || !expandedId) return;
    const dy = e.clientY - overlayDragRef.current.startY;
    const nh = clampOverlayH(overlayDragRef.current.startH + dy);
    setExpH(expandedId, nh);
  };
  const endOverlayDrag = () => {
    overlayDragRef.current = null;
    setOverlayDragging(false);
    document.body.style.cursor = prevCursorRef.current;
    (document.body.style as any).userSelect = prevUserSelectRef.current;
    window.removeEventListener('pointermove', onOverlayMove as any);
    window.removeEventListener('pointerup', endOverlayDrag as any);
  };
  const startOverlayDrag = (e: React.PointerEvent) => {
    if (!expandedId) return;
    overlayDragRef.current = { startY: e.clientY, startH: getExpH(expandedId) };
    setOverlayDragging(true);
    prevCursorRef.current = document.body.style.cursor;
    prevUserSelectRef.current = (document.body.style as any).userSelect || '';
    document.body.style.cursor = 'ns-resize';
    (document.body.style as any).userSelect = 'none';
    window.addEventListener('pointermove', onOverlayMove as any);
    window.addEventListener('pointerup', endOverlayDrag as any);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && expandedId) setExpandedId(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [expandedId]);

  useEffect(() => {
    if (!hudMenuFor) {
      hudMenuRef.current = null;
      return;
    }
    const onPointer = (e: PointerEvent) => {
      const menuEl = hudMenuRef.current;
      const btnEl = hudButtonRefs.current[hudMenuFor];
      const target = e.target as Node | null;
      if (menuEl && menuEl.contains(target)) return;
      if (btnEl && btnEl.contains(target)) return;
      setHudMenuFor(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setHudMenuFor(null);
    };
    window.addEventListener('pointerdown', onPointer);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('keydown', onKey);
    };
  }, [hudMenuFor]);

  /* ---------- Medición de ancho por tarjeta (ResizeObserver) ---------- */
  const [boxW, setBoxW] = useState<Record<string, number>>({});
  const observersRef = useRef<Record<string, ResizeObserver | null>>({});
  const boxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const setBoxRef = (id: string) => (el: HTMLDivElement | null) => {
    boxRefs.current[id] = el;
    if (typeof ResizeObserver === 'undefined') {
      const w = el?.getBoundingClientRect().width ?? 0;
      if (w) setBoxW(prev => (prev[id] === w ? prev : { ...prev, [id]: w }));
      return;
    }
    observersRef.current[id]?.disconnect();
    if (!el) return;
    const ro = new ResizeObserver(entries => {
      for (const entry of entries) {
        const w = Math.max(0, Math.floor(entry.contentRect.width));
        setBoxW(prev => (prev[id] === w ? prev : { ...prev, [id]: w }));
      }
    });
    ro.observe(el);
    observersRef.current[id] = ro;
  };
  useEffect(() => () => {
    Object.values(observersRef.current).forEach(o => o?.disconnect());
    observersRef.current = {};
  }, []);

  /* ---------- Carga/estado de iframes ---------- */
  const [loaded, setLoaded] = useState<Record<string, boolean>>({});
  const markLoaded = (id: string) => {
    setLoaded(prev => ({ ...prev, [id]: true }));
    pushDensity(id, getDensity(id));
    pushScale(id, getScale(id));
  };
  const reloadFrame = (id: string) => {
    const iframe = document.getElementById(id) as HTMLIFrameElement | null;
    if (!iframe) return;
    setLoaded(prev => ({ ...prev, [id.replace('prev-', '').replace('prev-exp-', '')]: false }));
    const s = iframe.src;
    iframe.src = 'about:blank';
    setTimeout(() => { iframe.src = s; }, 30);
  };

  /* ---------- Helpers ---------- */
  const fmtClock = (tf: TimeFmt) => (tf === '12' ? 'hh:mm A' : 'HH:mm');
  const pad2 = (n: number) => n.toString().padStart(2, '0');
  const formatSplit = (ms: number) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    return `${pad2(h)}:${pad2(m)}:${pad2(s)}`;
  };
  const computeRemaining = (t: Tournament) => {
    const now = Date.now();
    if (!t.timer) return 0;
    const { target, remainingMs, running } = t.timer;
    if (target && running) return Math.max(0, target - now);
    return Math.max(0, remainingMs || 0);
  };
  const stateInfo = (t: Tournament) => {
    const rem = computeRemaining(t);
    const expired = !t.timer.running && t.timer.target !== null && rem <= 0;
    const state = expired ? 'Terminado' : t.timer.running ? 'En curso' : t.timer.target ? 'Pausado' : 'Sin iniciar';
    const color =
      state === 'En curso' ? '#10b981'
      : state === 'Pausado' ? '#f59e0b'
      : state === 'Terminado' ? '#ef4444'
      : '#9ca3af';
    const inRound = t.timer.mode === 'round' && (t.timer.running || t.timer.remainingMs > 0);
    const roundIdx = inRound ? t.roundsCompleted + 1 : t.roundsCompleted;
    const phase =
      t.timer.mode === 'break' ? 'Break'
      : `Ronda ${Math.max(1, Math.min(roundIdx || 1, t.roundsTotal))}/${t.roundsTotal}`;
    return { state, color, remaining: rem, remainingFmt: formatSplit(rem), phase };
  };

  // DPR-aware snapping para nitidez
  const snapScale = (s: number) => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const step = 0.05 / dpr;
    return Math.max(0.1, Math.round(s / step) * step);
  };

  /* ---------- Render ---------- */
  return (
    <>
      <section aria-label="Previews del display" className="d-flex flex-column gap-3">
        <div className="d-flex align-items-center justify-content-between flex-wrap gap-2">
          <h6 className="m-0 text-secondary">Previews ({sorted.length})</h6>
          <div className="small text-secondary text-opacity-75">
            Arrastra la barra para altura · Doble clic (barra) = reset · Doble clic (preview) = cambiar ajuste
          </div>
        </div>

        {sorted.length === 0 && (
          <div className="text-secondary small">No hay torneos</div>
        )}

        {sorted.map(t => {
          const hNow = getH(t.id);
          const fit = getFit(t.id);
          const density = getDensity(t.id);
          const hudScale = getScale(t.id);
          const themeParam = (t.displayTheme || 'dark') === 'light' ? '&theme=light' : '';
          const baseUrl = `/display.html?id=${encodeURIComponent(t.id)}${isFxOn(t.id) ? '' : '&nofx=1'}${themeParam}`;
          const windowUrl = `${baseUrl}&hud=${density}&scale=${hudScale}`;

          // Medición de ancho disponible:
          const availW = Math.max(240, (boxW[t.id] ?? 0) || 0);

          // Escalas por alto y por ancho:
          const sH = Math.max(0.1, hNow / baseH);
          const sW = Math.max(0.1, availW / baseW);
          const raw = fit === 'height' ? sH : fit === 'width' ? sW : Math.min(sH, sW);
          const previewScale = snapScale(raw);

          const frameW = Math.round(baseW * previewScale);
          const frameH = Math.round(baseH * previewScale);
          const previewScalePct = Math.round(previewScale * 100);

          const { state, color, remainingFmt, phase } = stateInfo(t);
          const wantsHudMenu = hudMenuFor === t.id;
          const showHudMenuHere = wantsHudMenu && expandedId !== t.id;
          const hudButtonActive = wantsHudMenu;
          const densityName = densityLabel(density);
          const fitLabel = fit === 'contain' ? 'Contener' : fit === 'width' ? 'Ancho' : 'Alto';

          return (
            <div key={t.id} className="card bg-body border-0 shadow-sm" style={{ overflow: 'hidden' }}>
              {/* ===== Header con grupos ===== */}
              <div className="card-header bg-body border-0 py-2">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <strong className="text-truncate">{t.name}</strong>
                  <span className="badge text-bg-secondary">{t.game}</span>

                  <div className="ms-auto d-flex align-items-center flex-wrap gap-2">
                    {/* Grupo 1: Ajuste + HUD + Expandir */}
                    <div className="position-relative">
                      <div className="btn-group btn-group-sm" role="group" aria-label="Ajuste y HUD">
                        <button
                          className="btn btn-outline-light"
                          onClick={() => cycleFit(t.id)}
                        title={`Ajuste: ${fitLabel}`}
                          aria-label="Cambiar modo de ajuste"
                        >
                          {fit === 'contain' ? '⤧' : fit === 'width' ? '⇔' : '⇕'}
                          <span className="d-none d-md-inline ms-1">{fitLabel}</span>
                        </button>
                        <button
                          className={hudButtonActive ? 'btn btn-light' : 'btn btn-outline-light'}
                          onClick={() => toggleHudMenu(t.id)}
                          ref={el => { hudButtonRefs.current[t.id] = el; }}
                          title={`Zoom HUD: ${hudScale}% · ${densityName}`}
                          aria-expanded={hudButtonActive}
                          aria-controls={`hud-menu-${t.id}`}
                        >
                          {density === 'compact' ? '▣' : density === 'expanded' ? '▢' : '▤'}
                          <span className="d-none d-md-inline ms-1">HUD</span>
                        </button>
                        <button className="btn btn-primary" onClick={() => setExpandedId(t.id)} title="Expandir preview">
                          ⤢ <span className="d-none d-md-inline ms-1">Expandir</span>
                        </button>
                      </div>
                      <div className="btn-group btn-group-sm ms-2" role="group" aria-label="Zoom del HUD">
                        <button
                          type="button"
                          className="btn btn-outline-light"
                          onClick={() => nudgeScale(t.id, -5)}
                          title="Reducir zoom del HUD"
                          aria-label="Reducir zoom del HUD"
                        >
                          −
                        </button>
                        <button
                          type="button"
                          className="btn btn-outline-light"
                          onClick={() => nudgeScale(t.id, 5)}
                          title="Ampliar zoom del HUD"
                          aria-label="Ampliar zoom del HUD"
                        >
                          +
                        </button>
                      </div>
                      {showHudMenuHere && (
                        <div
                          id={`hud-menu-${t.id}`}
                          ref={el => { if (showHudMenuHere) hudMenuRef.current = el; }}
                          className="hud-config-menu shadow"
                          role="dialog"
                          aria-label="Opciones de HUD"
                        >
                          <div className="hud-config-menu__section">
                            <div className="hud-config-menu__label">Densidad</div>
                            <div className="btn-group btn-group-sm w-100" role="group" aria-label="Modo de densidad">
                              <button
                                type="button"
                                className={`btn ${density === 'compact' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                                onClick={() => applyDensity(t.id, 'compact')}
                              >
                                Compacto
                              </button>
                              <button
                                type="button"
                                className={`btn ${density === 'standard' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                                onClick={() => applyDensity(t.id, 'standard')}
                              >
                                Equilibrado
                              </button>
                              <button
                                type="button"
                                className={`btn ${density === 'expanded' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                                onClick={() => applyDensity(t.id, 'expanded')}
                              >
                                Amplio
                              </button>
                            </div>
                          </div>
                          <div className="hud-config-menu__section">
                            <div className="hud-config-menu__label d-flex justify-content-between align-items-center">
                              <span>Zoom del HUD</span>
                              <span className="badge text-bg-secondary">{hudScale}%</span>
                            </div>
                            <input
                              type="range"
                              min={70}
                              max={140}
                              step={5}
                              value={hudScale}
                              onChange={e => updateScale(t.id, Number(e.target.value))}
                              className="form-range hud-config-menu__slider"
                              aria-label="Zoom del HUD"
                            />
                            <div className="d-flex justify-content-between text-muted small">
                              <span>Menos zoom</span>
                              <span>Más zoom</span>
                            </div>
                            <div className="d-flex flex-wrap gap-2 mt-2">
                              {ZOOM_PRESETS.map(val => (
                                <button
                                  key={val}
                                  type="button"
                                  className={`btn btn-sm ${hudScale === val ? 'btn-secondary' : 'btn-outline-secondary'}`}
                                  onClick={() => updateScale(t.id, val)}
                                >
                                  {val}%
                                </button>
                              ))}
                            </div>
                          </div>
                          <button
                            type="button"
                            className="btn btn-link p-0 small text-decoration-none"
                            onClick={closeHudMenu}
                          >
                            Cerrar
                          </button>
                        </div>
                      )}
                    </div>

                    <div className="toolbar-sep d-none d-sm-block" aria-hidden />

                    {/* Grupo 2: Tema + FX */}
                    <div className="btn-group btn-group-sm" role="group" aria-label="Tema y efectos">
                      <button
                        className={(t.displayTheme || 'dark') === 'light' ? 'btn btn-warning' : 'btn btn-outline-warning'}
                        onClick={() => onToggleTheme(t.id)}
                        title="Alternar tema del display (claro/oscuro)"
                      >
                        {(t.displayTheme || 'dark') === 'light' ? '🌞' : '🌙'}
                        <span className="d-none d-md-inline ms-1">Tema</span>
                      </button>
                      <button
                        className={isFxOn(t.id) ? 'btn btn-outline-warning' : 'btn btn-warning'}
                        onClick={() => toggleFx(t.id)}
                        title={isFxOn(t.id) ? 'Desactivar efectos' : 'Activar efectos'}
                      >
                        {isFxOn(t.id) ? '✨' : '🚫'}
                        <span className="d-none d-md-inline ms-1">FX</span>
                      </button>
                    </div>

                    <div className="toolbar-sep d-none d-sm-block" aria-hidden />

                    {/* Grupo 3: Ventana + Recargar */}
                    <div className="btn-group btn-group-sm" role="group" aria-label="Ventana y recargar">
                      <a
                        className="btn btn-outline-light"
                        href={windowUrl}
                        target={`SIGAD_DISPLAY_${t.id}`}
                        rel="noreferrer"
                        title="Abrir en ventana"
                      >
                        ↗ <span className="d-none d-md-inline ms-1">Ventana</span>
                      </a>
                      <button
                        className="btn btn-outline-light"
                        onClick={() => reloadFrame(`prev-${t.id}`)}
                        title="Recargar"
                      >
                        ↻ <span className="d-none d-md-inline ms-1">Recargar</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>

              {/* ===== Body ===== */}
              <div className="card-body p-0 position-relative">
                {/* Área medible (ancho) */}
                <div
                  ref={setBoxRef(t.id)}
                  style={{
                    height: hNow,
                    display: 'grid',
                    placeItems: 'center',
                    background: 'linear-gradient(180deg, rgba(255,255,255,.03), transparent)'
                  }}
                >
                  <div
                    onDoubleClick={() => cycleFit(t.id)}
                    style={{
                      width: frameW,
                      height: frameH,
                      overflow: 'hidden',
                      borderRadius: 10,
                      position: 'relative',
                      transition: 'width 120ms ease, height 120ms ease'
                    }}
                    title="Doble clic para cambiar el modo de ajuste"
                  >
                    {/* Skeleton / Spinner mientras carga */}
                    {!loaded[t.id] && (
                      <div
                        className="position-absolute top-0 start-0 w-100 h-100"
                        style={{
                          background:
                            'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.12) 37%, rgba(255,255,255,0.05) 63%)',
                          backgroundSize: '400% 100%',
                          animation: 'sigad-shimmer 1.2s ease-in-out infinite'
                        }}
                      >
                        <div className="position-absolute top-50 start-50 translate-middle spinner-border spinner-border-sm text-secondary" />
                      </div>
                    )}

                    {/* Micro-HUD superpuesto */}
                    <div
                      className="position-absolute d-flex align-items-center gap-2 px-2 py-1"
                      style={{
                        top: 6,
                        left: 6,
                        borderRadius: 8,
                        backdropFilter: 'blur(6px)',
                        background: 'rgba(17,17,17,.45)',
                        color: '#e5e7eb',
                        fontSize: frameW < 420 ? 11 : 12,
                        lineHeight: 1.1,
                        zIndex: 2
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: '1px solid rgba(255,255,255,.12)',
                          background: 'rgba(0,0,0,.25)'
                        }}
                        title="Estado"
                      >
                        <span
                          style={{
                            width: 8,
                            height: 8,
                            borderRadius: 999,
                            background: color,
                            boxShadow: `0 0 0 3px ${color}22`
                          }}
                          aria-hidden
                        />
                        <strong style={{ letterSpacing: .2 }}>{state}</strong>
                      </span>

                      <span
                        className="d-none d-sm-inline"
                        style={{
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: '1px solid rgba(255,255,255,.12)',
                          background: 'rgba(0,0,0,.25)'
                        }}
                        title="Tiempo restante"
                      >
                        ⏱ {remainingFmt}
                      </span>

                      <span
                        className="d-none d-md-inline text-truncate"
                        style={{
                          maxWidth: frameW < 520 ? 140 : 260,
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: '1px solid rgba(255,255,255,.12)',
                          background: 'rgba(0,0,0,.25)'
                        }}
                        title="Fase"
                      >
                        {phase}
                      </span>
                    </div>

                    {/* IFRAME */}
                    <iframe
                      id={`prev-${t.id}`}
                      src={baseUrl}
                      title={`preview-${t.name}`}
                      onLoad={() => markLoaded(t.id)}
                      style={{
                        width: baseW,
                        height: baseH,
                        border: 0,
                        transform: `scale(${previewScale}) translateZ(0)`,
                        transformOrigin: 'top left',
                        willChange: 'transform',
                        background: 'transparent'
                      }}
                    />

                    {/* Esquina: escala + modo */}
                    <div
                      className="position-absolute"
                      style={{
                        right: 6,
                        bottom: 6,
                        padding: '2px 8px',
                        fontSize: 11,
                        borderRadius: 8,
                        background: 'rgba(0,0,0,.55)',
                        color: '#fff',
                        display: 'inline-flex',
                        gap: 8,
                        alignItems: 'center',
                        zIndex: 2
                      }}
                    >
                      <span>Vista {previewScalePct}%</span>
                      <span style={{ opacity: 0.85 }}>{fitLabel}</span>
                      <span style={{ opacity: 0.7 }}>Zoom {hudScale}% · {densityName}</span>
                    </div>
                  </div>
                </div>

                {/* Barra de arrastre (sidebar) */}
                <div
                  onPointerDown={onDragStart(t.id)}
                  onWheel={wheelAdjust(t.id)}
                  onMouseEnter={() => setHoverId(t.id)}
                  onMouseLeave={() => setHoverId(prev => prev === t.id ? null : prev)}
                  onDoubleClick={() => setH(t.id, DEFAULT_H)}
                  style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    height: 18, cursor: 'ns-resize',
                    background: (hoverId === t.id || draggingId === t.id)
                      ? 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.18))'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.03), transparent)',
                    display: 'grid', placeItems: 'center',
                    borderTop: '1px dashed rgba(128,128,128,.25)'
                  }}
                  title="Arrastra / rueda para ajustar altura · Doble clic para restablecer"
                >
                  <div style={{ width: 38, height: 4, borderRadius: 2, background: (hoverId === t.id || draggingId === t.id) ? 'rgba(128,128,128,.9)' : 'rgba(128,128,128,.6)' }} />
                </div>
              </div>
            </div>
          );
        })}
      </section>

      {/* ---------- Overlay Expandido (misma distribución de botones) ---------- */}
      {expandedId && (() => {
        const t = tournaments.find(x => x.id === expandedId);
        if (!t) return null;
        const fit = getFit(t.id);
        const density = getDensity(t.id);
        const hudScale = getScale(t.id);
        const densityName = densityLabel(density);
        const themeParam = (t.displayTheme || 'dark') === 'light' ? '&theme=light' : '';
        const baseUrl = `/display.html?id=${encodeURIComponent(t.id)}${isFxOn(t.id) ? '' : '&nofx=1'}${themeParam}`;
        const windowUrl = `${baseUrl}&hud=${density}&scale=${hudScale}`;

        // Dimensiones disponibles
        const outerPad = 24;
        const availableW = Math.max(320, window.innerWidth - outerPad * 2);
        const availableH = Math.max(260, window.innerHeight - outerPad * 2 - 56 /*header*/);

        const targetH = Math.min(getExpH(t.id), availableH);
        const sH = Math.max(0.1, targetH / baseH);
        const sW = Math.max(0.1, availableW / baseW);
        const raw = fit === 'height' ? sH : fit === 'width' ? sW : Math.min(sH, sW);
        const previewScale = snapScale(raw);

        const w = Math.round(baseW * previewScale);
        const h = Math.round(baseH * previewScale);
        const previewScalePct = Math.round(previewScale * 100);
        const { state, color, remainingFmt, phase } = stateInfo(t);
        const overlayHudActive = hudMenuFor === t.id && expandedId === t.id;
        const fitLabel = fit === 'contain' ? 'Contener' : fit === 'width' ? 'Ancho' : 'Alto';

        return (
          <div
            role="dialog"
            aria-modal="true"
            style={{
              position: 'fixed', inset: 0, zIndex: 3000,
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}
          >
            <div
              onClick={() => setExpandedId(null)}
              style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }}
            />
            <div
              className="shadow-lg"
              style={{
                position: 'relative',
                width: 'min(1140px, 96vw)',
                maxWidth: '96vw',
                background: '#11141a',
                border: '1px solid #2c313a',
                borderRadius: 12,
                padding: `${outerPad}px`,
              }}
            >
              {/* Header overlay con grupos */}
              <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                <strong className="text-truncate">{t.name}</strong>
                <span className="badge text-bg-secondary">{t.game}</span>

                {/* HUD compacto */}
                <span className="ms-auto d-flex align-items-center gap-2 small text-secondary">
                  <span
                    style={{
                      display: 'inline-flex', alignItems: 'center', gap: 6,
                      padding: '2px 8px', borderRadius: 999,
                      border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.25)', color: '#e5e7eb'
                    }}
                  >
                    <span style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: `0 0 0 3px ${color}22` }} />
                    {state}
                  </span>
                  <span style={{ padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.25)', color: '#e5e7eb' }}>
                    ⏱ {remainingFmt}
                  </span>
                  <span className="d-none d-sm-inline" style={{ padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.25)', color: '#e5e7eb' }}>
                    {phase}
                  </span>
                </span>

                <div className="d-flex align-items-center flex-wrap gap-2">
                <span className="small text-secondary me-1">Vista {previewScalePct}% · Zoom {hudScale}% · {densityName}</span>

                {/* Grupo 1 */}
                <div className="position-relative">
                  <div className="btn-group btn-group-sm" role="group" aria-label="Ajuste HUD">
                    <button
                      className="btn btn-outline-light"
                      onClick={() => cycleFit(t.id)}
                      title={`Ajuste: ${fitLabel}`}
                    >
                      {fit === 'contain' ? '⤧' : fit === 'width' ? '⇔' : '⇕'}
                      <span className="d-none d-md-inline ms-1">{fitLabel}</span>
                    </button>
                    <button
                      className={overlayHudActive ? 'btn btn-light' : 'btn btn-outline-light'}
                      onClick={() => toggleHudMenu(t.id)}
                      ref={el => { hudButtonRefs.current[t.id] = el; }}
                      title={`Zoom HUD: ${hudScale}% · ${densityName}`}
                      aria-expanded={overlayHudActive}
                      aria-controls={`hud-menu-${t.id}`}
                    >
                      {density === 'compact' ? '▣' : density === 'expanded' ? '▢' : '▤'}
                      <span className="d-none d-md-inline ms-1">HUD</span>
                    </button>
                  </div>
                  <div className="btn-group btn-group-sm ms-2" role="group" aria-label="Zoom del HUD">
                    <button
                      type="button"
                      className="btn btn-outline-light"
                      onClick={() => nudgeScale(t.id, -5)}
                      title="Reducir zoom del HUD"
                      aria-label="Reducir zoom del HUD"
                    >
                      −
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline-light"
                      onClick={() => nudgeScale(t.id, 5)}
                      title="Ampliar zoom del HUD"
                      aria-label="Ampliar zoom del HUD"
                    >
                      +
                    </button>
                  </div>
                  {overlayHudActive && (
                    <div
                      id={`hud-menu-${t.id}`}
                      ref={el => { if (expandedId === t.id) hudMenuRef.current = el; }}
                      className="hud-config-menu shadow"
                      role="dialog"
                      aria-label="Opciones de HUD"
                    >
                      <div className="hud-config-menu__section">
                        <div className="hud-config-menu__label">Densidad</div>
                        <div className="btn-group btn-group-sm w-100" role="group" aria-label="Modo de densidad">
                          <button type="button" className={`btn ${density === 'compact' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => applyDensity(t.id, 'compact')}>
                            Compacto
                          </button>
                          <button type="button" className={`btn ${density === 'standard' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => applyDensity(t.id, 'standard')}>
                            Equilibrado
                          </button>
                          <button type="button" className={`btn ${density === 'expanded' ? 'btn-secondary' : 'btn-outline-secondary'}`} onClick={() => applyDensity(t.id, 'expanded')}>
                            Amplio
                          </button>
                        </div>
                      </div>
                      <div className="hud-config-menu__section">
                        <div className="hud-config-menu__label d-flex justify-content-between align-items-center">
                          <span>Zoom del HUD</span>
                          <span className="badge text-bg-secondary">{hudScale}%</span>
                        </div>
                        <input
                          type="range"
                          min={70}
                          max={140}
                          step={5}
                          value={hudScale}
                          onChange={e => updateScale(t.id, Number(e.target.value))}
                          className="form-range hud-config-menu__slider"
                          aria-label="Zoom del HUD"
                        />
                        <div className="d-flex justify-content-between text-muted small">
                          <span>Menos zoom</span>
                          <span>Más zoom</span>
                        </div>
                        <div className="d-flex flex-wrap gap-2 mt-2">
                          {ZOOM_PRESETS.map(val => (
                            <button
                              key={val}
                              type="button"
                              className={`btn btn-sm ${hudScale === val ? 'btn-secondary' : 'btn-outline-secondary'}`}
                              onClick={() => updateScale(t.id, val)}
                            >
                              {val}%
                            </button>
                          ))}
                        </div>
                      </div>
                      <button type="button" className="btn btn-link p-0 small text-decoration-none" onClick={closeHudMenu}>
                        Cerrar
                      </button>
                    </div>
                  )}
                </div>

                  <div className="toolbar-sep d-none d-sm-block" aria-hidden />

                  {/* Grupo 2 */}
                  <div className="btn-group btn-group-sm" role="group" aria-label="Tema y efectos">
                    <button
                      className={(t.displayTheme || 'dark') === 'light' ? 'btn btn-warning' : 'btn btn-outline-warning'}
                      onClick={() => onToggleTheme(t.id)}
                      title="Alternar tema del display"
                    >
                      {(t.displayTheme || 'dark') === 'light' ? '🌞' : '🌙'}
                      <span className="d-none d-md-inline ms-1">Tema</span>
                    </button>
                    <button
                      className={isFxOn(t.id) ? 'btn btn-outline-warning' : 'btn btn-warning'}
                      onClick={() => toggleFx(t.id)}
                      title={isFxOn(t.id) ? 'Desactivar efectos' : 'Activar efectos'}
                    >
                      {isFxOn(t.id) ? '✨' : '🚫'} <span className="d-none d-md-inline ms-1">FX</span>
                    </button>
                  </div>

                  <div className="toolbar-sep d-none d-sm-block" aria-hidden />

                  {/* Grupo 3 */}
                  <div className="btn-group btn-group-sm" role="group" aria-label="Ventana y recargar">
                    <a className="btn btn-outline-light" href={windowUrl} target={`SIGAD_DISPLAY_${t.id}`} rel="noreferrer" title="Abrir en ventana">↗<span className="d-none d-md-inline ms-1">Ventana</span></a>
                    <button className="btn btn-outline-light" onClick={() => reloadFrame(`prev-exp-${t.id}`)} title="Recargar">↻<span className="d-none d-md-inline ms-1">Recargar</span></button>
                    <button className="btn btn-outline-secondary" onClick={() => setExpandedId(null)} title="Cerrar (Esc)">✕<span className="d-none d-md-inline ms-1">Cerrar</span></button>
                  </div>
                </div>
              </div>

              {/* Área del preview en overlay */}
              <div style={{ position: 'relative', background: 'linear-gradient(180deg, rgba(255,255,255,.02), transparent)' }}>
                <div style={{ height: targetH, display: 'grid', placeItems: 'center' }}>
                  {!loaded[t.id] && (
                    <div
                      className="position-absolute top-0 start-0 w-100 h-100"
                      style={{
                        background:
                          'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.12) 37%, rgba(255,255,255,0.05) 63%)',
                        backgroundSize: '400% 100%',
                        animation: 'sigad-shimmer 1.2s ease-in-out infinite',
                        zIndex: 1
                      }}
                    >
                      <div className="position-absolute top-50 start-50 translate-middle spinner-border spinner-border-sm text-secondary" />
                    </div>
                  )}

                  <div onDoubleClick={() => cycleFit(t.id)} style={{ width: w, height: h, overflow: 'hidden', borderRadius: 12, position: 'relative' }}>
                    {/* Micro-HUD superpuesto (overlay) */}
                    <div
                      className="position-absolute d-flex align-items-center gap-2 px-2 py-1"
                      style={{
                        top: 8,
                        left: 8,
                        borderRadius: 8,
                        backdropFilter: 'blur(6px)',
                        background: 'rgba(17,17,17,.45)',
                        color: '#e5e7eb',
                        fontSize: w < 540 ? 11 : 12,
                        lineHeight: 1.1,
                        zIndex: 2
                      }}
                    >
                      <span
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 6,
                          padding: '2px 8px',
                          borderRadius: 999,
                          border: '1px solid rgba(255,255,255,.12)',
                          background: 'rgba(0,0,0,.25)'
                        }}
                      >
                        <span style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: `0 0 0 3px ${color}22` }} />
                        <strong style={{ letterSpacing: .2 }}>{state}</strong>
                      </span>
                      <span style={{ padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.25)' }}>
                        ⏱ {remainingFmt}
                      </span>
                      <span className="d-none d-sm-inline" style={{ padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.25)' }}>
                        {phase}
                      </span>
                    </div>

                    <iframe
                      id={`prev-exp-${t.id}`}
                      src={baseUrl}
                      title={`preview-expanded-${t.name}`}
                      onLoad={() => markLoaded(t.id)}
                      style={{ width: baseW, height: baseH, border: 0, transform: `scale(${previewScale}) translateZ(0)`, transformOrigin: 'top left', willChange: 'transform' }}
                    />

                    {/* Indicador escala/mode */}
                    <div
                      className="position-absolute"
                      style={{
                        right: 8, bottom: 8,
                        padding: '2px 8px',
                        fontSize: 11, borderRadius: 8,
                        background: 'rgba(0,0,0,.55)', color: '#fff',
                        display: 'inline-flex', gap: 8, alignItems: 'center'
                      }}
                    >
                      <span>Vista {previewScalePct}%</span>
                      <span style={{ opacity: .85 }}>{fitLabel}</span>
                      <span style={{ opacity: .7 }}>Zoom {hudScale}% · {densityName}</span>
                    </div>
                  </div>
                </div>

                {/* Barra de arrastre (overlay) */}
                <div
                  onPointerDown={startOverlayDrag}
                  onDoubleClick={() => setExpH(t.id, DEFAULT_H_EXP)}
                  style={{
                    position: 'absolute', left: 0, right: 0, bottom: 0,
                    height: 18, cursor: 'ns-resize',
                    background: overlayDragging
                      ? 'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.18))'
                      : 'linear-gradient(180deg, rgba(255,255,255,0.03), transparent)',
                    display: 'grid', placeItems: 'center',
                    borderTop: '1px dashed rgba(128,128,128,.25)'
                  }}
                  title="Arrastra para ajustar altura · Doble clic para restablecer"
                >
                  <div style={{ width: 40, height: 4, borderRadius: 2, background: overlayDragging ? 'rgba(128,128,128,.9)' : 'rgba(128,128,128,.6)' }} />
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Estilos menores: separador y shimmer */}
      <style>{`
        .toolbar-sep{ width:1px; height:24px; background:rgba(255,255,255,.12); opacity:.85 }
        @keyframes sigad-shimmer { 0%{background-position:100% 0} 100%{background-position:0 0} }
      `}</style>
    </>
  );
};

export default DisplayPreview;
