import { useState, type FormEvent } from 'react'
import { ArrowRight, Eye, EyeOff, Leaf, LockKeyhole, Mail, UserRound } from 'lucide-react'
import { loginAccount, registerAccount, type AuthSession } from '../api'

type AuthScreenProps = {
  onAuthenticated: (session: AuthSession) => void | Promise<void>
}

export default function AuthScreen({ onAuthenticated }: AuthScreenProps) {
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setBusy(true)

    try {
      const session = mode === 'register'
        ? await registerAccount({
            display_name: displayName.trim(),
            email: email.trim(),
            password,
          })
        : await loginAccount({ email: email.trim(), password })
      await onAuthenticated(session)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not sign you in. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next: 'login' | 'register') {
    setMode(next)
    setError('')
  }

  return (
    <main className="tl-auth-page">
      <style>{`
        .tl-auth-page{min-height:100vh;display:grid;place-items:center;padding:32px 18px;background:radial-gradient(ellipse at 15% 5%,rgba(121,173,129,.16),transparent 38%),linear-gradient(145deg,#101914,#17241c 58%,#101813);color:#f4f5ed;font-family:inherit}
        .tl-auth-shell{width:min(100%,440px)}
        .tl-auth-brand{display:flex;align-items:center;justify-content:center;gap:11px;margin-bottom:30px}
        .tl-auth-mark{width:43px;height:43px;display:grid;place-items:center;border:1px solid rgba(208,226,196,.25);border-radius:14px;background:rgba(218,239,210,.09);color:#b8d7ac}
        .tl-auth-brand strong{display:block;font-size:22px;letter-spacing:-.8px;font-weight:750}
        .tl-auth-brand strong span{color:#b8d7ac}
        .tl-auth-brand small{display:block;margin-top:3px;font-size:9px;letter-spacing:2px;color:#aab8a9}
        .tl-auth-card{padding:34px;border:1px solid rgba(220,235,216,.15);border-radius:25px;background:rgba(248,250,244,.075);box-shadow:0 28px 90px rgba(0,0,0,.28);backdrop-filter:blur(18px)}
        .tl-auth-kicker{margin:0 0 12px;color:#b8d7ac;font-size:10px;font-weight:750;letter-spacing:2px}
        .tl-auth-card h1{margin:0;font-size:clamp(28px,6vw,36px);line-height:1.1;letter-spacing:-1.2px;font-weight:700}
        .tl-auth-subtitle{margin:12px 0 25px;color:#bdc8bc;font-size:14px;line-height:1.6}
        .tl-auth-tabs{display:grid;grid-template-columns:1fr 1fr;gap:5px;padding:5px;margin-bottom:22px;border-radius:13px;background:rgba(0,0,0,.18)}
        .tl-auth-tabs button{border:0;border-radius:9px;padding:10px;background:transparent;color:#b8c5b7;font:inherit;font-size:13px;font-weight:650;cursor:pointer}
        .tl-auth-tabs button.active{background:#d9e8d1;color:#19251b;box-shadow:0 3px 12px rgba(0,0,0,.15)}
        .tl-auth-field{display:block;margin:0 0 15px}
        .tl-auth-field>span{display:block;margin-bottom:7px;color:#d9e0d4;font-size:12px;font-weight:650}
        .tl-auth-input-wrap{display:flex;align-items:center;gap:10px;min-height:49px;padding:0 14px;border:1px solid rgba(220,235,216,.19);border-radius:12px;background:rgba(6,14,9,.23);color:#9bad9b}
        .tl-auth-input-wrap:focus-within{border-color:#a9c99e;box-shadow:0 0 0 3px rgba(169,201,158,.12)}
        .tl-auth-input-wrap input{width:100%;min-width:0;border:0;outline:0;background:transparent;color:#f7f8f3;font:inherit;font-size:14px}
        .tl-auth-input-wrap input::placeholder{color:#819080}
        .tl-auth-visibility{border:0;background:transparent;color:#aebbaa;cursor:pointer;padding:4px}
        .tl-auth-error{margin:0 0 14px;padding:11px 12px;border:1px solid rgba(255,145,145,.3);border-radius:10px;background:rgba(150,43,43,.16);color:#ffc2bc;font-size:12px;line-height:1.45}
        .tl-auth-submit{width:100%;display:flex;justify-content:center;align-items:center;gap:9px;margin-top:5px;padding:14px 16px;border:0;border-radius:12px;background:#d9e8d1;color:#19251b;font:inherit;font-size:14px;font-weight:750;cursor:pointer;transition:transform .18s,background .18s}
        .tl-auth-submit:hover:not(:disabled){transform:translateY(-1px);background:#e7f1e0}
        .tl-auth-submit:disabled{opacity:.65;cursor:wait}
        .tl-auth-foot{margin:18px 0 0;text-align:center;color:#91a091;font-size:11px;line-height:1.6}
        @media(max-width:480px){.tl-auth-card{padding:25px 21px;border-radius:20px}.tl-auth-page{padding:22px 14px}}
      `}</style>

      <div className="tl-auth-shell">
        <div className="tl-auth-brand">
          <span className="tl-auth-mark"><Leaf size={22} /></span>
          <span><strong>taplearn<span>.</span></strong><small>LEARNING, IN MOTION</small></span>
        </div>

        <section className="tl-auth-card">
          <p className="tl-auth-kicker">YOUR LEARNING SPACE</p>
          <h1>{mode === 'login' ? 'Welcome back.' : 'Create your account.'}</h1>
          <p className="tl-auth-subtitle">
            {mode === 'login'
              ? 'Sign in to continue your lessons and keep your learning passport in sync.'
              : 'Create a learner account to save your progress and access TAPLEARN across devices.'}
          </p>

          <div className="tl-auth-tabs" role="tablist" aria-label="Account action">
            <button type="button" role="tab" aria-selected={mode === 'login'} className={mode === 'login' ? 'active' : ''} onClick={() => switchMode('login')}>Sign in</button>
            <button type="button" role="tab" aria-selected={mode === 'register'} className={mode === 'register' ? 'active' : ''} onClick={() => switchMode('register')}>Create account</button>
          </div>

          <form onSubmit={submit}>
            {mode === 'register' && (
              <label className="tl-auth-field">
                <span>Your name</span>
                <div className="tl-auth-input-wrap">
                  <UserRound size={17} />
                  <input autoComplete="name" value={displayName} onChange={event => setDisplayName(event.target.value)} placeholder="Enter your name" minLength={2} maxLength={60} required />
                </div>
              </label>
            )}

            <label className="tl-auth-field">
              <span>{mode === 'login' ? 'Email address or username' : 'Email address'}</span>
              <div className="tl-auth-input-wrap">
                <Mail size={17} />
                <input type={mode === 'login' ? 'text' : 'email'} autoComplete={mode === 'login' ? 'username' : 'email'} value={email} onChange={event => setEmail(event.target.value)} placeholder={mode === 'login' ? 'you@example.com or your name' : 'you@example.com'} maxLength={254} required />
              </div>
            </label>

            <label className="tl-auth-field">
              <span>Password</span>
              <div className="tl-auth-input-wrap">
                <LockKeyhole size={17} />
                <input type={showPassword ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} value={password} onChange={event => setPassword(event.target.value)} placeholder={mode === 'register' ? 'At least 8 characters' : 'Enter your password'} minLength={mode === 'register' ? 8 : 1} maxLength={128} required />
                <button className="tl-auth-visibility" type="button" onClick={() => setShowPassword(value => !value)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button>
              </div>
            </label>

            {error && <p className="tl-auth-error" role="alert">{error}</p>}

            <button className="tl-auth-submit" type="submit" disabled={busy}>
              {busy ? 'Please wait…' : mode === 'login' ? 'Sign in to TAPLEARN' : 'Create learner account'}
              {!busy && <ArrowRight size={17} />}
            </button>
          </form>
        </section>

        <p className="tl-auth-foot">Your learning progress is connected to your account, not just this browser.</p>
      </div>
    </main>
  )
}
