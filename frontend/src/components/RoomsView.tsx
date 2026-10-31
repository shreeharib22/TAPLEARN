import { useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, DoorOpen, KeyRound, Plus, Users } from 'lucide-react'
import { createCollabRoom, joinCollabRoom } from '../api'
import RoomCollaborationWorkspace from './RoomCollaborationWorkspace'
import './rooms-collab.css'

type RoomsViewProps = {
  passportName: string
  roomCode: string | null
  onOpenRoom: (code: string) => void
  onExitRoom: () => void
}

export default function RoomsView({ passportName, roomCode, onOpenRoom, onExitRoom }: RoomsViewProps) {
  const [displayName, setDisplayName] = useState(passportName || 'Learner')
  const [joinCode, setJoinCode] = useState(roomCode || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [readyToJoin, setReadyToJoin] = useState(false)

  async function createRoom() {
    const name = displayName.trim()
    if (!name) {
      setError('Enter your name before creating a room.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const room = await createCollabRoom(name)
      setReadyToJoin(true)
      onOpenRoom(room.room_code)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not create the study room.')
    } finally {
      setBusy(false)
    }
  }

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const name = displayName.trim()
    const code = joinCode.trim().toUpperCase()
    if (!name || !code) {
      setError('Enter your name and the six-character room code.')
      return
    }
    setBusy(true)
    setError('')
    try {
      await joinCollabRoom(code, name)
      setReadyToJoin(true)
      onOpenRoom(code)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not join this study room.')
    } finally {
      setBusy(false)
    }
  }

  if (roomCode && !readyToJoin) {
    return <section className="rooms-page section-wrap">
      <div className="rooms-back-row">
        <button className="rooms-back-button" onClick={onExitRoom}><DoorOpen size={15}/> Back to learning</button>
      </div>
      <div className="rooms-join-gate">
        <p className="eyebrow dark-eyebrow">YOU HAVE A ROOM INVITE</p>
        <h1>Join the<br/><em>conversation.</em></h1>
        <p>Enter the name your classmates will recognise. You are joining room <strong>{roomCode}</strong>.</p>
        <form onSubmit={event => void joinRoom(event)}>
          <label>Your display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={40} placeholder="Your name" required/></label>
          <button className="rooms-primary-button" disabled={busy || !displayName.trim()}>Join this room <ArrowRight size={16}/></button>
        </form>
        {error && <div className="rooms-error rooms-error-inline">{error}</div>}
      </div>
    </section>
  }

  if (roomCode) {
    return <div>
      <div className="rooms-back-row section-wrap">
        <button className="rooms-back-button" onClick={onExitRoom}><DoorOpen size={15}/> Leave workspace</button>
      </div>
      <RoomCollaborationWorkspace roomCode={roomCode} displayName={displayName.trim() || passportName || 'Learner'} />
    </div>
  }

  return <section className="rooms-page section-wrap">
    <div className="rooms-heading">
      <div>
        <p className="eyebrow dark-eyebrow">LEARN BETTER, TOGETHER</p>
        <h1>Make room<br/><em>for ideas.</em></h1>
        <p>Create a shared study space, invite classmates, and work through difficult concepts as a group.</p>
      </div>
      <div className="rooms-heading-icon"><Users size={34}/><span>SHARED LEARNING</span></div>
    </div>

    <div className="rooms-lobby-grid">
      <article className="rooms-lobby-card rooms-create-card">
        <span className="rooms-card-kicker">START A SESSION</span>
        <div className="rooms-card-icon"><Plus size={20}/></div>
        <h2>Create a room</h2>
        <p>Open a new study room and invite your group with a code or QR link.</p>
        <label>Your display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={40} placeholder="Your name"/></label>
        <button className="rooms-primary-button" disabled={busy || !displayName.trim()} onClick={() => void createRoom()}>Create study room <ArrowRight size={16}/></button>
      </article>

      <article className="rooms-lobby-card">
        <span className="rooms-card-kicker">JOIN YOUR GROUP</span>
        <div className="rooms-card-icon"><KeyRound size={20}/></div>
        <h2>Join a room</h2>
        <p>Enter the room code shared by your classmate to open the collaborative workspace.</p>
        <form onSubmit={event => void joinRoom(event)}>
          <label>Your display name<input value={displayName} onChange={event => setDisplayName(event.target.value)} maxLength={40} placeholder="Your name"/></label>
          <label>Six-character room code<input value={joinCode} onChange={event => setJoinCode(event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6))} maxLength={6} placeholder="E.g. R7K2PA" autoCapitalize="characters"/></label>
          <button className="rooms-primary-button" disabled={busy || !displayName.trim() || joinCode.trim().length !== 6}>Join study room <ArrowRight size={16}/></button>
        </form>
      </article>
    </div>

    <div className="rooms-lobby-hint"><strong>Inside each room:</strong> shared notes, useful links, group chat, a DSA quiz and a collaborative whiteboard. Rooms are designed to expire after two hours.</div>
    {error && <div className="rooms-error rooms-error-inline">{error}<button onClick={() => setError('')} aria-label="Dismiss error">×</button></div>}
  </section>
}
