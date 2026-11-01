import { useCallback, useEffect, useState } from 'react'
import type { FormEvent, ChangeEvent } from 'react'
import {
  BookOpen, ExternalLink, FileImage, FileText, FileUp, GraduationCap,
  RefreshCw, Search, UserPlus, Users, UserCheck,
} from 'lucide-react'
import './community.css'
import { getAuthToken } from '../api'

type Role = 'student' | 'teacher'
type Tab = 'discover' | 'following' | 'followers' | 'library'

type Profile = {
  passport_id: string
  display_name: string
  role: Role
  bio: string
  followers: number
  following: number
  is_following?: boolean
}

type Resource = {
  id: number
  uploader_id: string
  uploader_name: string
  title: string
  description: string
  subject: string
  original_name: string
  mime_type: string
  size_bytes: number
  licence: string
  created_at: string
  file_url: string
}

const API_BASE = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '')

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    const headers = new Headers(init?.headers)
    const token = getAuthToken()
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`)
    }
    response = await fetch(`${API_BASE}${path}`, { ...init, headers })
  } catch {
    throw new Error('Cannot reach TAPLEARN. Check your internet connection and backend URL.')
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: 'Request failed.' }))
    throw new Error(body.detail || `Request failed (${response.status})`)
  }
  return response.json() as Promise<T>
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
})

function fileSize(bytes: number): string {
  return bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} KB`
    : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function CommunityView({
  passportId,
  passportName,
}: {
  passportId: string
  passportName: string
}) {
  const [tab, setTab] = useState<Tab>('discover')
  const [profile, setProfile] = useState<Profile | null>(null)
  const [people, setPeople] = useState<Profile[]>([])
  const [resources, setResources] = useState<Resource[]>([])
  const [query, setQuery] = useState('')
  const [roleFilter, setRoleFilter] = useState<'all' | Role>('all')
  const [role, setRole] = useState<Role>('student')
  const [bio, setBio] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [resourceTitle, setResourceTitle] = useState('')
  const [resourceDescription, setResourceDescription] = useState('')
  const [subject, setSubject] = useState('Data Structures')
  const [file, setFile] = useState<File | null>(null)

  const loadProfile = useCallback(async () => {
    const result = await api<Profile>(`/api/community/profile/${encodeURIComponent(passportId)}`)
    setProfile(result)
    setRole(result.role)
    setBio(result.bio || '')
  }, [passportId])

  const loadPeople = useCallback(async () => {
    const params = new URLSearchParams({ q: query, role: roleFilter, current_id: passportId })
    const result = await api<{ people: Profile[] }>(`/api/community/search?${params.toString()}`)
    setPeople(result.people)
  }, [passportId, query, roleFilter])

  const loadResources = useCallback(async () => {
    const result = await api<{ resources: Resource[] }>('/api/community/resources')
    setResources(result.resources)
  }, [])

  const loadRelationships = useCallback(async (which: 'followers' | 'following') => {
    const result = await api<{ people: Profile[] }>(`/api/community/profile/${encodeURIComponent(passportId)}/${which}`)
    setPeople(result.people)
  }, [passportId])

  const refresh = useCallback(async () => {
    setError('')
    try {
      await Promise.all([loadProfile(), loadPeople(), loadResources()])
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not load the community.')
    }
  }, [loadProfile, loadPeople, loadResources])

  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (tab === 'discover') void loadPeople().catch(e => setError(e instanceof Error ? e.message : 'Search failed.'))
    if (tab === 'following' || tab === 'followers') {
      void loadRelationships(tab).catch(e => setError(e instanceof Error ? e.message : 'Could not load people.'))
    }
    if (tab === 'library') void loadResources().catch(e => setError(e instanceof Error ? e.message : 'Could not load resources.'))
  }, [tab, loadPeople, loadRelationships, loadResources])

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true); setError(''); setNotice('')
    try {
      const updated = await api<Profile>(`/api/community/profile/${encodeURIComponent(passportId)}/update`, json({ role, bio }))
      setProfile(updated)
      setNotice('Profile updated.')
      await loadPeople()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save profile.')
    } finally { setBusy(false) }
  }

  async function follow(person: Profile) {
    setBusy(true); setError(''); setNotice('')
    try {
      await api(`/api/community/profile/${encodeURIComponent(passportId)}/follow`, json({
        target_id: person.passport_id,
        action: person.is_following ? 'unfollow' : 'follow',
      }))
      setNotice(person.is_following ? `Unfollowed ${person.display_name}.` : `Following ${person.display_name}.`)
      if (tab === 'discover') await loadPeople()
      else if (tab === 'followers' || tab === 'following') await loadRelationships(tab)
      else await loadResources()
      await loadProfile()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not update follow status.')
    } finally { setBusy(false) }
  }

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    setFile(event.target.files?.[0] || null)
  }

  async function uploadResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!file) { setError('Choose a PDF or image first.'); return }
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
    if (!allowed.includes(file.type)) { setError('Choose a PDF, PNG, JPG or WEBP file.'); return }
    if (file.size > 15 * 1024 * 1024) { setError('Maximum file size is 15 MB.'); return }
    setBusy(true); setError(''); setNotice('')
    try {
      const params = new URLSearchParams({
        title: resourceTitle,
        description: resourceDescription,
        subject,
        licence: 'CC BY 4.0',
        filename: file.name,
      })
      await api(`/api/community/resources/${encodeURIComponent(passportId)}?${params.toString()}`, {
        method: 'POST',
        headers: { 'Content-Type': file.type },
        body: file,
      })
      setResourceTitle(''); setResourceDescription(''); setFile(null)
      const picker = document.getElementById('community-file') as HTMLInputElement | null
      if (picker) picker.value = ''
      await loadResources()
      setNotice('Resource uploaded to the shared library.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Upload failed.')
    } finally { setBusy(false) }
  }

  const visiblePeople = people

  return (
    <section className="community-page section-wrap">
      <header className="community-header">
        <div>
          <p className="eyebrow dark-eyebrow">TAPLEARN / OPEN LEARNING NETWORK</p>
          <h1>Learn with <em>your people.</em></h1>
          <p>Follow classmates, discover educators and share study materials with the learning community.</p>
        </div>
        <div className="community-header-mark"><Users size={30}/><span>COMMUNITY</span></div>
      </header>

      {error && <div className="community-alert error">{error}<button onClick={() => setError('')}>Dismiss</button></div>}
      {notice && <div className="community-alert success">{notice}<button onClick={() => setNotice('')}>Dismiss</button></div>}

      <div className="community-grid">
        <aside className="community-profile-card">
          <div className="community-avatar">{(profile?.display_name || passportName).slice(0, 1).toUpperCase()}</div>
          <h2>{profile?.display_name || passportName}</h2>
          <span className="community-role">{profile?.role === 'teacher' ? 'Teacher / educator · self-declared' : 'Student profile'}</span>
          <div className="community-counts">
            <div><strong>{profile?.followers ?? 0}</strong><span>Followers</span></div>
            <div><strong>{profile?.following ?? 0}</strong><span>Following</span></div>
          </div>
          <form className="community-profile-form" onSubmit={saveProfile}>
            <label>Profile type
              <select value={role} onChange={e => setRole(e.target.value as Role)}>
                <option value="student">Student</option>
                <option value="teacher">Teacher / educator</option>
              </select>
            </label>
            <label>About you
              <textarea value={bio} onChange={e => setBio(e.target.value)} rows={3} maxLength={240} placeholder="What are you learning or teaching?"/>
            </label>
            <button className="community-button" disabled={busy}>Save profile</button>
          </form>
          <small className="community-disclaimer">Teacher profiles are self-declared, not verified credentials.</small>
        </aside>

        <div className="community-content-card">
          <nav className="community-tabs">
            <button className={tab === 'discover' ? 'active' : ''} onClick={() => setTab('discover')}><Search size={15}/> Discover</button>
            <button className={tab === 'following' ? 'active' : ''} onClick={() => setTab('following')}><UserCheck size={15}/> Following</button>
            <button className={tab === 'followers' ? 'active' : ''} onClick={() => setTab('followers')}><Users size={15}/> Followers</button>
            <button className={tab === 'library' ? 'active' : ''} onClick={() => setTab('library')}><BookOpen size={15}/> Library</button>
          </nav>

          {tab !== 'library' ? (
            <div className="community-panel">
              <div className="community-panel-title">
                <div><h2>{tab === 'discover' ? 'Discover students and teachers' : tab === 'following' ? 'People you follow' : 'Your followers'}</h2><p>Find classmates to learn with and educators to learn from.</p></div>
                <button className="community-refresh" onClick={() => void refresh()}><RefreshCw size={14}/> Refresh</button>
              </div>
              {tab === 'discover' && <div className="community-search-row">
                <label className="community-search"><Search size={15}/><input value={query} onChange={e => setQuery(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void loadPeople() }} placeholder="Search names or bios"/></label>
                <select value={roleFilter} onChange={e => setRoleFilter(e.target.value as 'all' | Role)}><option value="all">Everyone</option><option value="student">Students</option><option value="teacher">Teachers</option></select>
                <button className="community-button" onClick={() => void loadPeople()}>Search</button>
              </div>}
              <div className="community-people">
                {visiblePeople.length === 0 ? <div className="community-empty">{tab === 'discover' ? 'No matching profiles yet. Create another passport below.' : 'No profiles to show yet.'}</div> : visiblePeople.map(person => (
                  <article className="community-person" key={person.passport_id}>
                    <div className="community-person-avatar">{person.display_name.slice(0, 1).toUpperCase()}</div>
                    <div className="community-person-copy"><strong>{person.display_name}</strong><span>{person.role === 'teacher' ? <><GraduationCap size={13}/> Teacher / educator</> : <><Users size={13}/> Student</>}</span>{person.bio && <small>{person.bio}</small>}<small>{person.followers} followers</small></div>
                    <button className={person.is_following ? 'community-follow following' : 'community-follow'} disabled={busy} onClick={() => void follow(person)}>{person.is_following ? <><UserCheck size={14}/> Following</> : <><UserPlus size={14}/> Follow</>}</button>
                  </article>
                ))}
              </div>
            </div>
          ) : (
            <div className="community-panel">
              <div className="community-panel-title"><div><h2>Shared learning library</h2><p>Contribute PDFs and images that you have permission to share.</p></div><button className="community-refresh" onClick={() => void loadResources()}><RefreshCw size={14}/> Refresh</button></div>
              <form className="community-upload" onSubmit={uploadResource}>
                <div className="community-upload-heading"><FileUp size={18}/><strong>Upload a study resource</strong><span>PDF / PNG / JPG / WEBP · max 15 MB</span></div>
                <label>Resource title<input value={resourceTitle} onChange={e => setResourceTitle(e.target.value)} required maxLength={120} placeholder="e.g. Binary Trees class notes"/></label>
                <div className="community-upload-fields"><label>Subject<input value={subject} onChange={e => setSubject(e.target.value)} maxLength={60}/></label><label>Description<input value={resourceDescription} onChange={e => setResourceDescription(e.target.value)} maxLength={500} placeholder="What does this resource cover?"/></label></div>
                <label className="community-file-label">Choose file<input id="community-file" type="file" accept="application/pdf,image/png,image/jpeg,image/webp" onChange={onFileChange} required/><span>{file ? file.name : 'No file selected'}</span></label>
                <button className="community-button" disabled={busy}>{busy ? 'Uploading…' : 'Upload to library'}</button>
                <small>Uploaded files are attributed to your passport. Avoid private student documents.</small>
              </form>
              <div className="community-resources">
                {resources.length === 0 ? <div className="community-empty">No resources uploaded yet. Be the first to contribute.</div> : resources.map(item => (
                  <article className="community-resource" key={item.id}>
                    <div className="community-resource-icon">{item.mime_type === 'application/pdf' ? <FileText size={21}/> : <FileImage size={21}/>}</div>
                    <div className="community-resource-copy"><strong>{item.title}</strong><span>{item.subject} · by {item.uploader_name}</span><small>{item.original_name} · {fileSize(item.size_bytes)} · {item.licence}</small>{item.description && <p>{item.description}</p>}</div>
                    <a href={`${API_BASE}${item.file_url}`} target="_blank" rel="noreferrer">Open <ExternalLink size={13}/></a>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

    </section>
  )
}
