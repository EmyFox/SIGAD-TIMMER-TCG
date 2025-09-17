import React from 'react';

export type Toast = { id: number; kind: 'info'|'warning'|'success'|'secondary'|'danger'; text: string };

let idSeq = 1;
const listeners = new Set<(t: Toast)=>void>();
function push(kind: Toast['kind'], text: string){
  const t: Toast = { id: idSeq++, kind, text };
  listeners.forEach(fn=>fn(t));
}

export const notify = {
  info: (text:string)=>push('info', text),
  warning: (text:string)=>push('warning', text),
  success: (text:string)=>push('success', text),
  secondary: (text:string)=>push('secondary', text),
  danger: (text:string)=>push('danger', text),
};

// Compat: algunos módulos esperan un export pushToast similar a una API con métodos.
type PushKind = 'info'|'warn'|'warning'|'success'|'secondary'|'danger';
const kindMap: Record<PushKind, keyof typeof notify> = {
  info: 'info', warn: 'warning', warning: 'warning', success: 'success', secondary: 'secondary', danger: 'danger'
};
export const pushToast = Object.assign(
  (text: string, kind: PushKind = 'info') => notify[kindMap[kind]](text),
  {
    info: (text:string)=>notify.info(text),
    warn: (text:string)=>notify.warning(text),
    warning: (text:string)=>notify.warning(text),
    success: (text:string)=>notify.success(text),
    secondary: (text:string)=>notify.secondary(text),
    danger: (text:string)=>notify.danger(text),
  }
);

export const ToastHost: React.FC<{ position?: 'top-right'|'bottom-right'|'top-left'|'bottom-left' }>=({ position='top-right' })=>{
  const [items, setItems] = React.useState<Toast[]>([]);
  React.useEffect(()=>{
    const on = (t: Toast)=>{ setItems(prev=>[t, ...prev].slice(0,5)); setTimeout(()=>setItems(prev=>prev.filter(x=>x.id!==t.id)), 3000); };
    listeners.add(on); return ()=>{ listeners.delete(on); };
  },[]);
  const posStyle: React.CSSProperties = position==='top-right' ? {top:8,right:8} : position==='bottom-right'?{bottom:8,right:8}:position==='top-left'?{top:8,left:8}:{bottom:8,left:8};
  return (
    <div style={{position:'fixed', zIndex:3000, display:'flex', flexDirection:'column', gap:8, ...posStyle}} aria-live="polite">
      {items.map(t=> (
        <div key={t.id} style={{
          background:'rgba(20,20,24,.92)', color:'#e5e7eb', border:'1px solid rgba(255,255,255,.08)', borderRadius:12, padding:'8px 10px', minWidth:220,
          boxShadow:'0 8px 28px rgba(0,0,0,.45)'
        }}>
          {t.text}
        </div>
      ))}
    </div>
  );
};
