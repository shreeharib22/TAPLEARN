import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent, PointerEvent } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import {
  ArrowLeft, BookOpen, Check, Clipboard, FileText, Link2, MessageCircle,
  PenLine, Plus, Send, Users, X,
} from 'lucide-react'
import {
  addCollabMessage, addCollabNote, addCollabResource, addCollabStroke,
  answerCollabQuiz, clearCollabWhiteboard, getCollabWorkspace,
  joinCollabRoom, nextCollabQuizQuestion, revealCollabQuiz, startCollabQuiz,
  type CollabStroke, type CollabWorkspace,
} from '../api'
import './rooms-collab.css'

type Tab = 'notes' | 'resources' | 'chat' | 'quiz' | 'board'
type Point = { x: number; y: number }

type Props = {
  roomCode: string
  displayName: string
}

const sampleQuestions = [
  {
    question: 'What is the maximum number of children a binary-tree node can have?',
    options: ['One', 'Two', 'Three', 'Any number'],
    correct_index: 1,
    explanation: 'A binary-tree node can have zero, one, or two children.',
  },
  {
    question: 'What is the topmost node of a tree called?',
    options: ['Leaf', 'Sibling', 'Root', 'Edge'],
    correct_index: 2,
    explanation: 'The root is the starting or topmost node in a tree.',
  },
  {
    question: 'Which order describes inorder traversal?',
    options: ['Root, Left, Right', 'Left, Root, Right', 'Left, Right, Root', 'Right, Left, Root'],
    correct_index: 1,
    explanation: 'Inorder traversal visits the left subtree, then the root, then the right subtree.',
  },
]

function drawStrokes(canvas: HTMLCanvasElement, strokes: CollabStroke[], live?: Point[]) {
  const context = canvas.getContext('2d')
  if (!context) return
  context.clearRect(0, 0, canvas.width, canvas.height)
  context.fillStyle = '#fffefa'
  context.fillRect(0, 0, canvas.width, canvas.height)

  const paint = (points: Point[], colour: string) => {
    if (points.length < 2) return
    context.beginPath()
    context.strokeStyle = colour
    context.lineWidth = 3
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.moveTo(points[0].x, points[0].y)
    for (const point of points.slice(1)) context.lineTo(point.x, point.y)
    context.stroke()
  }

  for (const stroke of strokes) paint(stroke.points, stroke.colour)
  if (live) paint(live, '#365c43')
}

export default function RoomCollaborationWorkspace({ roomCode, displayName }: Props) {
  const memberName = displayName
  const [joinedCode, setJoinedCode] = useState<string | null>(null)
  const [workspace, setWorkspace] = useState<CollabWorkspace | null>(null)
  const [tab, setTab] = useState<Tab>('notes')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [copied, setCopied] = useState(false)
  const [noteTitle, setNoteTitle] = useState('')
  const [noteContent, setNoteContent] = useState('')
  const [resourceTitle, setResourceTitle] = useState('')
  const [resourceUrl, setResourceUrl] = useState('')
  const [resourceDescription, setResourceDescription] = useState('')
  const [chatMessage, setChatMessage] = useState('')
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const pointsRef = useRef<Point[]>([])

  const refresh = useCallback(async (code: string, name: string) => {
    try {
      const data = await getCollabWorkspace(code, name)
      setWorkspace(data)
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not refresh this study room.')
    }
  }, [])

  useEffect(() => {
    let active = true
    setJoinedCode(null)
    setWorkspace(null)
    setBusy(true)
    setError('')
    joinCollabRoom(roomCode, memberName)
      .then(result => { if (active) setJoinedCode(result.room_code) })
      .catch(caught => { if (active) setError(caught instanceof Error ? caught.message : 'Could not connect this room to the collaboration workspace.') })
      .finally(() => { if (active) setBusy(false) })
    return () => { active = false }
  }, [roomCode, memberName])

  useEffect(() => {
    if (joinedCode !== roomCode) setWorkspace(null)
  }, [roomCode, joinedCode])

  useEffect(() => {
    if (!roomCode || joinedCode !== roomCode) return
    let active = true
    const load = async () => {
      try {
        const data = await getCollabWorkspace(roomCode, memberName)
        if (active) {
          setWorkspace(data)
          setError('')
        }
      } catch (caught) {
        if (active) setError(caught instanceof Error ? caught.message : 'Room connection was interrupted.')
      }
    }
    void load()
    const timer = window.setInterval(() => void load(), 2500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [roomCode, joinedCode, memberName])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !workspace || drawingRef.current) return
    drawStrokes(canvas, workspace.whiteboard.strokes)
  }, [workspace?.whiteboard.strokes, tab])

  const inviteUrl = `${window.location.origin}/?room=${encodeURIComponent(roomCode)}`

  async function copyInvite() {
    if (!roomCode) return
    const invite = inviteUrl
    try {
      await navigator.clipboard.writeText(invite)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError(`Copy this invite link: ${invite}`)
    }
  }

  async function submitNote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!roomCode || !noteTitle.trim() || !noteContent.trim()) return
    setBusy(true)
    try {
      await addCollabNote(roomCode, memberName, noteTitle, noteContent)
      setNoteTitle('')
      setNoteContent('')
      await refresh(roomCode, memberName)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the note.')
    } finally {
      setBusy(false)
    }
  }

  async function submitResource(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!roomCode || !resourceTitle.trim() || !resourceUrl.trim()) return
    setBusy(true)
    try {
      await addCollabResource(roomCode, memberName, resourceTitle, resourceUrl, resourceDescription)
      setResourceTitle('')
      setResourceUrl('')
      setResourceDescription('')
      await refresh(roomCode, memberName)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not share this resource.')
    } finally {
      setBusy(false)
    }
  }

  async function submitMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!roomCode || !chatMessage.trim()) return
    const message = chatMessage.trim()
    setChatMessage('')
    try {
      await addCollabMessage(roomCode, memberName, message)
      await refresh(roomCode, memberName)
    } catch (caught) {
      setChatMessage(message)
      setError(caught instanceof Error ? caught.message : 'Could not send the message.')
    }
  }

  async function startSampleQuiz() {
    if (!roomCode) return
    setBusy(true)
    try {
      await startCollabQuiz(roomCode, memberName, 'Binary Trees · Room Challenge', sampleQuestions)
      await refresh(roomCode, memberName)
      setTab('quiz')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not start the group quiz.')
    } finally {
      setBusy(false)
    }
  }

  async function submitAnswer(index: number) {
    if (!roomCode) return
    setBusy(true)
    try {
      await answerCollabQuiz(roomCode, memberName, index)
      await refresh(roomCode, memberName)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not submit your answer.')
    } finally {
      setBusy(false)
    }
  }

  async function revealAnswer() {
    if (!roomCode) return
    setBusy(true)
    try {
      await revealCollabQuiz(roomCode, memberName)
      await refresh(roomCode, memberName)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not reveal the answer.')
    } finally {
      setBusy(false)
    }
  }

  async function nextQuestion() {
    if (!roomCode) return
    setBusy(true)
    try {
      await nextCollabQuizQuestion(roomCode, memberName)
      await refresh(roomCode, memberName)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not move to the next question.')
    } finally {
      setBusy(false)
    }
  }

  function pointerPoint(event: PointerEvent<HTMLCanvasElement>): Point {
    const rect = event.currentTarget.getBoundingClientRect()
    return {
      x: Math.max(0, Math.min(900, ((event.clientX - rect.left) / rect.width) * 900)),
      y: Math.max(0, Math.min(420, ((event.clientY - rect.top) / rect.height) * 420)),
    }
  }

  function pointerDown(event: PointerEvent<HTMLCanvasElement>) {
    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    pointsRef.current = [pointerPoint(event)]
  }

  function pointerMove(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return
    pointsRef.current.push(pointerPoint(event))
    const canvas = canvasRef.current
    if (canvas) drawStrokes(canvas, workspace?.whiteboard.strokes ?? [], pointsRef.current)
  }

  async function pointerUp() {
    if (!drawingRef.current) return
    drawingRef.current = false
    const points = pointsRef.current
    pointsRef.current = []
    if (!roomCode || points.length < 2) return
    try {
      await addCollabStroke(roomCode, memberName, '#365c43', points)
      await refresh(roomCode, memberName)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not save the whiteboard stroke.')
    }
  }

  async function clearBoard() {
    if (!roomCode) return
    try {
      await clearCollabWhiteboard(roomCode, memberName)
      await refresh(roomCode, memberName)
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Could not clear the board.')
    }
  }

  const joined = Boolean(roomCode && joinedCode === roomCode)
  const quiz = workspace?.quiz

  if (!joined) {
    return <section className="rooms-page section-wrap">
      <div className="rooms-connecting"><div className="rooms-connecting-orbit"><Users size={28}/></div><p className="paper-kicker">CONNECTING STUDY ROOM</p><h2>Opening your shared workspace…</h2><p>Room {roomCode} · {memberName}</p>{busy && <span className="rooms-connecting-status">Syncing room access</span>}{error && <p className="rooms-error">{error}</p>}</div>
    </section>
  }

  return <section className="rooms-page section-wrap">
    <div className="rooms-room-topline"><span className="rooms-workspace-label">ROOM WORKSPACE</span><span className="rooms-live-pill"><i/> LIVE ROOM</span></div>
    <div className="rooms-room-heading">
      <div><p className="eyebrow dark-eyebrow">YOUR COLLABORATIVE SPACE</p><h1>Study room <em>{roomCode}</em></h1><p>Drop a note, share a resource, ask a question or sketch an idea together.</p></div>
      <div className="rooms-invite-box"><span>SCAN TO JOIN</span><QRCodeSVG value={inviteUrl} size={104} bgColor="#f5f7f0" fgColor="#35523b" level="M"/><strong>{roomCode}</strong><button onClick={() => void copyInvite()}><Clipboard size={14}/> {copied ? 'Copied' : 'Copy invite link'}</button></div>
    </div>
    <div className="rooms-member-strip"><div className="rooms-member-title"><Users size={16}/><strong>{workspace?.members.length ?? 1} here now</strong></div><div className="rooms-member-list">{workspace?.members.map(member => <span key={member.member_name}>{member.member_name}</span>)}</div><span className="rooms-expiry">Room closes {workspace ? new Date(workspace.room.expires_at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : 'in 2 hours'}</span></div>
    <div className="rooms-workspace-shell">
      <nav className="rooms-tabs" aria-label="Room tools">
        <button className={tab === 'notes' ? 'active' : ''} onClick={() => setTab('notes')}><FileText size={16}/> Notes</button>
        <button className={tab === 'resources' ? 'active' : ''} onClick={() => setTab('resources')}><Link2 size={16}/> Resources</button>
        <button className={tab === 'chat' ? 'active' : ''} onClick={() => setTab('chat')}><MessageCircle size={16}/> Chat</button>
        <button className={tab === 'quiz' ? 'active' : ''} onClick={() => setTab('quiz')}><BookOpen size={16}/> Quiz together</button>
        <button className={tab === 'board' ? 'active' : ''} onClick={() => setTab('board')}><PenLine size={16}/> Whiteboard</button>
      </nav>
      <div className="rooms-panel">
        {tab === 'notes' && <div className="rooms-panel-grid"><div className="rooms-panel-copy"><p className="paper-kicker">SHARED STUDY NOTES</p><h2>Put the key ideas<br/><em>in one place.</em></h2><p>Every room member can add notes. New notes appear for everyone in the room.</p><form className="rooms-form" onSubmit={event => void submitNote(event)}><label>Note title<input value={noteTitle} onChange={event => setNoteTitle(event.target.value)} maxLength={100} placeholder="e.g. Inorder traversal" required/></label><label>Your notes<textarea value={noteContent} onChange={event => setNoteContent(event.target.value)} maxLength={8000} rows={5} placeholder="Write a definition, example, or something your group should remember…" required/></label><button className="rooms-primary-button" disabled={busy}>Save shared note <Plus size={15}/></button></form></div><div className="rooms-feed">{workspace?.notes.length ? workspace.notes.map(note => <article className="rooms-note" key={note.id}><div className="rooms-note-meta"><span>{note.author}</span><time>{new Date(note.created_at).toLocaleString()}</time></div><h3>{note.title}</h3><p>{note.content}</p></article>) : <div className="rooms-empty"><FileText size={28}/><strong>No shared notes yet</strong><span>Add the first note for your group.</span></div>}</div></div>}

        {tab === 'resources' && <div className="rooms-panel-grid"><div className="rooms-panel-copy"><p className="paper-kicker">RESOURCE SHELF</p><h2>Useful links,<br/><em>within reach.</em></h2><p>Collect lesson pages, videos, documentation and other learning links in one shared shelf.</p><form className="rooms-form" onSubmit={event => void submitResource(event)}><label>Resource name<input value={resourceTitle} onChange={event => setResourceTitle(event.target.value)} maxLength={120} placeholder="e.g. Binary tree visualiser" required/></label><label>URL<input type="url" value={resourceUrl} onChange={event => setResourceUrl(event.target.value)} placeholder="https://…" required/></label><label>Short description<textarea value={resourceDescription} onChange={event => setResourceDescription(event.target.value)} maxLength={500} rows={3} placeholder="What should classmates use this for?"/></label><button className="rooms-primary-button" disabled={busy}>Share resource <Plus size={15}/></button></form></div><div className="rooms-feed">{workspace?.resources.length ? workspace.resources.map(resource => <article className="rooms-resource" key={resource.id}><div className="rooms-note-meta"><span>Shared by {resource.author}</span><time>{new Date(resource.created_at).toLocaleDateString()}</time></div><h3>{resource.title}</h3>{resource.description && <p>{resource.description}</p>}<a href={resource.url} target="_blank" rel="noreferrer">Open resource <ArrowLeft className="rooms-external-arrow" size={14}/></a></article>) : <div className="rooms-empty"><Link2 size={28}/><strong>No resources shared</strong><span>Add a useful link for your group.</span></div>}</div></div>}

        {tab === 'chat' && <div className="rooms-chat-panel"><div className="rooms-chat-intro"><p className="paper-kicker">ROOM CONVERSATION</p><h2>Think out loud.</h2><p>Use chat to ask quick questions and coordinate your study session.</p></div><div className="rooms-chat-messages">{workspace?.messages.slice().reverse().map(message => <article className={message.author === memberName ? 'rooms-chat-message mine' : 'rooms-chat-message'} key={message.id}><strong>{message.author}</strong><p>{message.message}</p><time>{new Date(message.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time></article>)}{!workspace?.messages.length && <div className="rooms-empty"><MessageCircle size={28}/><strong>It's quiet in here</strong><span>Start the conversation with your group.</span></div>}</div><form className="rooms-chat-compose" onSubmit={event => void submitMessage(event)}><input value={chatMessage} onChange={event => setChatMessage(event.target.value)} maxLength={1200} placeholder="Write a message…"/><button type="submit" disabled={!chatMessage.trim()} aria-label="Send message"><Send size={17}/></button></form></div>}

        {tab === 'quiz' && <div className="rooms-quiz-panel"><div className="rooms-chat-intro"><p className="paper-kicker">COLLABORATIVE CHECKPOINT</p><h2>Challenge the group.</h2><p>Everyone answers the same question. The quiz creator reveals the answer, then moves the group forward.</p></div>{!quiz && <div className="rooms-quiz-start"><BookOpen size={32}/><h3>Ready for a quick group challenge?</h3><p>Start a short Binary Trees quiz. Everyone in the room can take part.</p><button className="rooms-primary-button" disabled={busy} onClick={() => void startSampleQuiz()}>Start sample DSA quiz <ArrowLeft className="rooms-button-arrow" size={16}/></button></div>}{quiz && <div className="rooms-quiz-card"><div className="rooms-quiz-progress"><span>{quiz.title}</span><strong>{quiz.is_active ? `${quiz.current_index + 1} / ${quiz.total_questions}` : 'COMPLETE'}</strong></div>{quiz.question && <><h3>{quiz.question.question}</h3><div className="rooms-quiz-options">{quiz.question.options.map((option, index) => <button key={`${index}-${option}`} disabled={busy || !quiz.is_active || quiz.your_answer_index !== null || quiz.revealed} className={[quiz.your_answer_index === index ? 'chosen' : '', quiz.revealed && quiz.question?.correct_index === index ? 'correct' : '', quiz.revealed && quiz.your_answer_index === index && quiz.question?.correct_index !== index ? 'wrong' : ''].filter(Boolean).join(' ')} onClick={() => void submitAnswer(index)}><span>{String.fromCharCode(65 + index)}</span>{option}{quiz.revealed && quiz.question?.correct_index === index && <Check size={16}/>}</button>)}</div>{!quiz.revealed && <p className="rooms-quiz-waiting">{quiz.your_answer_index !== null ? 'Your answer is in. Waiting for the reveal.' : 'Choose an answer to submit it to the group.'} <span>{quiz.answer_count} submitted</span></p>}{quiz.revealed && <div className="rooms-quiz-explanation"><strong>Why this is the answer</strong><p>{quiz.question.explanation}</p></div>}</>}{quiz.revealed && <div className="rooms-quiz-actions"><button className="rooms-primary-button" disabled={busy} onClick={() => void nextQuestion()}>{quiz.current_index + 1 >= quiz.total_questions ? 'Finish group quiz' : 'Next question'} <ArrowLeft className="rooms-button-arrow" size={16}/></button></div>}{!quiz.is_active && <><div className="rooms-scoreboard"><h3>Group scoreboard</h3>{quiz.scores.map(score => <div key={score.member_name}><span>{score.member_name}</span><strong>{score.score} / {quiz.total_questions}</strong></div>)}</div><button className="rooms-primary-button" disabled={busy} onClick={() => void startSampleQuiz()}>Start another group quiz <BookOpen size={15}/></button></>}{quiz.is_active && !quiz.revealed && quiz.created_by === memberName && <button className="rooms-reveal-button" disabled={busy} onClick={() => void revealAnswer()}>Reveal answer to everyone</button>}</div>}</div>}

        {tab === 'board' && <div className="rooms-board-panel"><div className="rooms-board-heading"><div><p className="paper-kicker">SHARED WHITEBOARD</p><h2>Sketch the idea.</h2><p>Draw a tree, map a process or work through an example. Strokes sync to the room.</p></div><button className="rooms-clear-button" onClick={() => void clearBoard()}><X size={14}/> Clear board</button></div><canvas ref={canvasRef} width={900} height={420} className="rooms-whiteboard-canvas" onPointerDown={pointerDown} onPointerMove={pointerMove} onPointerUp={() => void pointerUp()} onPointerCancel={() => void pointerUp()} aria-label="Shared drawing whiteboard"/><div className="rooms-board-footer"><span><PenLine size={14}/> Draw with your mouse, trackpad or touchscreen</span><span>{workspace?.whiteboard.strokes.length ?? 0} shared strokes</span></div></div>}
      </div>
    </div>
    {error && <div className="rooms-error rooms-error-inline">{error}<button onClick={() => setError('')} aria-label="Dismiss error"><X size={14}/></button></div>}
  </section>
}
