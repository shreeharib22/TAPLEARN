import { useState, type CSSProperties, type FormEvent } from 'react'
import { ArrowRight, BookOpen, LockKeyhole, Mail, Sprout, UserRound } from 'lucide-react'
import { loginAccount, registerAccount, type AuthSession } from '../auth'

export default function AuthScreen({ onAuthenticated, roomCode = '' }: {
  onAuthenticated: (session: AuthSession) => void
  roomCode?: string
}) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      const session = mode === 'register'
        ? await registerAccount({ display_name: name, email, password })
        : await loginAccount({ email, password })
      onAuthenticated(session)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not sign in.')
    } finally {
      setBusy(false)
    }
  }

  const inputStyle: CSSProperties = {
    width: '100%', boxSizing: 'border-box', border: '1px solid #d8d8cd',
    background: '#fff', borderRadius: 12, padding: '14px 15px', color: '#26342b',
    font: 'inherit', outlineColor: '#6b8167',
  }

  return (
    <main style={{ minHeight: '100vh', background: '#f0efe6', display: 'grid', placeItems: 'center', padding: 24, color: '#26342b' }}>
      <section style={{ width: 'min(100%, 440px)', background: '#fbfaf5', border: '1px solid #deded3', borderRadius: 24, padding: 'clamp(24px, 5vw, 38px)', boxShadow: '0 18px 60px rgba(30,45,34,.10)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 30 }}>
          <span style={{ width: 46, height: 46, display: 'grid', placeItems: 'center', borderRadius: 14, background: '#6d8068', color: '#fff' }}><Sprout size={24}/></span>
          <span><strong style={{ fontSize: 23, letterSpacing: '-.06em' }}>taplearn<span style={{ color: '#b47a4b' }}>.</span></strong><small style={{ display: 'block', letterSpacing: '.16em', fontSize: 9, fontWeight: 700 }}>LEARNING, IN MOTION</small></span>
        </div>
        <p style={{ fontSize: 10, fontWeight: 800, letterSpacing: '.18em', color: '#7e8d75' }}>LEARNER ACCOUNT</p>
        <h1 style={{ fontSize: 'clamp(30px, 7vw, 42px)', lineHeight: 1.05, letterSpacing: '-.055em', margin: '8px 0 10px' }}>{mode === 'login' ? 'Welcome back.' : 'Create your passport.'}</h1>
        <p style={{ color: '#747b70', lineHeight: 1.55, marginBottom: 22 }}>{roomCode ? `Sign in or create an account to join study room ${roomCode}.` : 'Sign in to continue, or create an account to get your own learning passport.'}</p>
        <div style={{ display: 'flex', background: '#eeeee5', padding: 4, borderRadius: 12, marginBottom: 20 }}>
          <button type="button" onClick={() => { setMode('login'); setError('') }} style={{ flex: 1, border: 0, borderRadius: 9, padding: 11, background: mode === 'login' ? '#fff' : 'transparent', color: '#26342b', fontWeight: 700 }}>Sign in</button>
          <button type="button" onClick={() => { setMode('register'); setError('') }} style={{ flex: 1, border: 0, borderRadius: 9, padding: 11, background: mode === 'register' ? '#fff' : 'transparent', color: '#26342b', fontWeight: 700 }}>Create account</button>
        </div>
        <form onSubmit={submit} style={{ display: 'grid', gap: 13 }}>
          {mode === 'register' && <label style={{ display: 'grid', gap: 7, fontSize: 12, fontWeight: 700 }}>Name <span style={{ position: 'relative' }}><UserRound size={16} style={{ position: 'absolute', top: 14, left: 13, color: '#7b8776' }}/><input style={{ ...inputStyle, paddingLeft: 40 }} value={name} onChange={e => setName(e.target.value)} placeholder="Your name" minLength={2} maxLength={60} required /></span></label>}
          <label style={{ display: 'grid', gap: 7, fontSize: 12, fontWeight: 700 }}>Email <span style={{ position: 'relative' }}><Mail size={16} style={{ position: 'absolute', top: 14, left: 13, color: '#7b8776' }}/><input style={{ ...inputStyle, paddingLeft: 40 }} type="email" autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="you@example.com" required /></span></label>
          <label style={{ display: 'grid', gap: 7, fontSize: 12, fontWeight: 700 }}>Password <span style={{ position: 'relative' }}><LockKeyhole size={16} style={{ position: 'absolute', top: 14, left: 13, color: '#7b8776' }}/><input style={{ ...inputStyle, paddingLeft: 40 }} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="At least 8 characters" minLength={mode === 'register' ? 8 : 1} maxLength={128} required /></span></label>
          {error && <p role="alert" style={{ background: '#fff0ed', color: '#a13d31', borderRadius: 10, padding: 11, fontSize: 13 }}>{error}</p>}
          <button disabled={busy} type="submit" style={{ marginTop: 5, display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 9, border: 0, borderRadius: 12, padding: 15, background: '#293b31', color: '#fff', font: 'inherit', fontWeight: 750, cursor: busy ? 'wait' : 'pointer', opacity: busy ? .7 : 1 }}>{busy ? 'Please wait…' : mode === 'login' ? 'Sign in to TAPLEARN' : 'Create my account'} {!busy && <ArrowRight size={16}/>}</button>
        </form>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 22, color: '#8b9185', fontSize: 11 }}><BookOpen size={14}/> Each account gets its own learner passport and progress.</div>
      </section>
    </main>
  )
}
