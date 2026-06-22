// Pantalla de acceso — Supabase Auth. Sin sesión válida no se monta la app.
import { useState } from 'react';
import { auth } from '../lib/supabase.js';

export default function LoginScreen() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    if (!email || !pw) { setErr('Escribe tu correo y contraseña'); return; }
    setBusy(true); setErr('');
    try {
      const { error } = await auth.signIn(email, pw);
      if (error) { setErr(error.message || 'No se pudo entrar'); setBusy(false); }
      // Éxito → onAuthChange re-renderiza Root hacia <App/>.
    } catch (e2) {
      setErr(e2.message || 'Error'); setBusy(false);
    }
  };

  return (
    <div className="center-screen">
      <form onSubmit={submit} className="login-card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <div className="brand-mark" style={{ width: 34, height: 34, fontSize: 16 }}>J</div>
          <div>
            <div style={{ fontWeight: 700 }}>JAMC.TECH</div>
            <div style={{ fontSize: 11, color: 'var(--text-3)' }}>Acceso privado</div>
          </div>
        </div>
        <label className="field">
          <span className="field-label">Correo</span>
          <input className="input" type="email" autoComplete="username" value={email}
                 onChange={(e) => setEmail(e.target.value)} placeholder="tu@correo.com" />
        </label>
        <label className="field">
          <span className="field-label">Contraseña</span>
          <input className="input" type="password" autoComplete="current-password" value={pw}
                 onChange={(e) => setPw(e.target.value)} placeholder="••••••••" />
        </label>
        {err && <div style={{ fontSize: 12, color: 'var(--danger)' }}>{err}</div>}
        <button className="btn" type="submit" disabled={busy} style={{ marginTop: 6 }}>
          {busy ? 'Entrando…' : 'Entrar'}
        </button>
        <div style={{ fontSize: 10, color: 'var(--text-3)', textAlign: 'center' }}>
          Solo el dueño tiene acceso · datos protegidos
        </div>
      </form>
    </div>
  );
}
