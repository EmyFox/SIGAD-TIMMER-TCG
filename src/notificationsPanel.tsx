import React from 'react';

export type PanelToast = { id: number; kind: 'info'|'warning'|'success'|'secondary'|'danger'; text: string };
let idSeq = 1;
const listeners = new Set<(t: PanelToast)=>void>();
function push(kind: PanelToast['kind'], text: string){ const t: PanelToast = { id:idSeq++, kind, text }; listeners.forEach(fn=>fn(t)); }

export const panelNotify = {
  info: (text:string)=>push('info', text),
  warning: (text:string)=>push('warning', text),
  success: (text:string)=>push('success', text),
  secondary: (text:string)=>push('secondary', text),
  danger: (text:string)=>push('danger', text),
};

export const PanelToastHost: React.FC<{ position?: 'top-right'|'bottom-right'|'top-left'|'bottom-left' }>=({ position='top-right' })=>{
  const [items, setItems] = React.useState<PanelToast[]>([]);
  React.useEffect(()=>{
    const on = (t: PanelToast)=>{ setItems(prev=>[t, ...prev].slice(0,6)); setTimeout(()=>setItems(prev=>prev.filter(x=>x.id!==t.id)), 3500); };
    listeners.add(on); return ()=>{ listeners.delete(on); };
  },[]);
  const posStyle: React.CSSProperties = position==='top-right' ? {top:10,right:10} : position==='bottom-right'?{bottom:10,right:10}:position==='top-left'?{top:10,left:10}:{bottom:10,left:10};
  return (
    <div style={{position:'fixed', zIndex:2600, display:'flex', flexDirection:'column', gap:10, ...posStyle}} aria-live="polite">
      {items.map(t=> (
        <div key={t.id} style={{
          background:'#12151c', color:'#e5e7eb', border:'1px solid #2a3039', borderRadius:12, padding:'8px 10px', minWidth:240,
          boxShadow:'0 10px 28px rgba(0,0,0,.45)'
        }}>
          {t.text}
        </div>
      ))}
    </div>
  );
};
