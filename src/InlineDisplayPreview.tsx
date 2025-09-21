import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { Tournament, TimeFmt } from './App';
import { emitAll, emitClearAnnouncement, emitDisplayZoom } from './displayChannel';

/**
 * InlineDisplayPreview
 * - Preview embebido por tarjeta (arriba el preview, abajo la ficha)
 * - Auto-ajuste por ancho de contenedor, 16:9, con micro-HUD superpuesto
 * - Doble clic para expandir overlay con controles (Zoom, Tema, FX y Limpiar anuncio)
 */
export const InlineDisplayPreview: React.FC<{
  tournament: Tournament;
  timeFmt: TimeFmt;
  onToggleTheme: (id: string) => void;
}> = ({ tournament: t, timeFmt, onToggleTheme }) => {
  /* ---------- Persistencia básica ---------- */
  const readObj = (k: string) => {
    try { const o = JSON.parse(localStorage.getItem(k) || '{}'); return (o && typeof o === 'object') ? o : {}; } catch { return {}; }
  };
  const LS_ZOOM = 'sigad_preview_zoom_v1';
  const [zoomMap, setZoomMap] = useState<Record<string, number>>(() => readObj(LS_ZOOM));
  useEffect(() => { try { localStorage.setItem(LS_ZOOM, JSON.stringify(zoomMap)); } catch {} }, [zoomMap]);
  const getZoom = (id: string) => {
    const z = Number(zoomMap[id]);
    return Number.isFinite(z) && z > 0 ? Math.max(0.01, z) : 1;
  };
  const setZoom = (id: string, v: number) => {
    let val = Number(v);
    if (!Number.isFinite(val) || val <= 0) val = 1;
    setZoomMap(prev => ({ ...prev, [id]: val }));
    try { emitDisplayZoom({ targets: [id], zoom: val }); } catch {}
  };

  // FX on/off
  const LS_FX = 'sigad_preview_fx_v1';
  const [fxMap, setFxMap] = useState<Record<string, boolean>>(() => readObj(LS_FX));
  useEffect(() => { try { localStorage.setItem(LS_FX, JSON.stringify(fxMap)); } catch {} }, [fxMap]);
  const isFxOn = (id: string) => fxMap[id] !== false; // por defecto ON
  const toggleFx = (id: string) => setFxMap(prev => ({ ...prev, [id]: !(prev[id] !== false) }));

  // Sincronización inicial con displays
  useEffect(() => { try { emitAll([t], timeFmt); } catch {} }, [t, timeFmt]);

  /* ---------- Medición de ancho ---------- */
  const [boxW, setBoxW] = useState(0);
  const boxRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const update = () => {
      const w = Math.max(0, Math.floor(el.getBoundingClientRect().width));
      setBoxW(w);
    };
    update();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', update);
      return () => window.removeEventListener('resize', update);
    }
    const ro = new ResizeObserver(() => update());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  /* ---------- Carga de iframe ---------- */
  const [loaded, setLoaded] = useState(false);
  const markLoaded = () => setLoaded(true);
  const reloadFrame = (id: string) => {
    const iframe = document.getElementById(id) as HTMLIFrameElement | null;
    if (!iframe) return;
    setLoaded(false);
    const s = iframe.src;
    iframe.src = 'about:blank';
    setTimeout(() => { iframe.src = s; }, 30);
  };

  /* ---------- Helpers ---------- */
  const baseW = 1536, baseH = 864; // 16:9 grande para nitidez
  const snapScale = (s: number) => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const step = 0.05 / dpr;
    return Math.max(0.1, Math.round(s / step) * step);
  };
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
    const color = state === 'En curso' ? '#10b981' : state === 'Pausado' ? '#f59e0b' : state === 'Terminado' ? '#ef4444' : '#9ca3af';
    const inRound = t.timer.mode === 'round' && (t.timer.running || t.timer.remainingMs > 0);
    const roundIdx = inRound ? t.roundsCompleted + 1 : t.roundsCompleted;
    const phase = t.timer.mode === 'break' ? 'Break' : `Ronda ${Math.max(1, Math.min(roundIdx || 1, t.roundsTotal))}/${t.roundsTotal}`;
    return { state, color, remaining: rem, remainingFmt: formatSplit(rem), phase };
  };

  /* ---------- Cálculos ---------- */
  const themeParam = (t.displayTheme || 'dark') === 'light' ? '&theme=light' : '';
  const url = `/display.html?id=${encodeURIComponent(t.id)}${isFxOn(t.id) ? '' : '&nofx=1'}${themeParam}`;
  const availW = Math.max(260, boxW || 0);
  const sW = Math.max(0.1, availW / baseW);
  const scale = snapScale(sW);
  const frameW = Math.round(baseW * scale);
  const frameH = Math.round(baseH * scale);
  const scalePct = Math.round(scale * 100);
  const { state, color, remainingFmt, phase } = stateInfo(t);

  /* ---------- Overlay expandido ---------- */
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="mb-2">
      {/* Barra de herramientas (como la previa) */}
      <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
        <strong className="text-truncate">{t.name}</strong>
        <span className="badge text-bg-secondary">{t.game}</span>

        <div className="ms-auto d-flex align-items-center flex-wrap gap-2">
          {/* Grupo 1: Expandir */}
          <div className="btn-group btn-group-sm" role="group" aria-label="Expandir">
            <button className="btn btn-primary" onClick={() => setExpanded(true)} title="Expandir preview">
              ⤢ <span className="d-none d-md-inline ms-1">Expandir</span>
            </button>
          </div>

          <div className="toolbar-sep d-none d-sm-block" aria-hidden />

          {/* Zoom por display (botones) */}
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

          {/* Anuncios + Recargar */}
          <div className="btn-group btn-group-sm" role="group" aria-label="Anuncio">
            <button className="btn btn-outline-danger" onClick={() => emitClearAnnouncement({ targets: [t.id] })} title="Limpiar anuncio activo">
              🗑 <span className="d-none d-md-inline ms-1">Limpiar anuncio</span>
            </button>
          </div>
          <div className="btn-group btn-group-sm" role="group" aria-label="Recargar">
            <button className="btn btn-outline-light" onClick={() => reloadFrame(`inline-prev-${t.id}`)} title="Recargar preview">
              ↻ <span className="d-none d-md-inline ms-1">Recargar</span>
            </button>
          </div>
        </div>
      </div>

      <div ref={boxRef} style={{ display: 'grid', placeItems: 'center' }}>
        <div
          onDoubleClick={() => setExpanded(true)}
          className="border rounded"
          style={{
            width: frameW,
            height: frameH,
            overflow: 'hidden',
            borderColor: 'var(--bs-border-color)',
            background: 'linear-gradient(180deg, rgba(255,255,255,.03), transparent)',
            transition: 'width 120ms ease, height 120ms ease',
            position: 'relative'
          }}
          title="Doble clic para expandir"
        >
          {/* Skeleton */}
          {!loaded && (
            <div className="position-absolute top-0 start-0 w-100 h-100" style={{
              background:
                'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.12) 37%, rgba(255,255,255,0.05) 63%)',
              backgroundSize: '400% 100%',
              animation: 'sigad-shimmer 1.2s ease-in-out infinite'
            }}>
              <div className="position-absolute top-50 start-50 translate-middle spinner-border spinner-border-sm text-secondary" />
            </div>
          )}

          {/* Micro-HUD */}
          <div className="position-absolute d-flex align-items-center gap-2 px-2 py-1" style={{
            top: 6, left: 6, borderRadius: 8, backdropFilter: 'blur(6px)', background: 'rgba(17,17,17,.45)', color: '#e5e7eb',
            fontSize: frameW < 420 ? 11 : 12, lineHeight: 1.1, zIndex: 2
          }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.25)' }}>
              <span style={{ width: 8, height: 8, borderRadius: 999, background: color, boxShadow: `0 0 0 3px ${color}22` }} />
              <strong style={{ letterSpacing: .2 }}>{state}</strong>
            </span>
            <span className="d-none d-sm-inline" style={{ padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.25)' }}>⏱ {remainingFmt}</span>
            <span className="d-none d-md-inline text-truncate" style={{ maxWidth: frameW < 520 ? 140 : 260, padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(0,0,0,.25)' }}>{phase}</span>
          </div>

          {/* Iframe */}
          <iframe
            id={`inline-prev-${t.id}`}
            src={url}
            title={`preview-${t.name}`}
            onLoad={markLoaded}
            style={{ width: baseW, height: baseH, border: 0, transform: `scale(${scale}) translateZ(0)`, transformOrigin: 'top left', willChange: 'transform', background: 'transparent' }}
          />

          {/* Indicador escala */}
          <div className="position-absolute" style={{ right: 6, bottom: 6, padding: '2px 8px', fontSize: 11, borderRadius: 8, background: 'rgba(0,0,0,.55)', color: '#fff', display: 'inline-flex', gap: 8, alignItems: 'center', zIndex: 2 }}>
            <span>{scalePct}%</span>
          </div>
        </div>
      </div>

      {/* Overlay expandido con controles */}
      {expanded && (() => {
        // dimensiones disponibles
        const outerPad = 24;
        const availableW = Math.max(320, window.innerWidth - outerPad * 2);
        const availableH = Math.max(260, window.innerHeight - outerPad * 2 - 56);
        const sW2 = Math.max(0.1, availableW / baseW);
        const sH2 = Math.max(0.1, availableH / baseH);
        const scale2 = snapScale(Math.min(sW2, sH2));
        const w = Math.round(baseW * scale2);
        const h = Math.round(baseH * scale2);
        const scalePct2 = Math.round(scale2 * 100);

        return (
          <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 3000, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={() => setExpanded(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)', backdropFilter: 'blur(2px)' }} />
            <div className="shadow-lg" style={{ position: 'relative', width: '96vw', maxWidth: '96vw', background: '#11141a', border: '1px solid #2c313a', borderRadius: 12, padding: `${outerPad}px` }}>
              <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                <strong className="text-truncate">{t.name}</strong>
                <span className="badge text-bg-secondary">{t.game}</span>
                <span className="ms-auto small text-secondary">{scalePct2}%</span>

                {/* Zoom botones */}
                <div className="toolbar-sep d-none d-sm-block" aria-hidden />
                <div className="d-flex align-items-center gap-2">
                  <label className="small text-secondary d-none d-sm-inline" style={{minWidth:42}}>Zoom</label>
                  <div className="btn-group btn-group-sm" role="group" aria-label={`Zoom de ${t.name}`}>
                    <button className="btn btn-outline-light" onClick={() => setZoom(t.id, getZoom(t.id) - 0.05)} title="Reducir 5%">−</button>
                    <button className="btn btn-outline-light" onClick={() => setZoom(t.id, 1)} title="Restablecer al 100%">100%</button>
                    <button className="btn btn-outline-light" onClick={() => setZoom(t.id, getZoom(t.id) + 0.05)} title="Aumentar 5%">+</button>
                  </div>
                  <span className="small text-secondary" style={{width:44, textAlign:'right'}}>{Math.round(getZoom(t.id)*100)}%</span>
                </div>

                {/* Tema/FX */}
                <div className="toolbar-sep d-none d-sm-block" aria-hidden />
                <div className="btn-group btn-group-sm" role="group" aria-label="Tema y FX">
                  <button className={(t.displayTheme || 'dark') === 'light' ? 'btn btn-warning' : 'btn btn-outline-warning'} onClick={() => onToggleTheme(t.id)} title="Alternar tema">{(t.displayTheme || 'dark') === 'light' ? '🌞' : '🌙'}<span className="d-none d-md-inline ms-1">Tema</span></button>
                  <button className={isFxOn(t.id) ? 'btn btn-outline-warning' : 'btn btn-warning'} onClick={() => toggleFx(t.id)} title={isFxOn(t.id) ? 'Desactivar efectos' : 'Activar efectos'}>{isFxOn(t.id) ? '✨' : '🚫'}<span className="d-none d-md-inline ms-1">FX</span></button>
                </div>

                {/* Limpiar anuncio / Cerrar */}
                <div className="toolbar-sep d-none d-sm-block" aria-hidden />
                <div className="btn-group btn-group-sm" role="group" aria-label="Anuncio">
                  <button className="btn btn-outline-danger" onClick={() => emitClearAnnouncement({ targets: [t.id] })} title="Limpiar anuncio">🗑<span className="d-none d-md-inline ms-1">Limpiar</span></button>
                  <button className="btn btn-outline-secondary" onClick={() => setExpanded(false)} title="Cerrar">✕<span className="d-none d-md-inline ms-1">Cerrar</span></button>
                </div>
              </div>

              <div style={{ position: 'relative', background: 'linear-gradient(180deg, rgba(255,255,255,.02), transparent)' }}>
                <div style={{ height: availableH, display: 'grid', placeItems: 'center' }}>
                  {!loaded && (
                    <div className="position-absolute top-0 start-0 w-100 h-100" style={{
                      background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.12) 37%, rgba(255,255,255,0.05) 63%)',
                      backgroundSize: '400% 100%', animation: 'sigad-shimmer 1.2s ease-in-out infinite', zIndex: 1
                    }}>
                      <div className="position-absolute top-50 start-50 translate-middle spinner-border spinner-border-sm text-secondary" />
                    </div>
                  )}

                  <div style={{ width: w, height: h, overflow: 'hidden', borderRadius: 12, position: 'relative' }}>
                    <iframe id={`inline-exp-${t.id}`} src={url} title={`preview-expanded-${t.name}`} onLoad={markLoaded} style={{ width: baseW, height: baseH, border: 0, transform: `scale(${scale2}) translateZ(0)`, transformOrigin: 'top left', willChange: 'transform' }} />
                    <div className="position-absolute" style={{ right: 8, bottom: 8, padding: '2px 8px', fontSize: 11, borderRadius: 8, background: 'rgba(0,0,0,.55)', color: '#fff' }}>{scalePct2}%</div>
                  </div>
                </div>

                {/* Botonera inferior: Recargar y Cerrar */}
                <div className="d-flex align-items-center justify-content-end gap-2 mt-2">
                  <button className="btn btn-sm btn-outline-light" onClick={() => reloadFrame(`inline-exp-${t.id}`)} title="Recargar">↻<span className="d-none d-md-inline ms-1">Recargar</span></button>
                  <button className="btn btn-sm btn-outline-secondary" onClick={() => setExpanded(false)} title="Cerrar">✕<span className="d-none d-md-inline ms-1">Cerrar</span></button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      <style>{`
        .toolbar-sep{ width:1px; height:24px; background:rgba(255,255,255,.12); opacity:.85 }
        @keyframes sigad-shimmer { 0%{background-position:100% 0} 100%{background-position:0 0} }
      `}</style>
    </div>
  );
};

export default InlineDisplayPreview;
