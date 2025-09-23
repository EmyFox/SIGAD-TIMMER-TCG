import React, { useEffect, useMemo, useRef, useState } from 'react';

export const TutorialPrompt: React.FC<{
  open: boolean;
  onAccept: () => void;
  onDecline: () => void;
}> = ({ open, onAccept, onDecline }) => {
  if (!open) return null;
  return (
    <div role="dialog" aria-modal="true" style={{ position: 'fixed', inset: 0, zIndex: 3600, display: 'grid', placeItems: 'center' }}>
      <div onClick={onDecline} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,.55)' }} />
      <div className="shadow-lg" style={{ position: 'relative', width: 'min(460px, 92%)', background: '#12151c', border: '1px solid #2a3039', borderRadius: 12, padding: '1rem 1rem 0.75rem' }}>
        <h6 className="mb-1">¿Quieres un tutorial rápido?</h6>
        <p className="text-secondary mb-3" style={{ fontSize: 14 }}>Te guiamos en menos de 2 minutos por el Panel (operador) y el Display (pantalla pública).</p>
        <div className="d-flex justify-content-end gap-2">
          <button className="btn btn-sm btn-outline-secondary" onClick={onDecline}>No, gracias</button>
          <button className="btn btn-sm btn-primary" onClick={onAccept}>Sí, empezar</button>
        </div>
      </div>
    </div>
  );
};

type Step = { title: string; bullets: string[] };
type GuideStep = Step & { selector?: string; actionHint?: string; tryClickSelector?: string };

export const TutorialOverlay: React.FC<{
  open: boolean;
  onClose: () => void;
}> = ({ open, onClose }) => {
  // Guide (Guiado) - only guided mode kept
  const guide: GuideStep[] = useMemo(() => ([
    { title: 'Ajustes del panel', bullets: ['Cambia formato 12/24h, columnas, sonidos y auto-abrir Display.'], selector: '[data-tut="header-settings"]', actionHint: 'Abre los ajustes para ver opciones.' },
  { title: 'Formato de hora', bullets: ['Alterna entre 24h y 12h.'], selector: '.btn-group[aria-label="Hora"] label' },
  { title: 'Columnas del panel', bullets: ['Elige 1, 2 o 3 columnas para las tarjetas.'], selector: '.btn-group[aria-label="Cols"] label' },
    { title: 'Nuevo torneo', bullets: ['Crea rápidamente un nuevo torneo.'], selector: '[data-tut="header-new"]', tryClickSelector: '[data-tut="header-new"]' },
    { title: 'Reset global', bullets: ['Resetea todos los timers. Úsalo con cuidado.'], selector: '[data-tut="header-reset-all"]' },
    { title: 'Itinerario', bullets: ['Copia los hitos (fin de rondas y breaks) para todos los torneos.'], selector: '[data-tut="header-itinerary"]' },
    { title: 'Anuncios avanzados', bullets: ['Lanza anuncios en el Display (texto, imagen, URL).'], selector: '[data-tut="header-announce"]', tryClickSelector: '[data-tut="header-announce"]' },
  { title: 'Preview integrado', bullets: ['Aquí ves cómo se verá el Display sin abrir otra ventana.'], selector: '[data-tut="card-preview"]', tryClickSelector: '[data-tut="card-preview"] button[title="Expandir preview"], [data-tut="card-preview"] button' },
  { title: 'Iniciar ronda', bullets: ['Arranca una nueva ronda con un clic.','Se contabiliza el tiempo de la ronda y se notifica al Display.','Úsalo cuando todos los jugadores estén listos.'], selector: '[data-tut="card-start"]', tryClickSelector: '[data-tut="card-priority-controls"] button[data-tut="card-start"], [data-tut="card-start"] button, [data-tut="card-start"]', actionHint: 'Pulsa aquí para iniciar la ronda; asegúrate de que la configuración (duración y breaks) esté correcta.' },
  { title: 'Abrir Display', bullets: ['Abre el HUD público de este torneo en una ventana aparte.'], selector: '[data-tut="card-open-display"]', tryClickSelector: '[data-tut="card-open-display"] button, [data-tut="card-open-display"]' },
  ]), []);

  // Persisted prefs
  const DISC_KEY = 'sigad_tutorial_discreet_v1';
  const BLOCK_KEY = 'sigad_tutorial_block_v1';

  const [i, setI] = useState(0);
  useEffect(() => { if (!open) setI(0); }, [open]);

  const [discreet, setDiscreet] = useState<boolean>(()=>{
    try { const v = localStorage.getItem(DISC_KEY); return v === '1'; } catch { return true; }
  });
  useEffect(()=>{ try { localStorage.setItem(DISC_KEY, discreet ? '1':'0'); } catch {} }, [discreet]);

  const [strictFocus, setStrictFocus] = useState<boolean>(()=>{
    try { const v = localStorage.getItem(BLOCK_KEY); return v === '1'; } catch { return false; }
  });
  useEffect(()=>{ try { localStorage.setItem(BLOCK_KEY, strictFocus ? '1':'0'); } catch {} }, [strictFocus]);

  // Spotlight tracking
  const overlayRef = useRef<HTMLDivElement|null>(null);
  const ctrlRef = useRef<HTMLDivElement|null>(null);
  const [spot, setSpot] = useState<{ x:number; y:number; w:number; h:number; rect?: DOMRect } | null>(null);
  
  useEffect(() => {
    if (!open) { setSpot(null); return; }
    let ro: ResizeObserver | null = null;
    let targetEl: HTMLElement | null = null;
    let debounced: number | null = null;

    const s = guide[i]?.selector;
    const scheduleCompute = () => {
      if (debounced) window.clearTimeout(debounced);
      debounced = window.setTimeout(() => computeSpot(s), 120);
    };

    // Initial compute
    computeSpot(s);

    // Observe resize on the target element to recompute spot
    try {
      targetEl = s ? SamplingManager.getBest(s) : null;
      if (targetEl && 'ResizeObserver' in window) {
        ro = new ResizeObserver(scheduleCompute);
        ro.observe(targetEl);
      }
    } catch {}

    // Track user scrolls so we don't auto-scroll while user is actively interacting
    const onUserScroll = () => { (window as any).__sigad_last_user_scroll = Date.now(); scheduleCompute(); };
    const onResize = () => scheduleCompute();
    const onScroll = () => scheduleCompute();

    window.addEventListener('wheel', onUserScroll, { passive: true });
    window.addEventListener('touchstart', onUserScroll, { passive: true });
    window.addEventListener('resize', onResize);
    window.addEventListener('scroll', onScroll, { passive: true });

    return () => {
      if (debounced) window.clearTimeout(debounced);
      window.removeEventListener('wheel', onUserScroll as any);
      window.removeEventListener('touchstart', onUserScroll as any);
      window.removeEventListener('resize', onResize);
      window.removeEventListener('scroll', onScroll as any);
      if (ro && targetEl) ro.unobserve(targetEl);
      ro = null; targetEl = null;
    };
  }, [open, i, guide]);

  const tryClick = () => {
    const sel = guide[i]?.tryClickSelector;
    if (!sel) return;
    const el = SamplingManager.getBest(sel);
    if (!el) return;
    // safe click: focus first, avoid clicking disabled or non-visible
    try {
      const style = getComputedStyle(el);
      if (!el.offsetWidth || !el.offsetHeight) return;
      const ad = el.getAttribute('aria-disabled'); if (ad === 'true') return;
      if ((el as any).disabled) return;
      (el as HTMLElement).focus?.();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window } as any));
      el.classList.add('sigad-try-pulse');
      setTimeout(()=> el.classList.remove('sigad-try-pulse'), 900);
    } catch {}
  };

  // SamplingManager caches candidate elements and keeps them updated using MutationObserver
  // It exposes getBest(selector) which scores candidates by visibility, interactivity and proximity.
  const SamplingManager = (() => {
    // Cache: selector -> list of HTMLElements (candidates)
    const cache = new Map<string, { nodes: HTMLElement[]; stamp: number }>();

    // Candidate expansion selector
    const interactiveSelector = 'button, input, a[href], [role="button"], [tabindex]:not([tabindex="-1"]), label, [data-tut]';

    // Utility: check if element is visible and enabled
    const isCandidateVisible = (el: HTMLElement) => {
      try {
        const style = getComputedStyle(el);
        if (!el.offsetWidth || !el.offsetHeight) return false;
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const ad = el.getAttribute('aria-disabled'); if (ad === 'true') return false;
        if ((el as any).disabled) return false;
        const cls = el.className || ''; if (typeof cls === 'string' && /disabled|btn-disabled/.test(cls)) return false;
        // Check if fully in viewport
        const rect = el.getBoundingClientRect();
        const vw = window.innerWidth; const vh = window.innerHeight;
        if (rect.right < 0 || rect.bottom < 0 || rect.left > vw || rect.top > vh) return false;
        return true;
      } catch { return false; }
    };

    // Expand nodes for selector and store in cache
    const sampleSelector = (selector: string) => {
      try {
        const rootNodes = Array.from(document.querySelectorAll(selector)) as HTMLElement[];
        const candidates: HTMLElement[] = [];
        for (const n of rootNodes) {
          if (n instanceof HTMLElement) {
            candidates.push(n);
            try {
              const inner = Array.from(n.querySelectorAll(interactiveSelector)) as HTMLElement[];
              for (const ii of inner) candidates.push(ii);
            } catch {}
          }
        }
        cache.set(selector, { nodes: candidates, stamp: Date.now() });
      } catch { cache.set(selector, { nodes: [], stamp: Date.now() }); }
    };

    // Score function (lower is better)
    const scoreElement = (el: HTMLElement) => {
      const vw = window.innerWidth || document.documentElement.clientWidth;
      const vh = window.innerHeight || document.documentElement.clientHeight;
      const r = el.getBoundingClientRect();
      const cx = vw / 2; const cy = vh / 2;
      const ex = r.left + r.width / 2; const ey = r.top + r.height / 2;
      const dx = ex - cx; const dy = ey - cy; const dist = Math.sqrt(dx*dx + dy*dy);
      let score = dist;
      const hasClick = el.matches && (el.matches('button, a[href], [role="button"], input') || el.getAttribute('onclick'));
      if (hasClick) score -= 80;
      const inViewport = r.bottom >= 0 && r.right >= 0 && r.left <= vw && r.top <= vh;
      if (!inViewport) score += 10000;
      // Bonus for higher z-index (more likely to be interactive)
      try {
        const z = parseInt(getComputedStyle(el).zIndex) || 0;
        score -= Math.min(z, 100); // cap at 100
      } catch {}
      // Penalty if clipped or behind
      if (r.width < 10 || r.height < 10) score += 500;
      return score;
    };

    // Public API
    return {
      getBest(selector?: string, forceRefresh = false) {
        if (!selector) return null;
        // refresh sample if missing, stale, or forced
        const entry = cache.get(selector);
        if (!entry || forceRefresh || (Date.now() - entry.stamp) > 500) sampleSelector(selector);
        const nodes = (cache.get(selector)?.nodes) || [];
        if (!nodes.length) return null;
        let best: HTMLElement | null = null; let bestScore = Infinity;
        for (const el of nodes) {
          try {
            if (!isCandidateVisible(el)) continue;
            const sc = scoreElement(el);
            if (sc < bestScore) { bestScore = sc; best = el; }
          } catch {}
        }
        // fallback to direct query if nothing found
        if (!best) try { return document.querySelector(selector) as HTMLElement | null; } catch { return null; }
        return best;
      },
      invalidate(selector?: string) {
        if (selector) cache.delete(selector); else cache.clear();
      }
    };
  })();

  // Observe DOM mutations and invalidate relevant cache entries (debounced)
  useEffect(()=>{
    if (typeof MutationObserver === 'undefined') return () => {};
    let timer: number | null = null;
    const mo = new MutationObserver((mutations)=>{
      if (timer) window.clearTimeout(timer);
      timer = window.setTimeout(()=>{ SamplingManager.invalidate(); timer = null; }, 250);
    });
    mo.observe(document.documentElement || document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class','style','disabled','aria-hidden','aria-disabled'] });
    return ()=>{ mo.disconnect(); if (timer) window.clearTimeout(timer); };
  }, []);

  // Replace computeSpot to use SamplingManager.getBest and RAF-throttled updates
  const computeSpot = (sel?: string, retryCount = 0) => {
    if (!sel) { setSpot(null); return; }
    let el = SamplingManager.getBest(sel);
    if (!el && retryCount < 3) {
      // Retry with force refresh after delay
      setTimeout(() => computeSpot(sel, retryCount + 1), 200 * (retryCount + 1));
      return;
    }
    if (!el) { setSpot(null); return; }
    const rect = el.getBoundingClientRect();
    setSpot({ x: rect.left + rect.width/2, y: rect.top + rect.height/2, w: rect.width, h: rect.height, rect });
    try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch {}
  };

  // Navigation helper: move to step, scroll to target, recompute spotlight, and focus first control in tooltip
  const goTo = (idx: number, opts?: { scroll?: boolean; focus?: boolean }) => {
    const clamped = Math.max(0, Math.min(guide.length-1, idx));
    setI(clamped);
    const sel = guide[clamped]?.selector;
    if (opts?.scroll ?? true) {
      const el = sel ? SamplingManager.getBest(sel) : null;
      if (el) {
        try { smartScrollIntoView(el); } catch { try { el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' }); } catch {} }
        // while scrolling, keep recomputing spot to follow with RAF throttle
        let running = true;
        const tick = () => { if (!running) return; computeSpot(sel); requestAnimationFrame(tick); };
        tick();
        setTimeout(()=> running = false, 900);
      } else {
        // if no element, ensure we recompute with a small delay
        setTimeout(()=> computeSpot(sel), 120);
      }
    } else {
      computeSpot(sel);
    }
    if (opts?.focus ?? true) {
      // focus first interactive element in tooltip after a short delay (allow tooltip to render)
      setTimeout(()=>{
        const t = document.querySelector('.shadow input, .shadow button, .shadow [tabindex]') as HTMLElement | null;
        t?.focus();
      }, 220);
    }
  };

  // Smart scroll: find nearest scrollable ancestor and center the element within it
  const smartScrollIntoView = (el: HTMLElement) => {
    let ancestor: HTMLElement | null = el;
    while (ancestor) {
      const style = getComputedStyle(ancestor);
      const overflowY = style.overflowY;
      if (ancestor === document.body) break;
      if (overflowY === 'auto' || overflowY === 'scroll') break;
      ancestor = ancestor.parentElement;
    }
    const target = ancestor && ancestor !== document.body ? ancestor : document.scrollingElement || document.documentElement;
    const rect = el.getBoundingClientRect();
    const parentRect = (target as HTMLElement).getBoundingClientRect ? (target as HTMLElement).getBoundingClientRect() : { top:0, left:0, height: window.innerHeight, width: window.innerWidth };
    const offsetTop = rect.top - parentRect.top - (parentRect.height/2) + (rect.height/2);
    try {
      (target as HTMLElement).scrollBy({ top: offsetTop, left: 0, behavior: 'smooth' });
    } catch {
      el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    }
  };

  // Auto-advance on overlays open
  useEffect(()=>{
    if (!open) return;
    const id = setInterval(()=>{
      const overlayOpen = document.querySelector('[data-tut="offcanvas-settings"], [data-tut="offcanvas-tournament"], [data-tut="modal-itinerary"], [data-tut="modal-announce"]');
      if (!overlayOpen) return;
      setI(prev => Math.min(prev+1, guide.length-1));
      clearInterval(id);
    }, 600);
    return ()=> clearInterval(id);
  }, [open, i, guide.length]);

  // Autoplay and pause on overlays
  const [playing, setPlaying] = useState(false);
  useEffect(()=>{
    if (!open || !playing) return;
    const t = setTimeout(()=> goTo(i+1), 3600);
    return ()=> clearTimeout(t);
  }, [open, playing, i, guide.length]);
  useEffect(()=>{
    if (!open) return;
    const id = setInterval(()=>{
      const overlayOpen = document.querySelector('[data-tut="offcanvas-settings"], [data-tut="offcanvas-tournament"], [data-tut="modal-itinerary"], [data-tut="modal-announce"]');
      if (overlayOpen && playing) setPlaying(false);
    }, 300);
    return ()=> clearInterval(id);
  }, [open, playing]);

  // Tooltip placement
  // Draggable controller position (persisted)
  const POS_KEY = 'sigad_tutorial_ctrl_pos_v1';
  const [ctrlPos, setCtrlPos] = useState<{right:number; bottom:number}>(()=>{
    try { const v = localStorage.getItem(POS_KEY); return v ? JSON.parse(v) : { right: 16, bottom: 16 }; } catch { return { right:16, bottom:16 }; }
  });
  useEffect(()=>{ try { localStorage.setItem(POS_KEY, JSON.stringify(ctrlPos)); } catch {} }, [ctrlPos]);
  // Persist minimized
  const MIN_KEY = 'sigad_tutorial_min_v1';
  const [minimized, setMinimizedState] = useState<boolean>(()=>{ try { return localStorage.getItem(MIN_KEY) === '1'; } catch { return false; } });
  useEffect(()=>{ try { localStorage.setItem(MIN_KEY, minimized ? '1':'0'); } catch {} }, [minimized]);

  const tooltipPos = useMemo(() => {
    const pad = 16; const W = 260; const H = 140;
    if (!spot) {
      // fallback near controller position
      const left = Math.max(8, window.innerWidth - ctrlPos.right - W - 8);
      const top = Math.max(8, window.innerHeight - ctrlPos.bottom - H - 8);
      return { left, top, W };
    }
    const rightX = spot.x + spot.w/2 + pad;
    const leftX = spot.x - spot.w/2 - W - pad;
    const topY = spot.y - spot.h/2 - H - pad;
    const bottomY = spot.y + spot.h/2 + pad;
    let left = Math.min(window.innerWidth - W - 12, Math.max(12, rightX));
    let top = Math.max(12, spot.y - 10);
    if (rightX + W + 12 > window.innerWidth && leftX >= 12) left = leftX;
    if (top + H + 12 > window.innerHeight) {
      if (bottomY + H + 12 <= window.innerHeight) top = bottomY; else top = Math.max(12, topY);
    }
    return { left, top, W };
  }, [spot, ctrlPos]);

  // Minimize controller
  // (state declared earlier as persisted MIN_KEY)

  // Auto-hide after inactivity
  const [visible, setVisible] = useState(true);
  const INACT_MS = 4500;
  useEffect(()=>{
    if (!open) return;
    let t: number | null = null;
    const reset = () => { setVisible(true); if (t) window.clearTimeout(t); t = window.setTimeout(()=> setVisible(false), INACT_MS); };
    const onUser = () => reset();
    window.addEventListener('mousemove', onUser);
    window.addEventListener('pointerdown', onUser);
    window.addEventListener('keydown', onUser);
    reset();
    return ()=>{ if (t) window.clearTimeout(t); window.removeEventListener('mousemove', onUser); window.removeEventListener('pointerdown', onUser); window.removeEventListener('keydown', onUser); };
  }, [open]);

  // Keyboard shortcuts: ArrowLeft, ArrowRight, Space -> prev/next/play
  useEffect(()=>{
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goTo(i-1);
      if (e.key === 'ArrowRight') goTo(i+1);
      if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); setPlaying(p=>!p); }
    };
    window.addEventListener('keydown', onKey);
    return ()=> window.removeEventListener('keydown', onKey);
  }, [open, guide.length]);

  // Accessibility: aria-live message for step changes
  const [ariaMsg, setAriaMsg] = useState('');
  useEffect(()=>{ if (!open) return; setAriaMsg(`Paso ${i+1} de ${guide.length}: ${guide[i]?.title || ''}`); }, [i, open, guide]);

  if (!open) return null;

  const g = guide[i];
  const pct = Math.round(((i + 1) / guide.length) * 100);

  // Only render the floating/minimized controller and keep spotlight + tooltip active
  return (
    <div aria-hidden style={{ position: 'fixed', inset: 0, zIndex: 3700, pointerEvents: 'none' }}>
      {/* Spotlight */}
      {spot && (
        <div aria-hidden style={{position:'fixed', inset:0, pointerEvents:'none'}}>
          {!discreet && (
            <div style={{position:'absolute', inset:0, background:'rgba(0,0,0,.55)', clipPath:`circle(${Math.max(60, Math.max(spot.w, spot.h)/2 + 18)}px at ${Math.round(spot.x)}px ${Math.round(spot.y)}px)`, transition:'clip-path .2s ease'}} />
          )}
          <div style={{position:'absolute', left:spot.x-spot.w/2-10, top:spot.y-spot.h/2-10, width:spot.w+20, height:spot.h+20, border:'2px solid #60a5fa', borderRadius:12, boxShadow: discreet ? '0 0 0 2px rgba(96,165,250,.35)' : '0 0 0 4px rgba(96,165,250,.25)'}} />
        </div>
      )}

      {/* Pointer blocker when strictFocus and not discreet */}
      {spot && strictFocus && !discreet && (
        <div
          aria-hidden
          onClick={(e)=>e.stopPropagation()}
          onMouseDown={(e)=>e.stopPropagation()}
          onPointerDown={(e)=>{
            const pad = 8;
            const x = (e as any).clientX; const y = (e as any).clientY;
            if (!spot.rect) { e.preventDefault(); e.stopPropagation(); return; }
            const r = spot.rect;
            const inside = x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad;
            if (!inside) { e.preventDefault(); e.stopPropagation(); }
          }}
          style={{position:'fixed', inset:0, zIndex:3700}}
        />
      )}

      {/* Tooltip (fallbacks near controller when no target) */}
      {tooltipPos && (
        <div style={{position:'fixed', left: tooltipPos.left, top: tooltipPos.top, width: tooltipPos.W, zIndex: 3701, pointerEvents: 'auto', transition: 'left .18s ease, top .18s ease'}}>
          <div className="shadow" style={{background:'#0f1218', border:'1px solid #2c313a', borderRadius:10, padding:'10px'}}>
            <div className="small text-secondary">Paso {i+1}/{guide.length}</div>
            <div className="fw-semibold">{g.title}</div>
            {!spot && <div className="small text-warning mb-1">⚠ Elemento no visible aún, pero aquí va la explicación.</div>}
            <ul className="mb-2" style={{paddingLeft:16}}>
              {g.bullets.map((b, idx)=>(<li key={idx} className="small text-secondary">{b}</li>))}
            </ul>
            <div className="d-flex gap-2">
              <button className="btn btn-sm btn-outline-light" onClick={() => setI(v => Math.max(0, v-1))} disabled={i===0}>Anterior</button>
              {guide[i]?.tryClickSelector && (
                <button className="btn btn-sm btn-outline-info" onClick={tryClick}>Probar clic</button>
              )}
              {i < guide.length - 1 ? (
                <button className="btn btn-sm btn-primary" onClick={() => setI(v => Math.min(guide.length-1, v+1))}>Siguiente</button>
              ) : (
                <button className="btn btn-sm btn-success" onClick={onClose}>Finalizar</button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* aria-live region for screen readers */}
      <div aria-live="polite" style={{position:'fixed', left: -9999, top: 'auto', height:1, width:1, overflow:'hidden'}}>{ariaMsg}</div>

      {/* Floating controller (always visible, pointer-events enabled) */}
      <div style={{ position:'fixed', right: ctrlPos.right, bottom: ctrlPos.bottom, zIndex: 3702, pointerEvents: 'auto', transition: 'opacity .18s' , opacity: visible ? 1 : 0.18 }}>
        <div
          className="shadow-lg"
          style={{ background:'#11141a', border:'1px solid #2c313a', borderRadius:12, padding:'8px 10px', minWidth: 220, touchAction: 'none', cursor: 'grab' }}
          role="toolbar"
          aria-label="Control tutorial"
          ref={ctrlRef}
          onPointerDown={(ev)=>{
            // start drag with pointer capture
            (ev.target as HTMLElement).setPointerCapture?.((ev as any).pointerId);
            const startX = ev.clientX; const startY = ev.clientY; const startR = ctrlPos.right; const startB = ctrlPos.bottom;
            const onMove = (e: PointerEvent) => {
              const dx = startX - e.clientX; const dy = startY - e.clientY;
              const newRight = Math.max(8, Math.min(window.innerWidth-80, startR + dx));
              const newBottom = Math.max(8, Math.min(window.innerHeight-40, startB + dy));
              setCtrlPos({ right: newRight, bottom: newBottom });
            };
            const onUp = (e: PointerEvent) => {
              // snap to nearest horizontal edge
              const mid = window.innerWidth / 2;
              const ctrlLeft = window.innerWidth - (ctrlPos.right + (ctrlRef.current?.offsetWidth || 220));
              const snapRight = (ctrlLeft + (ctrlRef.current?.offsetWidth || 220)/2) < mid ? Math.max(8, window.innerWidth - 220 - 8) : 16;
              const snap = snapRight;
              // if controller is more to left, snap to left side (set right large), else snap to right
              const finalRight = (ctrlLeft + (ctrlRef.current?.offsetWidth || 220)/2) < mid ? Math.max(8, window.innerWidth - (ctrlRef.current?.offsetWidth || 220) - 8) : 16;
              setCtrlPos({ right: finalRight, bottom: Math.max(8, Math.min(window.innerHeight-40, ctrlPos.bottom)) });
              window.removeEventListener('pointermove', onMove);
              window.removeEventListener('pointerup', onUp);
            };
            window.addEventListener('pointermove', onMove);
            window.addEventListener('pointerup', onUp);
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display:'flex', flexDirection:'column', flex:1 }}>
              <strong className="me-auto">Tutorial</strong>
              <div className="small text-secondary mt-1" style={{maxWidth:260, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>
                {guide[i].title}
              </div>
            </div>
            <div style={{display:'flex', flexDirection:'column', alignItems:'flex-end', gap:6}}>
              <button aria-label="Minimizar tutorial" title="Minimizar" onClick={()=> setMinimizedState(s=> !s)} className="btn btn-sm btn-outline-secondary" style={{padding:'4px 6px'}} tabIndex={0}>{minimized ? '⬆' : '▾'}</button>
              <button aria-label="Reset posición" title="Reset posición" onClick={()=> setCtrlPos({ right:16, bottom:16 })} className="btn btn-sm btn-outline-secondary" style={{padding:'4px 6px'}} tabIndex={0}>⤾</button>
            </div>
          </div>
          {!minimized && (
            <>
              <div className="d-flex gap-2 mt-2">
                <button aria-label="Anterior" className="btn btn-sm btn-outline-light" onClick={() => goTo(i-1)} disabled={i===0} tabIndex={0}>◀</button>
                <button aria-label="Siguiente" className="btn btn-sm btn-outline-light" onClick={() => goTo(i+1)} tabIndex={0}>▶</button>
                <button aria-label="Reproducir/Pausa" className="btn btn-sm btn-outline-secondary" onClick={()=>setPlaying(p=>!p)} tabIndex={0}>{playing ? '⏸' : '▶'}</button>
                <button aria-label="Cerrar tutorial" className="btn btn-sm btn-outline-secondary" onClick={onClose} tabIndex={0}>Cerrar</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default TutorialOverlay;
