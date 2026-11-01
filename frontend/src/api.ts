
export type LessonProgress = {
  lesson_id: string
  title: string
  completed: boolean
  score: number | null
}

export type Passport = {
  passport_id: string
  display_name: string
  level: string
  streak_days: number
  lessons_completed: number
  lessons_total: number
  current_lesson: string
  progress_percent: number
  lessons: LessonProgress[]
  sync_status?: 'synced' | 'queued'
}

export type AuthSession = {
  token: string
  email: string
  passport: Passport
}

export type CurrentAuthUser = {
  email: string
  passport: Passport
}

export type TutorRequest = {
  lesson_id: string
  lesson_title: string
  lesson_text: string
  concepts: string[]
  score: number
  total: number
  missed_questions: Array<{
    question: string
    chosen_answer: string
    correct_answer: string
    explanation: string
  }>
  language: string
}

export type TutorResponse = {
  available: boolean
  model: string
  explanation: string
  detail?: string
}

export type NfcTapResponse = {
  session_started: boolean
  tap_count: number
  passport: Passport
  synced?: boolean
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')
const AUTH_TOKEN_KEY = 'taplearn:auth-token:v1'
const AUTH_USER_CACHE_KEY = 'taplearn:auth-user:v1'
const PASSPORT_CACHE_PREFIX = 'taplearn:passport:v1:'
const PENDING_QUEUE_KEY = 'taplearn:pending-actions:v1'
const NFC_COUNT_PREFIX = 'taplearn:nfc-count:v1:'
const COMPLETION_THRESHOLD = 67

type PendingAction =
  | {
      id: string
      type: 'lesson-progress'
      passportId: string
      lessonId: string
      score: number
      createdAt: number
    }
  | {
      id: string
      type: 'diagnostic'
      passportId: string
      lessonId: string
      score: number
      createdAt: number
    }
  | {
      id: string
      type: 'nfc-tap'
      passportId: string
      createdAt: number
    }

export class HttpError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = 'HttpError'
  }
}

class NetworkUnavailableError extends Error {
  constructor(
    message = 'TAPLEARN could not reach the server. Your result can be saved on this device and synced later.',
  ) {
    super(message)
    this.name = 'NetworkUnavailableError'
  }
}

function safeRead<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function safeWrite(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Storage can be disabled or full. Do not crash the learning UI.
  }
}

function mergeQueuedLessonScores(passport: Passport): Passport {
  let lessons = passport.lessons

  for (const action of readQueue()) {
    if (
      action.type !== 'lesson-progress' ||
      action.passportId !== passport.passport_id
    ) {
      continue
    }

    lessons = lessons.map(lesson => {
      if (lesson.lesson_id !== action.lessonId) return lesson

      const bestScore = Math.max(lesson.score ?? 0, action.score)

      return {
        ...lesson,
        score: bestScore,
        completed: lesson.completed || bestScore >= COMPLETION_THRESHOLD,
      }
    })
  }

  const scoreTotal = lessons.reduce(
    (total, lesson) => total + (lesson.score ?? 0),
    0,
  )

  return {
    ...passport,
    lessons,
    lessons_completed: lessons.filter(lesson => lesson.completed).length,
    lessons_total: lessons.length,
    progress_percent: lessons.length
      ? Math.round(scoreTotal / lessons.length)
      : 0,
  }
}

function cachePassport(passport: Passport): void {
  safeWrite(
    `${PASSPORT_CACHE_PREFIX}${passport.passport_id}`,
    mergeQueuedLessonScores(passport),
  )
}

function readCachedPassport(passportId: string): Passport | null {
  return safeRead<Passport | null>(
    `${PASSPORT_CACHE_PREFIX}${passportId}`,
    null,
  )
}

function readQueue(): PendingAction[] {
  return safeRead<PendingAction[]>(PENDING_QUEUE_KEY, [])
}

function writeQueue(queue: PendingAction[]): void {
  safeWrite(PENDING_QUEUE_KEY, queue)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('taplearn:sync-queue-changed'))
  }
}

function newActionId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

function enqueue(action: PendingAction): void {
  const queue = readQueue()
  queue.push(action)
  writeQueue(queue)
}

export function getPendingSyncCount(): number {
  return readQueue().length
}

async function request<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response

  try {
    const headers = new Headers(init?.headers)
    if (!headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json')
    }
    const token = getAuthToken()
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }

    response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers,
    })
  } catch {
    throw new NetworkUnavailableError()
  }

  if (!response.ok) {
    const body = await response.json().catch(() => ({
      detail: 'Something went wrong',
    }))
    const message = response.status >= 500
      ? `TAPLEARN server returned ${response.status}. Your action was not saved.`
      : (body.detail || `Request failed (${response.status})`)
    throw new HttpError(message, response.status)
  }

  return response.json() as Promise<T>
}

export function getAuthToken(): string | null {
  try {
    return typeof window === 'undefined'
      ? null
      : window.localStorage.getItem(AUTH_TOKEN_KEY)
  } catch {
    return null
  }
}

export function clearAuthToken(): void {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(AUTH_TOKEN_KEY)
      window.localStorage.removeItem(AUTH_USER_CACHE_KEY)
    }
  } catch {
    // Storage may be disabled. The app can still return to the sign-in screen.
  }
}

function saveAuthSession(session: AuthSession): AuthSession {
  try {
    window.localStorage.setItem(AUTH_TOKEN_KEY, session.token)
    window.localStorage.setItem(
      AUTH_USER_CACHE_KEY,
      JSON.stringify({ email: session.email, passport: session.passport }),
    )
  } catch {
    throw new Error('Your browser could not save the sign-in session. Please enable site storage and try again.')
  }
  cachePassport(session.passport)
  return session
}

export async function registerAccount(payload: {
  display_name: string
  email: string
  password: string
}): Promise<AuthSession> {
  const session = await request<AuthSession>('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return saveAuthSession(session)
}

export async function loginAccount(payload: {
  email: string
  password: string
}): Promise<AuthSession> {
  const session = await request<AuthSession>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  })
  return saveAuthSession(session)
}

export function getCachedAuthUser(): CurrentAuthUser | null {
  const cached = safeRead<CurrentAuthUser | null>(AUTH_USER_CACHE_KEY, null)
  if (!cached?.passport?.passport_id) return null
  return {
    ...cached,
    passport: readCachedPassport(cached.passport.passport_id) ?? cached.passport,
  }
}

export async function getCurrentUser(): Promise<CurrentAuthUser> {
  const user = await request<CurrentAuthUser>('/api/auth/me')
  safeWrite(AUTH_USER_CACHE_KEY, user)
  cachePassport(user.passport)
  return user
}

export async function logoutAccount(): Promise<void> {
  try {
    if (getAuthToken()) {
      await request<{ logged_out: boolean }>('/api/auth/logout', {
        method: 'POST',
      })
    }
  } finally {
    clearAuthToken()
  }
}

export async function getPassport(id: string): Promise<Passport> {
  try {
    const passport = await request<Passport>(
      `/api/passport/${encodeURIComponent(id)}`,
    )

    cachePassport(passport)
    return readCachedPassport(id) ?? passport
  } catch (error) {
    if (error instanceof NetworkUnavailableError) {
      const cached = readCachedPassport(id)

      if (cached) return cached

      throw new Error(
        'This device has not downloaded this learning passport yet. Open TAPLEARN once while online, then you can use it offline.',
      )
    }

    throw error
  }
}

function applyLocalLessonScore(
  passportId: string,
  lessonId: string,
  score: number,
): Passport {
  const cached = readCachedPassport(passportId)

  if (!cached) {
    throw new Error(
      'Connect to TAPLEARN once before going offline so this device can save your learning passport.',
    )
  }

  const lessons = cached.lessons.map(lesson => {
    if (lesson.lesson_id !== lessonId) return lesson

    const bestScore = Math.max(lesson.score ?? 0, score)

    return {
      ...lesson,
      score: bestScore,
      completed: lesson.completed || bestScore >= COMPLETION_THRESHOLD,
    }
  })

  const scoreTotal = lessons.reduce(
    (total, lesson) => total + (lesson.score ?? 0),
    0,
  )

  const updated: Passport = {
    ...cached,
    lessons,
    lessons_completed: lessons.filter(lesson => lesson.completed).length,
    lessons_total: lessons.length,
    progress_percent: lessons.length
      ? Math.round(scoreTotal / lessons.length)
      : 0,
    current_lesson:
      lessons.find(lesson => lesson.lesson_id === lessonId)?.title ??
      cached.current_lesson,
    sync_status: 'queued',
  }

  cachePassport(updated)
  return updated
}

export async function saveLessonProgress(
  passportId: string,
  lessonId: string,
  score: number,
): Promise<Passport> {
  try {
    const updated = await request<Passport>(
      `/api/progress/${encodeURIComponent(passportId)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          lesson_id: lessonId,
          score,
        }),
      },
    )

    cachePassport(updated)

    return {
      ...(readCachedPassport(passportId) ?? updated),
      sync_status: 'synced',
    }
  } catch (error) {
    if (!(error instanceof NetworkUnavailableError)) throw error

    const updated = applyLocalLessonScore(passportId, lessonId, score)

    enqueue({
      id: newActionId(),
      type: 'lesson-progress',
      passportId,
      lessonId,
      score,
      createdAt: Date.now(),
    })

    return updated
  }
}

export async function saveDiagnostic(
  passportId: string,
  lessonId: string,
  score: number,
): Promise<{
  passport_id: string
  lesson_id: string
  score: number
  attempt: number
  saved: boolean
  sync_status: 'synced' | 'queued'
}> {
  try {
    const result = await request<{
      passport_id: string
      lesson_id: string
      score: number
      attempt: number
      saved: boolean
    }>(
      `/api/diagnostic/${encodeURIComponent(passportId)}`,
      {
        method: 'POST',
        body: JSON.stringify({
          lesson_id: lessonId,
          score,
        }),
      },
    )

    return {
      ...result,
      sync_status: 'synced',
    }
  } catch (error) {
    if (!(error instanceof NetworkUnavailableError)) throw error

    if (!readCachedPassport(passportId)) {
      throw new Error(
        'Connect to TAPLEARN once before going offline so this device can save your diagnostics.',
      )
    }

    const queue = readQueue()

    const previousAttempts = queue.filter(
      item =>
        item.type === 'diagnostic' &&
        item.passportId === passportId &&
        item.lessonId === lessonId,
    ).length

    enqueue({
      id: newActionId(),
      type: 'diagnostic',
      passportId,
      lessonId,
      score,
      createdAt: Date.now(),
    })

    return {
      passport_id: passportId,
      lesson_id: lessonId,
      score,
      attempt: previousAttempts + 1,
      saved: true,
      sync_status: 'queued',
    }
  }
}

export const getHealth = () =>
  request<{ status: string; app: string }>('/api/health')

export async function getTutorFeedback(
  payload: TutorRequest,
): Promise<TutorResponse> {
  try {
    return await request<TutorResponse>(
      '/api/tutor/explain',
      {
        method: 'POST',
        body: JSON.stringify(payload),
      },
    )
  } catch (error) {
    if (error instanceof NetworkUnavailableError) {
      throw new Error(
        'The live Groq tutor needs an internet connection. Your downloaded lesson, quiz and saved progress are still available offline.',
      )
    }

    throw error
  }
}

export async function registerNfcTap(
  passportId: string,
): Promise<NfcTapResponse> {
  try {
    const session = await request<NfcTapResponse>(
      `/api/nfc/tap/${encodeURIComponent(passportId)}`,
      { method: 'POST' },
    )

    cachePassport(session.passport)
    safeWrite(
      `${NFC_COUNT_PREFIX}${passportId}`,
      session.tap_count,
    )

    return {
      ...session,
      passport: readCachedPassport(passportId) ?? session.passport,
      synced: true,
    }
  } catch (error) {
    if (!(error instanceof NetworkUnavailableError)) throw error

    const passport = readCachedPassport(passportId)

    if (!passport) {
      throw new Error(
        'This NFC passport has not been cached on this device. Open it once while online before using it offline.',
      )
    }

    const previousCount = safeRead<number>(
      `${NFC_COUNT_PREFIX}${passportId}`,
      0,
    )

    const tapCount = previousCount + 1

    safeWrite(`${NFC_COUNT_PREFIX}${passportId}`, tapCount)

    enqueue({
      id: newActionId(),
      type: 'nfc-tap',
      passportId,
      createdAt: Date.now(),
    })

    return {
      session_started: true,
      tap_count: tapCount,
      passport,
      synced: false,
    }
  }
}

let activeSync: Promise<number> | null = null

export function syncPendingChanges(): Promise<number> {
  if (activeSync) return activeSync

  activeSync = (async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return 0

    let queue = readQueue()
    let syncedCount = 0

    for (const action of queue) {
      try {
        if (action.type === 'lesson-progress') {
          const updated = await request<Passport>(
            `/api/progress/${encodeURIComponent(action.passportId)}`,
            {
              method: 'POST',
              body: JSON.stringify({
                lesson_id: action.lessonId,
                score: action.score,
              }),
            },
          )

          cachePassport({
            ...updated,
            sync_status: 'synced',
          })
        } else if (action.type === 'diagnostic') {
          await request(
            `/api/diagnostic/${encodeURIComponent(action.passportId)}`,
            {
              method: 'POST',
              body: JSON.stringify({
                lesson_id: action.lessonId,
                score: action.score,
              }),
            },
          )
        } else {
          const session = await request<NfcTapResponse>(
            `/api/nfc/tap/${encodeURIComponent(action.passportId)}`,
            { method: 'POST' },
          )

          cachePassport(session.passport)

          safeWrite(
            `${NFC_COUNT_PREFIX}${action.passportId}`,
            session.tap_count,
          )
        }

        queue = queue.filter(item => item.id !== action.id)
        writeQueue(queue)
        syncedCount += 1
      } catch {
        // Keep this item and later items queued for another attempt.
        break
      }
    }

    return syncedCount
  })().finally(() => {
    activeSync = null
  })

  return activeSync
}

export type StudyRoomMember = {
  display_name: string
  role: 'host' | 'member'
  joined_at: string
}

export type StudyRoom = {
  room_code: string
  title: string
  lesson_id: string
  host_name: string
  created_at: string
  expires_at: string
  max_members: number
  is_active: boolean
  member_count: number
  members: StudyRoomMember[]
}

export type StudyRoomSession = {
  room: StudyRoom
  member_token: string
  invite_path: string
}

export const createStudyRoom = (payload: {
  host_name: string
  lesson_id: string
  title: string
}) =>
  request<StudyRoomSession>('/api/rooms', {
    method: 'POST',
    body: JSON.stringify(payload),
  })

export const joinStudyRoom = (
  roomCode: string,
  payload: { display_name: string },
) =>
  request<StudyRoomSession>(
    `/api/rooms/${encodeURIComponent(roomCode)}/join`,
    {
      method: 'POST',
      body: JSON.stringify(payload),
    },
  )

export const heartbeatStudyRoom = (
  roomCode: string,
  memberToken: string,
) =>
  request<StudyRoom>(
    `/api/rooms/${encodeURIComponent(roomCode)}/heartbeat`,
    {
      method: 'POST',
      body: JSON.stringify({ member_token: memberToken }),
    },
  )

export const leaveStudyRoom = (
  roomCode: string,
  memberToken: string,
) =>
  request<{ left: boolean }>(
    `/api/rooms/${encodeURIComponent(roomCode)}/leave`,
    {
      method: 'POST',
      body: JSON.stringify({ member_token: memberToken }),
    },
  )
// -----------------------------------------------------------------------------
// Collaborative study rooms
// -----------------------------------------------------------------------------

export type CollabRoom = {
  room_code: string
  host_name: string
  expires_at: string
}

export type CollabMember = {
  member_name: string
  joined_at: string
}

export type CollabNote = {
  id: number
  author: string
  title: string
  content: string
  created_at: string
}

export type CollabResource = {
  id: number
  author: string
  title: string
  url: string
  description: string
  created_at: string
}

export type CollabMessage = {
  id: number
  author: string
  message: string
  created_at: string
}

export type CollabStroke = {
  id: number
  author: string
  colour: string
  points: Array<{ x: number; y: number }>
  created_at: string
}

export type CollabQuiz = {
  quiz_id: string
  title: string
  created_by: string
  is_active: boolean
  current_index: number
  total_questions: number
  revealed: boolean
  question: null | {
    question: string
    options: string[]
    correct_index?: number
    explanation?: string
  }
  your_answer_index: number | null
  answer_count: number
  scores: Array<{ member_name: string; score: number; answered: number }>
}

export type CollabWorkspace = {
  room: CollabRoom
  member_name: string
  members: CollabMember[]
  notes: CollabNote[]
  resources: CollabResource[]
  messages: CollabMessage[]
  quiz: CollabQuiz | null
  whiteboard: { strokes: CollabStroke[] }
  updated_at: string
}

export type CollabQuizQuestionInput = {
  question: string
  options: string[]
  correct_index: number
  explanation: string
}

export async function createCollabRoom(memberName: string): Promise<{ room_code: string; host_name: string; expires_at: string; member_name: string }> {
  return request<{ room_code: string; host_name: string; expires_at: string; member_name: string }>('/api/collab/rooms', {
    method: 'POST',
    body: JSON.stringify({ member_name: memberName }),
  })
}

export async function joinCollabRoom(roomCode: string, memberName: string): Promise<{ joined: boolean; room_code: string; member_name: string; expires_at: string }> {
  return request<{ joined: boolean; room_code: string; member_name: string; expires_at: string }>(`/api/collab/rooms/${encodeURIComponent(roomCode)}/join`, {
    method: 'POST',
    body: JSON.stringify({ member_name: memberName }),
  })
}

export async function getCollabWorkspace(roomCode: string, memberName: string): Promise<CollabWorkspace> {
  const query = new URLSearchParams({ member_name: memberName })
  return request<CollabWorkspace>(`/api/collab/rooms/${encodeURIComponent(roomCode)}/workspace?${query.toString()}`)
}

export async function addCollabNote(roomCode: string, memberName: string, title: string, content: string): Promise<CollabNote> {
  return request<CollabNote>(`/api/collab/rooms/${encodeURIComponent(roomCode)}/notes`, {
    method: 'POST', body: JSON.stringify({ member_name: memberName, title, content }),
  })
}

export async function addCollabResource(roomCode: string, memberName: string, title: string, url: string, description: string): Promise<CollabResource> {
  return request<CollabResource>(`/api/collab/rooms/${encodeURIComponent(roomCode)}/resources`, {
    method: 'POST', body: JSON.stringify({ member_name: memberName, title, url, description }),
  })
}

export async function addCollabMessage(roomCode: string, memberName: string, message: string): Promise<CollabMessage> {
  return request<CollabMessage>(`/api/collab/rooms/${encodeURIComponent(roomCode)}/messages`, {
    method: 'POST', body: JSON.stringify({ member_name: memberName, message }),
  })
}

export async function startCollabQuiz(roomCode: string, memberName: string, title: string, questions: CollabQuizQuestionInput[]) {
  return request<{ started: boolean; quiz_id: string; title: string; questions: number }>(`/api/collab/rooms/${encodeURIComponent(roomCode)}/quiz/start`, {
    method: 'POST', body: JSON.stringify({ member_name: memberName, title, questions }),
  })
}

export async function answerCollabQuiz(roomCode: string, memberName: string, answerIndex: number) {
  return request<{ accepted: boolean; question_index: number }>(`/api/collab/rooms/${encodeURIComponent(roomCode)}/quiz/answer`, {
    method: 'POST', body: JSON.stringify({ member_name: memberName, answer_index: answerIndex }),
  })
}

export async function revealCollabQuiz(roomCode: string, memberName: string) {
  return request<{ revealed: boolean }>(`/api/collab/rooms/${encodeURIComponent(roomCode)}/quiz/reveal`, {
    method: 'POST', body: JSON.stringify({ member_name: memberName }),
  })
}

export async function nextCollabQuizQuestion(roomCode: string, memberName: string) {
  return request<{ completed: boolean; current_index?: number }>(`/api/collab/rooms/${encodeURIComponent(roomCode)}/quiz/next`, {
    method: 'POST', body: JSON.stringify({ member_name: memberName }),
  })
}

export async function addCollabStroke(roomCode: string, memberName: string, colour: string, points: Array<{ x: number; y: number }>) {
  return request<{ saved: boolean; stroke_id: number }>(`/api/collab/rooms/${encodeURIComponent(roomCode)}/whiteboard/strokes`, {
    method: 'POST', body: JSON.stringify({ member_name: memberName, colour, points }),
  })
}

export async function clearCollabWhiteboard(roomCode: string, memberName: string) {
  return request<{ cleared: boolean }>(`/api/collab/rooms/${encodeURIComponent(roomCode)}/whiteboard/clear`, {
    method: 'POST', body: JSON.stringify({ member_name: memberName }),
  })
}
