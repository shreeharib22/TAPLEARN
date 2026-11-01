import type { Passport } from './api'

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const AUTH_STORAGE_KEY = 'taplearn:auth:v1'

export type AuthSession = {
  token: string
  email: string
  passport: Passport
}

function saveSession(session: AuthSession): AuthSession {
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session))
  return session
}

export function loadAuthSession(): AuthSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY)
    return raw ? JSON.parse(raw) as AuthSession : null
  } catch {
    return null
  }
}

export function clearAuthSession(): void {
  localStorage.removeItem(AUTH_STORAGE_KEY)
}

async function authRequest<T>(path: string, body?: unknown, token?: string): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/auth${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    })
  } catch {
    throw new Error('Cannot reach the TAPLEARN server. Check your internet connection and try again.')
  }
  const data = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(data.detail || `Authentication failed (${response.status}).`)
  return data as T
}

export async function registerAccount(payload: { display_name: string; email: string; password: string }): Promise<AuthSession> {
  const session = await authRequest<AuthSession>('/register', payload)
  return saveSession(session)
}

export async function loginAccount(payload: { email: string; password: string }): Promise<AuthSession> {
  const session = await authRequest<AuthSession>('/login', payload)
  return saveSession(session)
}

export async function verifyAuthSession(session: AuthSession): Promise<AuthSession> {
  const result = await authRequest<{ email: string; passport: Passport }>('/me', undefined, session.token)
  return saveSession({ ...session, email: result.email, passport: result.passport })
}

export async function logoutAccount(session: AuthSession | null): Promise<void> {
  if (session?.token) {
    try { await authRequest<{ logged_out: boolean }>('/logout', undefined, session.token) } catch { /* local logout must still work */ }
  }
  clearAuthSession()
}
