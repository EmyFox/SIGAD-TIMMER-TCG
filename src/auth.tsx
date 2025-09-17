import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
// Credenciales por defecto (demo). Se puede sobreescribir con /credenciales.json en /public
type CredUser = { email: string; pin: string; name?: string };
type Credenciales = { users: CredUser[] };
const defaultCredenciales: Credenciales = {
  users: [
    { email: 'richu@sigad.mx', pin: '1234', name: 'Richu' },
    { email: 'romo@sigad.mx',  pin: '1234', name: 'Romo' }
  ]
};
import { notify } from './notifications';
import { panelNotify } from './notificationsPanel';
import { BrandLogo } from './BrandLogo';

interface User { email: string; name?: string; }
interface AuthContextShape {
  user: User | null;
  locked: boolean; // pantalla bloqueada (sesión iniciada pero bloqueada manualmente)
  login: (email: string, pin: string) => Promise<boolean>;
  logout: () => void;
  lock: () => void;
  unlock: (pin: string) => boolean;
}

const AuthContext = createContext<AuthContextShape | undefined>(undefined);
export const useAuth = () => {
  const ctx = useContext(AuthContext); if(!ctx) throw new Error('AuthContext outside provider');
  return ctx;
};

const LS_KEY = 'sigad_auth_session_v1';
interface SessionData { email: string; name?: string; locked?: boolean; }

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [locked, setLocked] = useState(false);
  const [creds, setCreds] = useState<Credenciales>(defaultCredenciales);

  // Cargar override opcional desde /public/credenciales.json
  useEffect(()=>{
    let alive = true;
    fetch('/credenciales.json', { cache: 'no-store' }).then(async (res)=>{
      if(!res.ok) return;
      const data = await res.json().catch(()=>null);
      if(!data || !Array.isArray((data as any).users)) return;
      if(!alive) return;
      setCreds({ users: (data as any).users.filter((u:any)=>u && typeof u.email==='string' && typeof u.pin==='string') });
    }).catch(()=>{});
    return ()=>{ alive = false; };
  },[]);

  // restore
  useEffect(()=>{
    try {
      const raw = localStorage.getItem(LS_KEY); if(!raw) return;
      const data: SessionData = JSON.parse(raw);
      if(data?.email){ setUser({ email: data.email, name: data.name }); setLocked(!!data.locked); }
    } catch {}
  },[]);
  useEffect(()=>{
    if(!user){ localStorage.removeItem(LS_KEY); return; }
    try { localStorage.setItem(LS_KEY, JSON.stringify({ email: user.email, name: user.name, locked })); } catch {}
  }, [user, locked]);

  const login = useCallback(async (email: string, pin: string) => {
    email = email.trim().toLowerCase();
    const match = creds.users.find(u => u.email.toLowerCase() === email && u.pin === pin);
    if(!match){ notify.warning('Credenciales inválidas'); panelNotify.warning('Credenciales inválidas'); return false; }
    setUser({ email: match.email, name: match.name });
    setLocked(false);
    const msg = `Bienvenido ${match.name || match.email}`;
    notify.success(msg);
    panelNotify.success(msg);
    return true;
  }, []);
  const logout = useCallback(()=>{ const name = user?.name || user?.email; setUser(null); setLocked(false); notify.secondary('Sesión cerrada'); panelNotify.secondary(name?`Sesión cerrada (${name})`:'Sesión cerrada'); }, [user]);
  const lock = useCallback(()=>{ if(user){ setLocked(true); notify.info('Pantalla bloqueada'); panelNotify.info('Pantalla bloqueada'); } }, [user]);
  const unlock = useCallback((pin: string) => {
    if(!user) return false;
    const match = creds.users.find(u => u.email.toLowerCase() === user.email.toLowerCase() && u.pin === pin);
    if(match){ setLocked(false); notify.success('Desbloqueado'); panelNotify.success('Desbloqueado'); return true; }
    notify.warning('PIN incorrecto'); panelNotify.warning('PIN incorrecto'); return false;
  }, [user, creds]);

  const value = useMemo(()=>({ user, locked, login, logout, lock, unlock }), [user, locked, login, logout, lock, unlock]);

  return (
    <AuthContext.Provider value={value}>
      {children}
      <AuthOverlay />
    </AuthContext.Provider>
  );
};

/* ================= Overlay principal ================= */
const LOGO_URL = 'https://assets.jumpseller.com/store/sigad/themes/317428/options/27689397/sigad%20logo.png?1626551311';

const AuthOverlay: React.FC = () => {
  const { user, locked, login, logout, lock, unlock } = useAuth();
  const [mode, setMode] = useState<'login'|'unlock'>('login');
  const [email, setEmail] = useState(()=>{
    try { return localStorage.getItem('sigad_last_email') || ''; } catch { return ''; }
  });
  const [pin, setPin] = useState('');
  const [pending, setPending] = useState(false);

  useEffect(()=>{ if(!user){ setMode('login'); setEmail(''); setPin(''); } else if(locked){ setMode('unlock'); setPin(''); } else { setMode('login'); } }, [user, locked]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if(mode==='login'){
      if(!email.trim() || !pin) return;
      setPending(true); await login(email, pin); setPending(false);
    } else {
      if(!pin) return;
      const ok = unlock(pin); if(ok) setPin('');
    }
  };

  // si logeado y no bloqueado => no overlay
  if(user && !locked) return null;

  return (
    <div style={{position:'fixed', inset:0, zIndex:4000, display:'flex', alignItems:'center', justifyContent:'center'}}>
      {/* fondo difuso del panel */}
      <div style={{position:'absolute', inset:0, backdropFilter:'blur(8px) brightness(.45)', background:'radial-gradient(circle at 30% 20%, rgba(99,102,241,.28), transparent 60%), rgba(0,0,0,.75)'}} />
      {/* Contenedor login/lock */}
      <form onSubmit={submit} className="shadow-lg" style={{position:'relative', width:'min(460px,92%)', background:'#12151c', border:'1px solid #2a3039', borderRadius:18, padding:'1.75rem 1.75rem 1.5rem', boxShadow:'0 20px 60px -15px rgba(0,0,0,.6)'}}>
        {/* Marca de agua sutil detrás del contenido */}
        <div aria-hidden style={{position:'absolute', inset:0, borderRadius:18, overflow:'hidden', pointerEvents:'none'}}>
          <div style={{position:'absolute', inset:0, backgroundImage:'var(--sigad-logo-url)', backgroundRepeat:'no-repeat', backgroundPosition:'center 46%', backgroundSize:'min(64%, 260px) auto', opacity:.085, filter:'blur(.7px) saturate(.95)', mixBlendMode:'screen'}} />
        </div>
        <div style={{position:'relative', zIndex:1}}>
          <div className="d-flex align-items-center gap-3 mb-3">
            <BrandLogo size={56} />
            <div className="flex-grow-1">
              <h5 className="m-0 fw-bold">SIGAD Panel</h5>
              <small className="text-secondary">{user && locked ? 'Bloqueado' : 'Inicio de sesión'}</small>
            </div>
          </div>

        {mode==='login' && (
          <>
            <div className="mb-3">
              <label className="form-label">Correo</label>
              <input autoFocus type="email" className="form-control" placeholder="usuario@sigad.mx" value={email} onChange={e=>{ setEmail(e.target.value); try { localStorage.setItem('sigad_last_email', e.target.value); } catch {} }} disabled={pending} required />
            </div>
            <div className="mb-3">
              <label className="form-label">PIN</label>
              <input type="password" maxLength={8} className="form-control" placeholder="PIN" value={pin} onChange={e=>{ const v=e.target.value; setPin(v); if(v.length===4){ submit(); } }} disabled={pending} required />
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={pending || !email || !pin}>{pending? 'Entrando…':'Entrar'}</button>
            <div className="mt-3 small text-secondary">
              Usuarios demo:<br /> richu@sigad.mx / 1234<br /> romo@sigad.mx / 1234
            </div>
          </>
        )}

        {mode==='unlock' && (
          <>
            <div className="mb-2 small text-secondary">Usuario: <strong>{user?.name || user?.email}</strong></div>
            <div className="mb-3">
              <label className="form-label">PIN</label>
              <input autoFocus type="password" maxLength={8} className="form-control" placeholder="PIN" value={pin} onChange={e=>{ const v=e.target.value; setPin(v); if(v.length===4){ submit(); } }} required />
            </div>
            <div className="d-flex gap-2">
              <button type="submit" className="btn btn-primary flex-grow-1" disabled={!pin}>Desbloquear</button>
              <button type="button" className="btn btn-outline-light" onClick={logout}>Cerrar sesión</button>
            </div>
            <div className="mt-3 small text-secondary">La sesión se mantiene, sólo se bloqueó la interfaz.</div>
          </>
        )}

        {!user && (
          <div className="mt-4 small text-center text-secondary" style={{opacity:.6}}>
            © {new Date().getFullYear()} SIGAD
          </div>
        )}
        </div>
      </form>

      {/* Botón rápido lock (cuando hay sesión y no está bloqueado): se renderiza fuera y no capta eventos al estar behind? => mejor componente aparte */}
      {user && !locked && <SessionControls onLock={lock} onLogout={logout} />}
    </div>
  );
};

/* Este componente se oculta al estar el overlay activo (arriba ya return null antes) */
const SessionControls: React.FC<{ onLock: () => void; onLogout: () => void; }> = ({ onLock, onLogout }) => {
  // Se muestra flotando arriba a la derecha en la app completa
  return (
    <div style={{position:'fixed', top:8, right:8, zIndex:4200, display:'flex', gap:8}}>
      <button onClick={onLock} className="btn btn-sm btn-outline-warning" title="Bloquear (Lock)">🔒 Bloquear</button>
      <button onClick={onLogout} className="btn btn-sm btn-outline-secondary" title="Cerrar sesión">⎋ Salir</button>
    </div>
  );
};
