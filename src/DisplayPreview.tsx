import React, { useEffect, useMemo, useRef, useState } from 'react';
import { emitAll, emitDisplayZoom, emitClearAnnouncement, type TimeFmt } from './displayChannel';
import type { Tournament } from './App';

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
  // Only consider enabled tournaments for previews (disabled ones shouldn't load frames)
  const visibleTournaments = useMemo(() => tournaments.filter(t => t.enabled !== false), [tournaments]);
  const sorted = useMemo(() => {
    const running = visibleTournaments.filter(t => t.timer.running);
    const others = visibleTournaments.filter(t => !t.timer.running);
    return [...running, ...others].slice(0, 3);
  }, [visibleTournaments]);

  /* ---------- Persistencia ---------- */
  const readObj = (k: string) => {
    try {
      const o = JSON.parse(localStorage.getItem(k) || '{}');
      return (o && typeof o === 'object') ? (o as Record<string, any>) : {};
    } catch { return {}; }
  };
  const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v|0));

  // Zoom por display (persistente)
  const LS_ZOOM = 'sigad_preview_zoom_v1';
  const [zoomMap, setZoomMap] = useState<Record<string, number>>(() => readObj(LS_ZOOM));
  const [zoomBounds, setZoomBounds] = useState<Record<string, { min: number; max: number }>>({});
  const getZoom = (id: string) => {
    const z = Number(zoomMap[id]);
    return Number.isFinite(z) && z > 0 ? Math.max(0.01, z) : 1;
  };
  const setZoom = (id: string, v: number) => {
    // Sin límite superior: si el valor llega al borde actual, expandimos el rango para ese id
    const bounds = zoomBounds[id] || { min: 0.5, max: 2 };
    let min = Math.max(0.01, bounds.min);
    let max = Math.max(min + 0.01, bounds.max);
    let val = Number(v);
    if (!Number.isFinite(val) || val <= 0) val = 1;
    // Expandir dinámicamente si alcanzó el borde
    const EPS = 1e-6;
    if (val >= max - EPS) max = Math.max(max * 1.25, val * 1.1);
    if (val <= min + EPS) min = Math.max(0.01, min * 0.75);
    setZoomBounds(prev => ({ ...prev, [id]: { min, max } }));
    setZoomMap(prev => ({ ...prev, [id]: val }));
    try { emitDisplayZoom({ targets: [id], zoom: val }); } catch {}
  };

  // FX on/off
  const LS_FX = 'sigad_preview_fx_v1';
  const [fxMap, setFxMap] = useState<Record<string, boolean>>(() => readObj(LS_FX));

  // Fit mode
  const LS_FIT = 'sigad_preview_fit_v1';
  const [fitMap, setFitMap] = useState<Record<string, 'contain'|'width'|'height'>>(() => readObj(LS_FIT));

  // Overlay heights
  const LS_H_EXP = 'sigad_preview_h_exp_v1';
  const [expHeights, setExpHeights] = useState<Record<string, number>>(() => readObj(LS_H_EXP));
  // Larger expanded overlay default
  const DEFAULT_H_EXP = 720;
  const clampOverlayH = (v: number) => clamp(v, 240, Math.max(780, Math.floor(window.innerHeight * 0.95)));

  useEffect(() => { try { localStorage.setItem(LS_ZOOM, JSON.stringify(zoomMap)); } catch {} }, [zoomMap]);
  useEffect(() => { try { localStorage.setItem(LS_FX, JSON.stringify(fxMap)); } catch {} }, [fxMap]);
  useEffect(() => { try { localStorage.setItem(LS_FIT, JSON.stringify(fitMap)); } catch {} }, [fitMap]);
  useEffect(() => { try { localStorage.setItem(LS_H_EXP, JSON.stringify(expHeights)); } catch {} }, [expHeights]);

  const isFxOn   = (id: string) => fxMap[id] !== false; // por defecto ON
  const toggleFx = (id: string) => setFxMap(prev => ({ ...prev, [id]: !(prev[id] !== false) }));
  // Force width-fit by default for consistent auto-fitting in operator previews.
  // Keep the legacy fitMap for backward-compat but prefer 'width' always.
  const getFit   = (id: string) => 'width' as 'contain'|'width'|'height';
  const cycleFit = (_id: string) => { /* no-op: fit mode locked to width for operators */ };
  const getExpH  = (id: string) => clampOverlayH(expHeights[id] ?? DEFAULT_H_EXP);
  const setExpH  = (id: string, v: number) => setExpHeights(prev => ({ ...prev, [id]: clampOverlayH(v) }));

  /* ---------- Base display 16:9 (increased for larger preview) ---------- */
  // Use a larger base resolution (16:9) so the scaled previews look bigger and crisper
  const baseW = 1536, baseH = 864;

  /* ---------- Sincronización inicial con displays ---------- */
  useEffect(() => { try { emitAll(tournaments, timeFmt); } catch {} }, [tournaments, timeFmt]);

  /* ---------- TICK local para HUD (countdown vivo) ---------- */
  const [, setTick] = useState(0);
  // Only run the local tick while there are visible tournaments
  useEffect(() => {
    if (!visibleTournaments || visibleTournaments.length === 0) return;
    const id = setInterval(() => setTick(v => (v+1)%1_000_000), 500); // 2 Hz
    return () => clearInterval(id);
  }, [visibleTournaments.length]);

  /* ---------- Sin arrastre de altura en sidebar (auto ajuste + zoom) ---------- */

  /* ---------- Overlay (expandido) ---------- */
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const overlayDragRef = useRef<{ startY: number; startH: number } | null>(null);
  const prevCursorRef = useRef<string>('');
  const prevUserSelectRef = useRef<string>('');
  const [overlayDragging, setOverlayDragging] = useState(false);
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
  const markLoaded = (id: string) => setLoaded(prev => ({ ...prev, [id]: true }));
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
          <div className="small text-secondary text-opacity-75">Doble clic en el preview = Expandir</div>
        </div>

        {sorted.length === 0 && (
          <div className="text-secondary small">No hay torneos</div>
        )}

        {sorted.map(t => {
          const fit = getFit(t.id);
          const themeParam = (t.displayTheme || 'dark') === 'light' ? '&theme=light' : '';
          const url = `/display.html?id=${encodeURIComponent(t.id)}${isFxOn(t.id) ? '' : '&nofx=1'}${themeParam}`;

          // Medición de ancho disponible:
          const availW = Math.max(240, (boxW[t.id] ?? 0) || 0);

          // Auto-fit por ancho + zoom (sin altura manual)
          const sW = Math.max(0.1, availW / baseW);
          // El zoom ya no aplica al PREVIEW; se envía al display real.
          const scale = snapScale(sW);

          const frameW = Math.round(baseW * scale);
          const frameH = Math.round(baseH * scale);
          const scalePct = Math.round(scale * 100);

          const { state, color, remainingFmt, phase } = stateInfo(t);

          return (
            <div key={t.id} className="card bg-body border-0 shadow-sm" style={{ overflow: 'hidden' }}>
              {/* ===== Header con grupos ===== */}
              <div className="card-header bg-body border-0 py-2">
                <div className="d-flex align-items-center gap-2 flex-wrap">
                  <strong className="text-truncate">{t.name}</strong>
                  <span className="badge text-bg-secondary">{t.game}</span>

                  <div className="ms-auto d-flex align-items-center flex-wrap gap-2">
                    {/* Grupo 1: Expandir (fit bloqueado a ancho) */}
                    <div className="btn-group btn-group-sm" role="group" aria-label="Expandir">
                      <button className="btn btn-primary" onClick={() => setExpandedId(t.id)} title="Expandir preview">
                        ⤢ <span className="d-none d-md-inline ms-1">Expandir</span>
                      </button>
                    </div>

                    <div className="toolbar-sep d-none d-sm-block" aria-hidden />

                    {/* Zoom por display (botones) */}
                    <div className="d-flex align-items-center gap-2">
                      <label className="small text-secondary d-none d-sm-inline" style={{minWidth:42}}>Zoom</label>
                      <div className="btn-group btn-group-sm" role="group" aria-label={`Zoom de ${t.name}`}>
                        <button
                          className="btn btn-outline-light"
                          onClick={() => setZoom(t.id, getZoom(t.id) - 0.05)}
                          title="Reducir 5%"
                        >
                          −
                        </button>
                        <button
                          className="btn btn-outline-light"
                          onClick={() => setZoom(t.id, 1)}
                          title="Restablecer al 100%"
                        >
                          100%
                        </button>
                        <button
                          className="btn btn-outline-light"
                          onClick={() => setZoom(t.id, getZoom(t.id) + 0.05)}
                          title="Aumentar 5%"
                        >
                          +
                        </button>
                      </div>
                      <span className="small text-secondary" style={{width:44, textAlign:'right'}}>{Math.round(getZoom(t.id)*100)}%</span>
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

                    {/* Anuncios: limpiar activo en ese display */}
                    <div className="btn-group btn-group-sm" role="group" aria-label="Anuncio">
                      <button className="btn btn-outline-danger" onClick={() => emitClearAnnouncement({ targets: [t.id] })} title="Limpiar anuncio activo">
                        🗑 <span className="d-none d-md-inline ms-1">Limpiar anuncio</span>
                      </button>
                    </div>

                    {/* Recargar */
                    }
                    <div className="btn-group btn-group-sm" role="group" aria-label="Recargar">
                      <button className="btn btn-outline-light" onClick={() => reloadFrame(`prev-${t.id}`)} title="Recargar">
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
                    title="Doble clic para Expandir"
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
                      src={url}
                      title={`preview-${t.name}`}
                      onLoad={() => markLoaded(t.id)}
                      style={{
                        width: baseW,
                        height: baseH,
                        border: 0,
                        transform: `scale(${scale}) translateZ(0)`,
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
                      <span>{scalePct}%</span>
                    </div>
                  </div>
                </div>

                {/* Sin barra de arrastre: auto-fit + zoom individual */}
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
        const themeParam = (t.displayTheme || 'dark') === 'light' ? '&theme=light' : '';
        const url = `/display.html?id=${encodeURIComponent(t.id)}${isFxOn(t.id) ? '' : '&nofx=1'}${themeParam}`;

    // Dimensiones disponibles
    const outerPad = 24;
    const availableW = Math.max(320, window.innerWidth - outerPad * 2);
    const availableH = Math.max(260, window.innerHeight - outerPad * 2 - 56 /*header*/);

    // Altura objetivo: por defecto ocupa toda la ventana disponible, ajustable por drag
    const targetH = Math.min(getExpH(t.id) || availableH, availableH);
    // Ajuste a ventana: usar el mínimo entre ajuste por ancho y por alto
    const sW = Math.max(0.1, availableW / baseW);
    const sH = Math.max(0.1, targetH / baseH);
    const raw = Math.min(sW, sH);
    // El zoom se aplica en el DISPLAY real, no en el overlay/preview
    const scale = snapScale(raw);

        const w = Math.round(baseW * scale);
        const h = Math.round(baseH * scale);
        const scalePct = Math.round(scale * 100);
        const { state, color, remainingFmt, phase } = stateInfo(t);

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
                width: '96vw',
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
                  <span className="small text-secondary me-1">{scalePct}%</span>

                  <div className="toolbar-sep d-none d-sm-block" aria-hidden />

                  {/* Zoom botones */}
                  <div className="d-flex align-items-center gap-2">
                    <label className="small text-secondary d-none d-sm-inline" style={{minWidth:42}}>Zoom</label>
                    <div className="btn-group btn-group-sm" role="group" aria-label={`Zoom de ${t.name}`}>
                      <button className="btn btn-outline-light" onClick={() => setZoom(t.id, getZoom(t.id) - 0.05)} title="Reducir 5%">−</button>
                      <button className="btn btn-outline-light" onClick={() => setZoom(t.id, 1)} title="Restablecer al 100%">100%</button>
                      <button className="btn btn-outline-light" onClick={() => setZoom(t.id, getZoom(t.id) + 0.05)} title="Aumentar 5%">+</button>
                    </div>
                    <span className="small text-secondary" style={{width:44, textAlign:'right'}}>{Math.round(getZoom(t.id)*100)}%</span>
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
                  <div className="btn-group btn-group-sm" role="group" aria-label="Recargar y cerrar">
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

                  <div onDoubleClick={() => setExpandedId(t.id)} style={{ width: w, height: h, overflow: 'hidden', borderRadius: 12, position: 'relative' }}>
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
                      src={url}
                      title={`preview-expanded-${t.name}`}
                      onLoad={() => markLoaded(t.id)}
                      style={{ width: baseW, height: baseH, border: 0, transform: `scale(${scale}) translateZ(0)`, transformOrigin: 'top left', willChange: 'transform' }}
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
                      <span>{scalePct}%</span>
                      <span style={{ opacity: .85 }}>{fit}</span>
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
