import React from 'react';

// Minimal, self-contained SIGAD logo badge (no external CSS required)
export const BrandLogo: React.FC<{ size?: number; alt?: string; className?: string }>=({ size=48, alt='SIGAD', className='' })=>{
  const px = Math.max(24, Math.round(size));
  const wrapper: React.CSSProperties = {
    width: px, height: px, borderRadius: Math.round(px*0.36), display:'inline-flex', alignItems:'center', justifyContent:'center',
    background: 'linear-gradient(145deg, rgba(255,255,255,.06), rgba(255,255,255,.02))',
    boxShadow: '0 4px 14px -4px rgba(0,0,0,.65), 0 0 0 1px rgba(255,255,255,.08), 0 0 0 4px rgba(99,102,241,.12)',
    position:'relative', overflow:'hidden', isolation:'isolate'
  };
  const ring: React.CSSProperties = {
    content: "''", position:'absolute' as const, inset:0, pointerEvents:'none', borderRadius:'inherit',
    background: 'conic-gradient(from 0deg, #6366f1, #8b5cf6, #ec4899, #6366f1)',
    opacity:.22, filter:'blur(10px)', mixBlendMode:'color-dodge'
  };
  const img: React.CSSProperties = {
    position:'absolute', inset: `${Math.round(px*0.18)}px`, backgroundImage:'var(--sigad-logo-url)', backgroundRepeat:'no-repeat',
    backgroundPosition:'center', backgroundSize:'contain', filter:'drop-shadow(0 2px 4px rgba(0,0,0,.6)) saturate(1.05) brightness(1.02)'
  } as React.CSSProperties;
  const fallback: React.CSSProperties = {
    fontWeight:700, fontSize: Math.round(px*0.46), lineHeight:1, color:'#e5e7eb', textShadow:'0 0 6px rgba(255,255,255,.4)'
  };
  return (
    <span className={className} style={wrapper} role="img" aria-label={alt}>
      <span aria-hidden style={ring} />
      <span aria-hidden style={img} />
      <span aria-hidden style={fallback}>S</span>
    </span>
  );
};
