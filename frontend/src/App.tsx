
import { useEffect, useMemo, useState, type FormEvent } from 'react'
import {
  ArrowRight, ArrowUpRight, Award, BookOpen, BrainCircuit, Check,
  CheckCircle2, Clock3, Code, Copy, ExternalLink, Folder, GitBranch,
  Github, Leaf, LibraryBig, Lightbulb, Link2, Nfc, Radio, RefreshCw,
  Search, Sparkles, Sprout, Target, TreePine, Users, WifiOff, CloudUpload, X,
} from 'lucide-react'
import { QRCodeSVG } from 'qrcode.react'

import {
  getPassport,
  getTutorFeedback,
  registerNfcTap,
  saveDiagnostic,
  saveLessonProgress,
  getPendingSyncCount,
  syncPendingChanges,
  createStudyRoom,
  joinStudyRoom,
  heartbeatStudyRoom,
  leaveStudyRoom,
  type Passport,
  type TutorResponse,
  type StudyRoom,
  type StudyRoomSession,
} from './api'


// =============================================================================
// TYPES AND COURSE CONTENT
// =============================================================================

type View =
  | 'tap'
  | 'grove'
  | 'courses'
  | 'lesson'
  | 'mindscan'
  | 'passport'
  | 'rooms'

type QuizMode = 'lesson' | 'mindscan'

type WrongAnswer = {
  question: string
  chosen_answer: string
  correct_answer: string
  explanation: string
}

type Question = {
  question: string
  options: string[]
  answer: number
  explanation: string
}

type Module = {
  id: string
  title: string
  category: string
  duration: string
  level: string
  summary: string
  lesson: string
  concepts: string[]
  rescue: string
  questions: Question[]
  diagnosticQuestions: Question[]
  symbol: 'tree' | 'branch' | 'search' | 'leaf'
}

const modules: Module[] = [
  {
    id: 'binary-trees-intro',
    title: 'Binary Trees',
    category: 'Data Structures',
    duration: '8 min',
    level: 'Beginner',
    symbol: 'tree',
    summary: 'Understand how data branches, connects and gets organised.',
    lesson:
      'A binary tree is a hierarchical structure made of nodes. Each node can have zero, one, or two children. The first node is the root; nodes with no children are leaves.',
    concepts: [
      'Root — the topmost node',
      'Parent — a node that has children',
      'Leaf — a node with no children',
    ],
    rescue:
      'Remember: “binary” means each node can have at most two children. It does not mean every node must have exactly two.',
    questions: [
      {
        question: 'What is the maximum number of children a binary-tree node can have?',
        options: ['Exactly two', 'At most two', 'At least two', 'Any number'],
        answer: 1,
        explanation:
          'A node can have zero, one, or two children. Binary sets the maximum at two.',
      },
      {
        question: 'What do we call the topmost node?',
        options: ['Root', 'Leaf', 'Sibling', 'Branch'],
        answer: 0,
        explanation:
          'The root is the starting point of the tree. Every other node descends from it.',
      },
      {
        question: 'Which node has no children?',
        options: ['Parent', 'Root', 'Leaf', 'Sibling'],
        answer: 2,
        explanation:
          'A leaf is a node with no children. It marks the end of a branch.',
      },
    ],
    diagnosticQuestions: [
      {
        question: 'A node has one child. Can it still be part of a binary tree?',
        options: [
          'No, both children are required',
          'Yes, one child is allowed',
          'Only if it is the root',
          'Only if it is a leaf',
        ],
        answer: 1,
        explanation:
          'Binary trees allow zero, one, or two children per node.',
      },
      {
        question: 'In the example tree, what is node 4 relative to node 8?',
        options: ['A parent', 'A child', 'The root', 'A leaf'],
        answer: 1,
        explanation:
          'Node 8 is the root, and 4 is one of its children.',
      },
      {
        question: 'A node with no left or right child is called what?',
        options: ['Leaf', 'Sibling', 'Ancestor', 'Edge'],
        answer: 0,
        explanation: 'A leaf has no children.',
      },
    ],
  },
  {
    id: 'tree-traversals',
    title: 'Tree Traversals',
    category: 'Algorithms',
    duration: '10 min',
    level: 'Beginner',
    symbol: 'branch',
    summary: 'Learn the different ways to visit every node in a tree.',
    lesson:
      'Tree traversal is the process of visiting each node in a defined order. Preorder visits Root, Left, Right. Inorder visits Left, Root, Right. Postorder visits Left, Right, Root. Level-order visits nodes one level at a time, from left to right. For the sample tree with root 8, children 4 and 12, and leaves 2, 6, 10 and 14, level-order is 8, 4, 12, 2, 6, 10, 14.',
    concepts: [
      'Preorder — Root, Left, Right',
      'Inorder — Left, Root, Right',
      'Postorder — Left, Right, Root',
      'Level-order — level by level, left to right',
    ],
    rescue:
      'Use the position of the word “root” to remember the order: pre means before the children, in means between them, and post means after them.',
    questions: [
      {
        question: 'Which order describes inorder traversal?',
        options: [
          'Left, Root, Right',
          'Root, Left, Right',
          'Left, Right, Root',
          'Right, Root, Left',
        ],
        answer: 0,
        explanation:
          'Inorder visits the left subtree, then the root, then the right subtree.',
      },
      {
        question: 'Which traversal visits the root first?',
        options: ['Postorder', 'Preorder', 'Inorder', 'Level order only'],
        answer: 1,
        explanation:
          'Preorder visits the root before exploring the left and right subtrees.',
      },
      {
        question: 'In postorder traversal, when is the root visited?',
        options: ['First', 'Between children', 'Last', 'Never'],
        answer: 2,
        explanation:
          'Postorder visits left, then right, and the root last.',
      },
    ],
    diagnosticQuestions: [
      {
        question: 'Which traversal order is Root → Left → Right?',
        options: ['Inorder', 'Postorder', 'Preorder', 'Level order'],
        answer: 2,
        explanation: 'Preorder visits the root before its subtrees.',
      },
      {
        question: 'For inorder traversal, which part is visited between left and right?',
        options: ['Root', 'Deepest leaf', 'Parent only', 'Nothing'],
        answer: 0,
        explanation: 'Inorder means Left → Root → Right.',
      },
      {
        question:
          'Which traversal is useful when children should be handled before their parent?',
        options: ['Preorder', 'Postorder', 'Inorder', 'None'],
        answer: 1,
        explanation:
          'Postorder visits both subtrees before the root.',
      },
    ],
  },
  {
    id: 'binary-search-trees',
    title: 'Binary Search Trees',
    category: 'Data Structures',
    duration: '9 min',
    level: 'Beginner',
    symbol: 'search',
    summary: 'See how ordered trees make searching more efficient.',
    lesson:
      'A binary search tree (BST) keeps values ordered. Values smaller than a node are placed in its left subtree, and larger values are placed in its right subtree. This structure can make searching efficient when it stays balanced.',
    concepts: [
      'Smaller values go left',
      'Larger values go right',
      'Inorder traversal visits values in sorted order',
    ],
    rescue:
      'A BST is not just any binary tree. The key idea is the ordering rule: smaller on the left, larger on the right.',
    questions: [
      {
        question: 'Where does a value smaller than the current node belong?',
        options: [
          'Left subtree',
          'Right subtree',
          'Always at the root',
          'Outside the tree',
        ],
        answer: 0,
        explanation:
          'The BST rule places smaller values in the left subtree.',
      },
      {
        question: 'What does inorder traversal of a valid BST produce?',
        options: [
          'Random order',
          'Ascending order',
          'Descending only',
          'Only leaf nodes',
        ],
        answer: 1,
        explanation:
          'Left-root-right traversal visits the BST values from smallest to largest.',
      },
      {
        question: 'What helps a BST keep search operations efficient?',
        options: [
          'Having no leaves',
          'Keeping it balanced',
          'Using only one child',
          'Removing the root',
        ],
        answer: 1,
        explanation:
          'A balanced BST keeps its height small, reducing the number of comparisons needed.',
      },
    ],
    diagnosticQuestions: [
      {
        question: 'When inserting 5 into a BST whose root is 8, where do you move first?',
        options: ['Right', 'Left', 'Above the root', 'Anywhere'],
        answer: 1,
        explanation:
          'Five is smaller than eight, so follow the left branch.',
      },
      {
        question: 'A value greater than the current node belongs in which subtree?',
        options: ['Left', 'Right', 'Root only', 'It cannot be inserted'],
        answer: 1,
        explanation: 'The BST ordering rule sends larger values right.',
      },
      {
        question: 'Which condition can make a BST slow to search?',
        options: [
          'It is balanced',
          'It is highly skewed',
          'It has a root',
          'It has leaves',
        ],
        answer: 1,
        explanation:
          'A skewed BST can behave like a linked list.',
      },
    ],
  },
  {
    id: 'tree-applications',
    title: 'Tree Applications',
    category: 'Computer Science',
    duration: '7 min',
    level: 'Beginner',
    symbol: 'leaf',
    summary:
      'Connect tree structures to file systems, expressions and real products.',
    lesson:
      'Trees are useful whenever information has a hierarchy. File systems use folders and files, HTML documents form a document tree, and expression trees represent the structure of mathematical expressions.',
    concepts: [
      'File systems organise folders and files',
      'HTML uses a document object tree',
      'Expression trees represent operators and values',
    ],
    rescue:
      'Look for a parent-child relationship. Whenever one item contains or groups smaller items, a tree may be a useful way to represent it.',
    questions: [
      {
        question: 'Which example naturally has a hierarchical tree structure?',
        options: [
          'A shuffled deck',
          'A file system',
          'A single number',
          'A stopwatch',
        ],
        answer: 1,
        explanation:
          'Folders can contain other folders and files, creating a hierarchy.',
      },
      {
        question:
          'In an expression tree, what is commonly stored in internal nodes?',
        options: ['Operators', 'Only spaces', 'File names', 'Screen pixels'],
        answer: 0,
        explanation:
          'Internal nodes commonly hold operators, while leaf nodes hold operands.',
      },
      {
        question: 'What does the HTML DOM represent?',
        options: [
          'A random list',
          'A document tree',
          'A network cable',
          'A database password',
        ],
        answer: 1,
        explanation:
          'The DOM represents the document as a hierarchy of related nodes.',
      },
    ],
    diagnosticQuestions: [
      {
        question:
          'A folder contains subfolders and files. Which structure models that relationship?',
        options: ['Stack', 'Tree', 'Queue', 'Flat array only'],
        answer: 1,
        explanation:
          'Folders and their contents form parent-child relationships.',
      },
      {
        question: 'In an expression tree, where are operators commonly stored?',
        options: [
          'Internal nodes',
          'Only in leaves',
          'Outside the tree',
          'In array indexes',
        ],
        answer: 0,
        explanation:
          'Operators combine values, so they are commonly internal nodes.',
      },
      {
        question: 'What is the parent-child structure of a web page called?',
        options: ['Call stack', 'DOM tree', 'Hash table', 'Queue'],
        answer: 1,
        explanation:
          'The Document Object Model represents a page as a tree.',
      },
    ],
  },
]


// =============================================================================
// ROUTING
// =============================================================================

function readRoute(): { view: View; passportId: string } {
  const parts = window.location.pathname.split('/').filter(Boolean)
  const params = new URLSearchParams(window.location.search)

  if (parts[0] === 'tap' && parts[1]) {
    return {
      view: 'tap',
      passportId: decodeURIComponent(parts[1]),
    }
  }

  if (params.has('room') || params.get('view') === 'rooms') {
    return {
      view: 'rooms',
      passportId: 'demo-passport-01',
    }
  }

  return {
    view: 'grove',
    passportId: 'demo-passport-01',
  }
}


// =============================================================================
// MAIN APPLICATION
// =============================================================================

export default function App() {
  const initial = useMemo(readRoute, [])

  const [view, setView] = useState<View>(initial.view)
  const [passportId] = useState(initial.passportId)
  const [passport, setPassport] = useState<Passport | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedModuleId, setSelectedModuleId] = useState('binary-trees-intro')
  const [quizMode, setQuizMode] = useState<QuizMode>('lesson')
  const [quizIndex, setQuizIndex] = useState(0)
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null)
  const [answered, setAnswered] = useState(false)
  const [score, setScore] = useState(0)
  const [wrongAnswers, setWrongAnswers] = useState<WrongAnswer[]>([])
  const [saving, setSaving] = useState(false)

  const [result, setResult] = useState<{
    score: number
    total: number
    percent: number
    moduleId: string
    mode: QuizMode
  } | null>(null)

  const [notice, setNotice] = useState('')
  const [copyState, setCopyState] = useState('Copy passport link')
  const [tapCount, setTapCount] = useState(0)

  const [isOnline, setIsOnline] = useState(
    () => typeof navigator === 'undefined' ? true : navigator.onLine,
  )

  const [pendingSyncCount, setPendingSyncCount] = useState(
    () => getPendingSyncCount(),
  )

  const [syncing, setSyncing] = useState(false)

  const selectedModule =
    modules.find(item => item.id === selectedModuleId) ?? modules[0]

  const currentQuestions =
    quizMode === 'mindscan'
      ? selectedModule.diagnosticQuestions
      : selectedModule.questions

  const filteredModules = modules.filter(item =>
    `${item.title} ${item.category} ${item.summary}`
      .toLowerCase()
      .includes(searchQuery.toLowerCase()),
  )

  const nextModule =
    modules.find(item =>
      !passport?.lessons.find(
        progress => progress.lesson_id === item.id,
      )?.completed,
    ) ?? modules[0]


  async function loadPassport(id: string) {
    setLoading(true)
    setError('')

    try {
      const data = await getPassport(id)
      setPassport(data)
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not load learner passport.',
      )
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    let active = true

    async function openLearningSpace() {
      setLoading(true)
      setError('')

      try {
        if (initial.view === 'tap') {
          const session = await registerNfcTap(passportId)

          if (active) {
            setPassport(session.passport)
            setTapCount(session.tap_count)
          }
        } else {
          const data = await getPassport(passportId)

          if (active) setPassport(data)
        }
      } catch (e) {
        if (active) {
          setError(
            e instanceof Error
              ? e.message
              : 'Could not load learner passport.',
          )
        }
      } finally {
        if (active) setLoading(false)
      }
    }

    void openLearningSpace()

    return () => {
      active = false
    }
  }, [passportId])


  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const next = event.state?.view as View | undefined
      setView(next ?? readRoute().view)
    }

    window.addEventListener('popstate', handlePopState)

    return () => window.removeEventListener('popstate', handlePopState)
  }, [])


  useEffect(() => {
    let active = true

    const handleOffline = () => {
      setIsOnline(false)
      setPendingSyncCount(getPendingSyncCount())

      setNotice(
        'Offline learning is active. Your lesson results will be saved on this device.',
      )
    }

    const handleOnline = async () => {
      setIsOnline(true)

      const pending = getPendingSyncCount()
      if (!pending) return

      setSyncing(true)

      try {
        const synced = await syncPendingChanges()
        if (!active) return

        setPendingSyncCount(getPendingSyncCount())

        if (synced > 0) {
          const refreshed = await getPassport(passportId)
          if (!active) return

          setPassport(refreshed)
          setNotice(
            `${synced} offline result${synced === 1 ? '' : 's'} synced to your learning passport.`,
          )
        }
      } catch {
        if (active) setPendingSyncCount(getPendingSyncCount())
      } finally {
        if (active) setSyncing(false)
      }
    }

    const handleQueueChange = () => {
      setPendingSyncCount(getPendingSyncCount())
    }

    window.addEventListener('offline', handleOffline)
    window.addEventListener('online', handleOnline)

    window.addEventListener(
      'taplearn:sync-queue-changed',
      handleQueueChange,
    )

    if (navigator.onLine && getPendingSyncCount() > 0) {
      void handleOnline()
    }

    return () => {
      active = false

      window.removeEventListener('offline', handleOffline)
      window.removeEventListener('online', handleOnline)

      window.removeEventListener(
        'taplearn:sync-queue-changed',
        handleQueueChange,
      )
    }
  }, [passportId])


  function navigate(next: View) {
    setView(next)
    setNotice('')
    setSearchOpen(false)

    const targetUrl =
      next === 'rooms'
        ? '/?view=rooms'
        : `/tap/${encodeURIComponent(passportId)}`

    window.history.pushState(
      { view: next },
      '',
      targetUrl,
    )

    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }


  function resetQuiz() {
    setQuizIndex(0)
    setSelectedAnswer(null)
    setAnswered(false)
    setScore(0)
    setWrongAnswers([])
    setResult(null)
    setError('')
  }


  function startModule(
    moduleId: string,
    mode: QuizMode = 'lesson',
  ) {
    setSelectedModuleId(moduleId)
    setQuizMode(mode)
    resetQuiz()

    navigate(mode === 'mindscan' ? 'mindscan' : 'lesson')
  }


  function chooseAnswer(index: number) {
    if (answered || !currentQuestions[quizIndex]) return

    setSelectedAnswer(index)
    setAnswered(true)

    const question = currentQuestions[quizIndex]

    if (index === question.answer) {
      setScore(value => value + 1)
    } else {
      setWrongAnswers(value => [
        ...value,
        {
          question: question.question,
          chosen_answer: question.options[index],
          correct_answer: question.options[question.answer],
          explanation: question.explanation,
        },
      ])
    }
  }


  async function nextQuestion() {
    if (!answered) return

    if (quizIndex < currentQuestions.length - 1) {
      setQuizIndex(value => value + 1)
      setSelectedAnswer(null)
      setAnswered(false)
      return
    }

    const finalScore = score
    const percent = Math.round(
      (finalScore / currentQuestions.length) * 100,
    )

    setSaving(true)
    setError('')

    try {
      let syncStatus: 'synced' | 'queued' = 'synced'

      if (quizMode === 'mindscan') {
        const saved = await saveDiagnostic(
          passportId,
          selectedModule.id,
          percent,
        )

        syncStatus = saved.sync_status ?? 'synced'
      } else {
        const updated = await saveLessonProgress(
          passportId,
          selectedModule.id,
          percent,
        )

        syncStatus = updated.sync_status ?? 'synced'
        setPassport(updated)
      }

      setPendingSyncCount(getPendingSyncCount())

      setResult({
        score: finalScore,
        total: currentQuestions.length,
        percent,
        moduleId: selectedModule.id,
        mode: quizMode,
      })

      setNotice(
        syncStatus === 'queued'
          ? 'Saved on this device. Your result will sync automatically when you are back online.'
          : 'Your learning passport has been updated.',
      )
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not save your assessment.',
      )
    } finally {
      setSaving(false)
    }
  }


  async function copyPassportLink() {
    const url =
      `${window.location.origin}/tap/${encodeURIComponent(passportId)}`

    try {
      await navigator.clipboard.writeText(url)
      setCopyState('Link copied')
    } catch {
      setCopyState(url)
    }
  }


  async function syncOfflineResults() {
    if (!navigator.onLine || syncing) return

    setSyncing(true)

    try {
      const synced = await syncPendingChanges()

      setPendingSyncCount(getPendingSyncCount())

      if (synced > 0) {
        const refreshed = await getPassport(passportId)
        setPassport(refreshed)

        setNotice(
          `${synced} offline result${synced === 1 ? '' : 's'} synced to your learning passport.`,
        )
      }
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : 'Could not synchronise offline results.',
      )
    } finally {
      setSyncing(false)
    }
  }


  return (
    <div className="taplearn-app">

      {/* HEADER */}

      <header className="site-header">

        <button
          className="brand"
          onClick={() => navigate('grove')}
          aria-label="TAPLEARN home"
        >
          <span className="brand-mark">
            <Sprout size={21}/>
          </span>

          <span className="brand-copy">
            <strong>taplearn<span>.</span></strong>
            <small>LEARNING, IN MOTION</small>
          </span>
        </button>


        <nav className="floating-dock" aria-label="Main navigation">

          <button
            className={view === 'grove' ? 'dock-link active' : 'dock-link'}
            onClick={() => navigate('grove')}
          >
            <Leaf size={14}/> Grove
          </button>

          <button
            className={view === 'courses' ? 'dock-link active' : 'dock-link'}
            onClick={() => navigate('courses')}
          >
            <LibraryBig size={14}/> Courses
          </button>

          <button
            className={view === 'mindscan' ? 'dock-link active' : 'dock-link'}
            onClick={() => navigate('mindscan')}
          >
            <BrainCircuit size={14}/> MindScan
          </button>

          <button
            className={view === 'rooms' ? 'dock-link active' : 'dock-link'}
            onClick={() => navigate('rooms')}
          >
            <Users size={14}/> Rooms
          </button>

          <button
            className={view === 'passport' ? 'dock-link active' : 'dock-link'}
            onClick={() => navigate('passport')}
          >
            <Nfc size={14}/> Passport
          </button>

        </nav>


        <div className="header-actions">

          {searchOpen ? (
            <div className="search-wrap">
              <Search size={15}/>

              <input
                autoFocus
                value={searchQuery}
                onChange={event => {
                  setSearchQuery(event.target.value)
                  if (view !== 'courses') setView('courses')
                }}
                onKeyDown={event => {
                  if (event.key === 'Enter') navigate('courses')

                  if (event.key === 'Escape') {
                    setSearchOpen(false)
                    setSearchQuery('')
                  }
                }}
                placeholder="Find a lesson…"
              />

              <button
                onClick={() => {
                  setSearchOpen(false)
                  setSearchQuery('')
                }}
                aria-label="Close search"
              >
                <X size={15}/>
              </button>
            </div>
          ) : (
            <button
              className="header-icon"
              onClick={() => {
                setSearchOpen(true)
                setView('courses')
              }}
              aria-label="Search lessons"
            >
              <Search size={17}/>
            </button>
          )}

          <button
            className="tap-button"
            onClick={() => navigate('passport')}
          >
            <Nfc size={16}/>
            <span>Tap passport</span>
          </button>

          <button
            className="avatar-button"
            onClick={() => navigate('passport')}
            aria-label="Open learner passport"
          >
            {passport?.display_name?.slice(0, 1).toUpperCase() ?? 'L'}
          </button>

        </div>
      </header>


      {/* OFFLINE STATUS */}

      {(!isOnline || pendingSyncCount > 0) && (
        <div
          className={`offline-status-banner ${
            isOnline ? 'is-sync-pending' : 'is-offline'
          }`}
          role="status"
        >

          <span className="offline-status-icon">
            {isOnline
              ? <CloudUpload size={17}/>
              : <WifiOff size={17}/>}
          </span>

          <div className="offline-status-copy">
            <strong>
              {isOnline
                ? 'Results waiting to sync'
                : 'Offline learning is active'}
            </strong>

            <span>
              {isOnline
                ? `${pendingSyncCount} saved result${pendingSyncCount === 1 ? '' : 's'} waiting to sync.`
                : 'Lessons and quizzes remain available. Results are saved on this device until you reconnect.'}
            </span>
          </div>

          {pendingSyncCount > 0 && (
            <button
              className="offline-sync-button"
              type="button"
              onClick={() => void syncOfflineResults()}
              disabled={!isOnline || syncing}
            >
              <RefreshCw
                size={13}
                className={syncing ? 'offline-sync-spinning' : ''}
              />

              {syncing ? 'Syncing…' : 'Sync now'}
            </button>
          )}

        </div>
      )}


      {/* PAGE CONTENT */}

      {loading ? (
        <div className="page-loading">
          <div className="loader"/>
          <span>Growing your learning space…</span>
        </div>
      ) : error && !passport ? (
        <main className="error-page">
          <div className="error-mark">
            <Nfc size={26}/>
          </div>

          <p className="eyebrow">LEARNING PASSPORT</p>

          <h1>
            {error.startsWith('TAPLEARN API is offline')
              ? <>Your learning space is <em>offline.</em></>
              : <>This passport isn't here <em>yet.</em></>}
          </h1>

          <p>{error}</p>

          <button
            className="button button-primary"
            onClick={() => void loadPassport(passportId)}
          >
            Try again <ArrowRight size={16}/>
          </button>
        </main>
      ) : passport && (
        <main className="page-content">

          {view === 'tap' && (
            <TapEntryView
              passport={passport}
              nextModule={nextModule}
              tapCount={tapCount}
              onResume={() => startModule(nextModule.id, 'lesson')}
              onMindScan={() => startModule(nextModule.id, 'mindscan')}
              onPassport={() => navigate('passport')}
            />
          )}

          {view === 'grove' && (
            <GroveView
              passport={passport}
              nextModule={nextModule}
              modules={modules}
              onStart={startModule}
              onExplore={() => navigate('courses')}
              onMindScan={() => navigate('mindscan')}
              notice={notice}
            />
          )}

          {view === 'courses' && (
            <CoursesView
              passport={passport}
              modules={filteredModules}
              query={searchQuery}
              onClearSearch={() => setSearchQuery('')}
              onStart={id => startModule(id, 'lesson')}
            />
          )}

          {view === 'lesson' && (
            <LessonView
              passportId={passportId}
              module={selectedModule}
              wrongAnswers={wrongAnswers}
              quizIndex={quizIndex}
              selectedAnswer={selectedAnswer}
              answered={answered}
              score={score}
              saving={saving}
              questions={currentQuestions}
              result={result}
              error={error}
              onChoose={chooseAnswer}
              onNext={() => void nextQuestion()}
              onRetry={() => {
                resetQuiz()
                setQuizMode('lesson')
              }}
              onCourses={() => navigate('courses')}
            />
          )}

          {view === 'mindscan' && (
            <MindScanView
              passport={passport}
              modules={modules}
              module={selectedModule}
              wrongAnswers={wrongAnswers}
              quizIndex={quizIndex}
              selectedAnswer={selectedAnswer}
              answered={answered}
              score={score}
              saving={saving}
              questions={currentQuestions}
              result={result}
              error={error}
              onSelect={id => {
                setSelectedModuleId(id)
                setQuizMode('mindscan')
                resetQuiz()
              }}
              onStart={() => {
                setQuizMode('mindscan')
                resetQuiz()
              }}
              onChoose={chooseAnswer}
              onNext={() => void nextQuestion()}
              onRetry={resetQuiz}
              onCourses={() => navigate('courses')}
            />
          )}

          {view === 'passport' && (
            <PassportView
              passport={passport}
              copyState={copyState}
              onCopy={() => void copyPassportLink()}
              onCourses={() => navigate('courses')}
              onResume={() => startModule(nextModule.id, 'lesson')}
            />
          )}

          {view === 'rooms' && (
            <RoomsView
              learnerName={passport.display_name}
              lessons={modules.map(({ id, title }) => ({ id, title }))}
              onStartLesson={id => startModule(id, 'lesson')}
            />
          )}

        </main>
      )}


      {/* FOOTER */}

      <footer className="site-footer">
        <span>© 2026 TAPLEARN</span>
        <span>Built for curious minds <i>✳</i></span>
        <span><i className="status-dot"/> LOCAL BUILD</span>
      </footer>

    </div>
  )
}


// =============================================================================
// NFC TAP-IN PAGE
// =============================================================================

function TapEntryView({
  passport,
  nextModule,
  tapCount,
  onResume,
  onMindScan,
  onPassport,
}: {
  passport: Passport
  nextModule: Module
  tapCount: number
  onResume: () => void
  onMindScan: () => void
  onPassport: () => void
}) {
  return (
    <section className="tap-entry-page section-wrap">

      <div className="tap-entry-kicker">
        <span className="tap-entry-pulse"/>
        TAP-IN SESSION RESTORED
        <span>SESSION {String(tapCount).padStart(3, '0')}</span>
      </div>

      <div className="tap-entry-heading">
        <div>
          <p className="eyebrow dark-eyebrow">
            YOUR LEARNING PASSPORT IS CONNECTED
          </p>

          <h1>
            Welcome back,<br/>
            <em>{passport.display_name.split(' ')[0]}.</em>
          </h1>

          <p>
            Your learning identity and saved progress have travelled with you.
            Pick up from your next checkpoint on this device.
          </p>
        </div>

        <div className="tap-entry-orbit">
          <div className="tap-entry-orbit-inner">
            <Nfc size={35}/>
            <span>TAP<br/>LEARN</span>
          </div>
        </div>
      </div>


      <div className="tap-entry-grid">

        <article className="tap-entry-next">
          <p className="paper-kicker">NEXT LEARNING CHECKPOINT</p>

          <div className="tap-entry-number">
            0{Math.max(1, passport.lessons_completed + 1)}
            <span> / 0{passport.lessons_total}</span>
          </div>

          <h2>{nextModule.title}</h2>
          <p>{nextModule.summary}</p>

          <div className="tap-entry-meta">
            <span><Clock3 size={14}/> {nextModule.duration}</span>
            <span><Target size={14}/> {nextModule.level}</span>
            <span><BookOpen size={14}/> {nextModule.category}</span>
          </div>

          <button className="button button-dark" onClick={onResume}>
            Start my checkpoint <ArrowRight size={16}/>
          </button>
        </article>


        <article className="tap-entry-passport">
          <div className="tap-entry-passport-top">
            <span>PORTABLE LEARNING RECORD</span>
            <Nfc size={20}/>
          </div>

          <h3>{passport.progress_percent}<small>%</small></h3>
          <p>Learning progress synced</p>

          <div className="tap-entry-progress">
            <span style={{ width: `${passport.progress_percent}%` }}/>
          </div>

          <div className="tap-entry-stats">
            <div>
              <strong>{passport.lessons_completed}/{passport.lessons_total}</strong>
              <span>Mastered</span>
            </div>

            <div>
              <strong>{passport.streak_days}</strong>
              <span>Day streak</span>
            </div>
          </div>

          <div className="tap-entry-status">
            <CheckCircle2 size={15}/>
            Progress restored from your passport
          </div>
        </article>

      </div>


      <div className="tap-entry-footer">
        <div>
          <strong>One card. Any shared device.</strong>
          <span>
            Tap in to restore your learning state, continue a lesson and keep your progress connected.
          </span>
        </div>

        <div className="tap-entry-actions">
          <button className="button button-soft" onClick={onMindScan}>
            <BrainCircuit size={15}/> Run MindScan
          </button>

          <button className="text-link" onClick={onPassport}>
            View full passport <ArrowUpRight size={15}/>
          </button>
        </div>
      </div>

      <p className="tap-entry-note">
        Opening this card URL starts a learner session. It is a portable learning pass,
        not secure identity verification.
      </p>

    </section>
  )
}


// =============================================================================
// GROVE HOME
// =============================================================================

function GroveView({
  passport,
  nextModule,
  modules,
  onStart,
  onExplore,
  onMindScan,
  notice,
}: {
  passport: Passport
  nextModule: Module
  modules: Module[]
  onStart: (id: string, mode?: QuizMode) => void
  onExplore: () => void
  onMindScan: () => void
  notice: string
}) {
  return (
    <>
      <section className="grove-hero">

        <div className="forest-scene" aria-hidden="true">
          <iframe
            src="/landing-pages/taplearn-forest-scene.html"
            title="Procedural moss and forest learning world"
            loading="eager"
          />
        </div>

        <div className="forest-shade"/>

        <div className="hero-content">

          <div className="hero-copy">
            <div className="hero-eyebrow">
              <span/> A PERSONAL LEARNING WORLD
            </div>

            <h1>
              Let curiosity<br/>
              <em>take root.</em>
            </h1>

            <p>
              Learning that grows around you. Discover a concept, find what feels unclear,
              and build understanding one small step at a time.
            </p>

            <div className="hero-actions">
              <button
                className="button button-paper"
                onClick={() => onStart(nextModule.id)}
              >
                {nextModule.id === 'binary-trees-intro'
                  ? 'Start learning'
                  : 'Continue learning'}
                <ArrowUpRight size={17}/>
              </button>

              <button className="button button-ghost" onClick={onExplore}>
                Explore the grove <ArrowRight size={16}/>
              </button>
            </div>
          </div>


          <aside className="next-card">
            <div className="next-card-top">
              <span className="paper-kicker">YOUR NEXT STEP</span>
              <span className="tiny-ornament">✳</span>
            </div>

            <div className="next-icon"><TreePine size={22}/></div>

            <p className="paper-kicker">
              {nextModule.category.toUpperCase()}
            </p>

            <h2>{nextModule.title}<span>.</span></h2>
            <p>{nextModule.summary}</p>

            <div className="next-meta">
              <span><Clock3 size={13}/> {nextModule.duration}</span>
              <span>{nextModule.level}</span>
            </div>

            <button className="paper-link" onClick={() => onStart(nextModule.id)}>
              Open this lesson <ArrowUpRight size={15}/>
            </button>
          </aside>

        </div>


        <div className="hero-bottomline">
          <div className="hero-stat">
            <strong>
              {String(passport.lessons_completed).padStart(2, '0')}
              <small>/{String(passport.lessons_total).padStart(2, '0')}</small>
            </strong>
            <span>Lessons completed</span>
          </div>

          <div className="hero-stat">
            <strong>{passport.streak_days}<small> days</small></strong>
            <span>Learning streak</span>
          </div>

          <div className="hero-stat">
            <strong>{passport.progress_percent}<small>%</small></strong>
            <span>Grove explored</span>
          </div>

          <button className="hero-scroll" onClick={onExplore}>
            Discover your learning path <span>↓</span>
          </button>
        </div>

        <div className="hero-side-note">
          TAPLEARN / 001<br/>GROW AT YOUR OWN PACE
        </div>

      </section>


      <section className="learning-grove section-wrap">

        {notice && (
          <div className="notice-banner">
            <CheckCircle2 size={16}/>{notice}
          </div>
        )}

        <div className="section-intro">
          <div>
            <p className="eyebrow dark-eyebrow">YOUR CURRICULUM</p>
            <h2>
              A grove of ideas.<br/>
              <em>Room to grow.</em>
            </h2>
          </div>

          <p>
            Four small learning paths. Each one is designed to move from a clear explanation
            to a quick check that helps you see what you understand.
          </p>

          <button className="text-link" onClick={onExplore}>
            All lessons <ArrowUpRight size={16}/>
          </button>
        </div>


        <div className="module-grid home-module-grid">
          {modules.map((item, index) => (
            <ModuleCard
              key={item.id}
              module={item}
              progress={passport.lessons.find(
                row => row.lesson_id === item.id,
              )}
              index={index}
              onClick={() => onStart(item.id)}
            />
          ))}
        </div>


        <section className="mindscan-strip">
          <div className="mindscan-mark">
            <BrainCircuit size={29}/>
          </div>

          <div className="mindscan-copy">
            <p className="paper-kicker">A BETTER KIND OF CHECK-IN</p>
            <h3>Find the gap, <em>not just the grade.</em></h3>
            <p>
              MindScan uses focused questions to show which concept needs another look,
              then gives you a clear next step.
            </p>
          </div>

          <button className="button button-dark" onClick={onMindScan}>
            Try MindScan <ArrowRight size={16}/>
          </button>
        </section>

      </section>
    </>
  )
}


// =============================================================================
// COURSES
// =============================================================================

function CoursesView({
  passport,
  modules,
  query,
  onClearSearch,
  onStart,
}: {
  passport: Passport
  modules: Module[]
  query: string
  onClearSearch: () => void
  onStart: (id: string) => void
}) {
  const categories = [
    'All',
    'Data Structures',
    'Algorithms',
    'Computer Science',
  ]

  const [category, setCategory] = useState('All')

  const shown = modules.filter(
    item => category === 'All' || item.category === category,
  )

  return (
    <section className="inner-page section-wrap">

      <div className="inner-heading">
        <div>
          <p className="eyebrow dark-eyebrow">THE LEARNING GROVE</p>
          <h1>Choose what <em>to grow.</em></h1>
          <p>
            Explore a small collection of beginner-friendly lessons across core computing ideas.
          </p>
        </div>

        <div className="inner-heading-stat">
          <strong>
            {passport.lessons_completed}
            <small>/{passport.lessons_total}</small>
          </strong>
          <span>lessons completed</span>
        </div>
      </div>


      <div className="filter-row">
        {categories.map(item => (
          <button
            key={item}
            className={category === item ? 'filter-chip selected' : 'filter-chip'}
            onClick={() => setCategory(item)}
          >
            {item}
          </button>
        ))}

        {query && (
          <button className="clear-filter" onClick={onClearSearch}>
            Clear search “{query}” <X size={13}/>
          </button>
        )}
      </div>


      {shown.length ? (
        <div className="module-grid courses-grid">
          {shown.map((item, index) => (
            <ModuleCard
              key={item.id}
              module={item}
              progress={passport.lessons.find(
                row => row.lesson_id === item.id,
              )}
              index={index}
              onClick={() => onStart(item.id)}
            />
          ))}
        </div>
      ) : (
        <div className="empty-state">
          <Search size={25}/>
          <h3>No lessons found</h3>
          <p>Try another title or category.</p>

          <button
            className="button button-dark"
            onClick={() => {
              onClearSearch()
              setCategory('All')
            }}
          >
            Show all lessons
          </button>
        </div>
      )}

    </section>
  )
}


// =============================================================================
// MODULE CARD
// =============================================================================

function ModuleCard({
  module,
  progress,
  index,
  onClick,
}: {
  module: Module
  progress?: Passport['lessons'][number]
  index: number
  onClick: () => void
}) {
  const Icon =
    module.symbol === 'tree'
      ? TreePine
      : module.symbol === 'branch'
        ? Sprout
        : module.symbol === 'search'
          ? Target
          : Leaf

  return (
    <button
      className={`module-card module-card-${index + 1}`}
      onClick={onClick}
    >

      <div className="module-card-art">
        <div className="module-number">0{index + 1} / PATH</div>

        <div className="module-art-icon">
          <Icon size={36} strokeWidth={1.25}/>
        </div>

        <span className="module-art-line"/>
        <span className="module-art-dot"/>
      </div>


      <div className="module-card-body">

        <div className="module-card-meta">
          <span>{module.category}</span>

          <span>
            {progress?.completed
              ? 'COMPLETED'
              : progress?.score != null
                ? `LAST CHECK ${progress.score}%`
                : module.duration}
          </span>
        </div>

        <h3>{module.title}<span>.</span></h3>
        <p>{module.summary}</p>

        <div className="module-card-bottom">
          <span className="level-tag">{module.level}</span>

          <span className="module-open">
            {progress?.completed
              ? `Best ${progress.score ?? 0}%`
              : progress?.score != null
                ? 'Review lesson'
                : 'Explore lesson'}
            <ArrowUpRight size={15}/>
          </span>
        </div>

        <div className="module-progress">
          <span
            style={{
              width: progress?.completed
                ? '100%'
                : `${progress?.score ?? 0}%`,
            }}
          />
        </div>

      </div>

    </button>
  )
}


// =============================================================================
// LESSON PAGE
// =============================================================================

function LessonView({
  passportId,
  module,
  wrongAnswers,
  quizIndex,
  selectedAnswer,
  answered,
  score,
  saving,
  questions,
  result,
  error,
  onChoose,
  onNext,
  onRetry,
  onCourses,
}: {
  passportId: string
  module: Module
  wrongAnswers: WrongAnswer[]
  quizIndex: number
  selectedAnswer: number | null
  answered: boolean
  score: number
  saving: boolean
  questions: Question[]
  result: {
    score: number
    total: number
    percent: number
    moduleId: string
    mode: QuizMode
  } | null
  error: string
  onChoose: (index: number) => void
  onNext: () => void
  onRetry: () => void
  onCourses: () => void
}) {
  return (
    <section className="inner-page lesson-shell section-wrap">

      <button className="back-link" onClick={onCourses}>
        ← Back to lessons
      </button>

      <div className="lesson-title-row">
        <div>
          <p className="eyebrow dark-eyebrow">
            {module.category.toUpperCase()} / LEARNING PATH
          </p>

          <h1>{module.title}<em>.</em></h1>
          <p>{module.summary}</p>
        </div>

        <div className="lesson-duration">
          <Clock3 size={15}/>{module.duration} lesson
        </div>
      </div>


      <div className="lesson-grid">

        <article className="lesson-paper">
          <div className="lesson-paper-top">
            <span className="paper-kicker">THE BIG IDEA</span>
            <span className="lesson-leaf"><Leaf size={18}/></span>
          </div>

          <h2>Understand the <em>shape of the idea.</em></h2>
          <p className="lesson-body-copy">{module.lesson}</p>

          <LessonVisual module={module}/>

          <div className="concept-list">
            {module.concepts.map((concept, index) => (
              <div key={concept}>
                <span>0{index + 1}</span>
                <p>{concept}</p>
              </div>
            ))}
          </div>
        </article>


        <aside className="lesson-side-panel">
          <p className="paper-kicker">YOUR LEARNING PATH</p>

          <div className="lesson-step done">
            <span><Check size={13}/></span>
            <div>
              <strong>Meet the idea</strong>
              <small>Read the explanation</small>
            </div>
          </div>

          <div className="lesson-step current">
            <span>02</span>
            <div>
              <strong>Check understanding</strong>
              <small>Quick assessment</small>
            </div>
          </div>

          <div className="lesson-step">
            <span>03</span>
            <div>
              <strong>Repair the gap</strong>
              <small>Use the concept rescue</small>
            </div>
          </div>

          <div className="lesson-side-note">
            <Sparkles size={17}/>
            <strong>Learning that adapts</strong>
            <p>
              Your answers reveal which part of the idea deserves another look.
            </p>
          </div>
        </aside>

      </div>


      {result ? (
        <AssessmentResult
          passportId={passportId}
          result={result}
          module={module}
          wrongAnswers={wrongAnswers}
          onRetry={onRetry}
          onCourses={onCourses}
        />
      ) : (
        <QuizPanel
          mode="lesson"
          quizIndex={quizIndex}
          selectedAnswer={selectedAnswer}
          answered={answered}
          score={score}
          saving={saving}
          questions={questions}
          error={error}
          onChoose={onChoose}
          onNext={onNext}
        />
      )}

    </section>
  )
}


// =============================================================================
// MINDSCAN
// =============================================================================

function MindScanView({
  passport,
  modules,
  module,
  wrongAnswers,
  quizIndex,
  selectedAnswer,
  answered,
  score,
  saving,
  questions,
  result,
  error,
  onSelect,
  onStart,
  onChoose,
  onNext,
  onRetry,
  onCourses,
}: {
  passport: Passport
  modules: Module[]
  module: Module
  wrongAnswers: WrongAnswer[]
  quizIndex: number
  selectedAnswer: number | null
  answered: boolean
  score: number
  saving: boolean
  questions: Question[]
  result: {
    score: number
    total: number
    percent: number
    moduleId: string
    mode: QuizMode
  } | null
  error: string
  onSelect: (id: string) => void
  onStart: () => void
  onChoose: (index: number) => void
  onNext: () => void
  onRetry: () => void
  onCourses: () => void
}) {
  const [started, setStarted] = useState(false)

  return (
    <section className="inner-page mindscan-page section-wrap">

      <div className="mindscan-hero-panel">
        <div className="mindscan-orbit">
          <BrainCircuit size={42}/>
        </div>

        <div>
          <p className="eyebrow dark-eyebrow">
            MINDSCAN / CONCEPT CHECK
          </p>

          <h1>
            Find the gap.<br/>
            <em>Grow beyond it.</em>
          </h1>

          <p>
            MindScan is a short concept check, not a grade.
            It helps you see which idea needs another explanation.
          </p>
        </div>
      </div>


      {!started && !result ? (
        <div className="diagnostic-picker">
          <div>
            <p className="paper-kicker">CHOOSE A LEARNING PATH</p>
            <h2>What should we check?</h2>
            <p className="muted-copy">
              Pick a topic. We'll ask three focused questions and show you what to revisit.
            </p>
          </div>

          <div className="diagnostic-options">
            {modules.map(item => (
              <button
                key={item.id}
                className={
                  module.id === item.id
                    ? 'diagnostic-option selected'
                    : 'diagnostic-option'
                }
                onClick={() => onSelect(item.id)}
              >
                <span><BookOpen size={17}/></span>

                <div>
                  <strong>{item.title}</strong>
                  <small>{item.category}</small>
                </div>

                {module.id === item.id && <CheckCircle2 size={17}/>}
              </button>
            ))}
          </div>

          <button
            className="button button-dark"
            onClick={() => {
              onStart()
              setStarted(true)
            }}
          >
            Start MindScan <ArrowRight size={16}/>
          </button>
        </div>
      ) : result ? (
        <AssessmentResult
          passportId={passport.passport_id}
          result={result}
          module={module}
          wrongAnswers={wrongAnswers}
          onRetry={() => {
            onRetry()
            setStarted(false)
          }}
          onCourses={onCourses}
        />
      ) : (
        <div className="mindscan-test">
          <div className="mindscan-test-heading">
            <p className="paper-kicker">
              DIAGNOSTIC / {module.title.toUpperCase()}
            </p>

            <h2>Let's check what <em>you know.</em></h2>
          </div>

          <QuizPanel
            mode="mindscan"
            quizIndex={quizIndex}
            selectedAnswer={selectedAnswer}
            answered={answered}
            score={score}
            saving={saving}
            questions={questions}
            error={error}
            onChoose={onChoose}
            onNext={onNext}
          />
        </div>
      )}


      <div className="mindscan-footnote">
        <Lightbulb size={16}/>
        Your learning passport currently records {passport.lessons_completed} completed lessons
        and {passport.progress_percent}% overall progress.
      </div>

    </section>
  )
}


// =============================================================================
// QUIZ PANEL
// =============================================================================

function QuizPanel({
  mode,
  quizIndex,
  selectedAnswer,
  answered,
  score,
  saving,
  questions,
  error,
  onChoose,
  onNext,
}: {
  mode: QuizMode
  quizIndex: number
  selectedAnswer: number | null
  answered: boolean
  score: number
  saving: boolean
  questions: Question[]
  error: string
  onChoose: (index: number) => void
  onNext: () => void
}) {
  const question = questions[quizIndex]

  if (!question) {
    return <div className="inline-error">No questions are available for this lesson.</div>
  }

  return (
    <section className="quiz-panel">

      <div className="quiz-panel-top">
        <div>
          <p className="paper-kicker">
            {mode === 'mindscan'
              ? 'MINDSCAN / DIAGNOSTIC'
              : 'QUICK CHECK / REFLECTION'}
          </p>

          <h2>
            {mode === 'mindscan'
              ? 'A clearer picture starts here.'
              : 'Let’s see what took root.'}
          </h2>
        </div>

        <div className="quiz-counter">
          <strong>{String(quizIndex + 1).padStart(2, '0')}</strong>
          <span>/ {String(questions.length).padStart(2, '0')}</span>
        </div>
      </div>


      <div className="quiz-track">
        <span
          style={{
            width: `${
              ((quizIndex + (answered ? 1 : 0)) / questions.length) * 100
            }%`,
          }}
        />
      </div>


      <p className="question-copy">{question.question}</p>


      <div className="answer-list">
        {question.options.map((option, index) => (
          <button
            key={option}
            disabled={answered}
            onClick={() => onChoose(index)}
            className={`answer-row ${
              answered && index === question.answer ? 'is-correct' : ''
            } ${
              answered &&
              selectedAnswer === index &&
              index !== question.answer
                ? 'is-wrong'
                : ''
            }`}
          >
            <span className="answer-letter">
              {String.fromCharCode(65 + index)}
            </span>

            <span>{option}</span>

            {answered && index === question.answer && (
              <CheckCircle2 size={17}/>
            )}
          </button>
        ))}
      </div>


      {answered && (
        <div
          className={
            selectedAnswer === question.answer
              ? 'answer-explain good'
              : 'answer-explain'
          }
        >
          <strong>
            {selectedAnswer === question.answer
              ? 'That’s it.'
              : 'A useful thing to remember.'}
          </strong>

          <p>{question.explanation}</p>
        </div>
      )}


      {error && <p className="inline-error">{error}</p>}


      <div className="quiz-panel-bottom">
        <span>
          {answered
            ? `${score} correct so far`
            : 'Choose the answer that feels right.'}
        </span>

        <button
          className="button button-dark"
          disabled={!answered || saving}
          onClick={onNext}
        >
          {saving
            ? 'Saving…'
            : quizIndex === questions.length - 1
              ? 'Finish check-in'
              : 'Next question'}
          <ArrowRight size={15}/>
        </button>
      </div>

    </section>
  )
}


// =============================================================================
// ADAPTIVE QUESTION SELECTION
// =============================================================================

function selectAdaptiveQuestion(
  module: Module,
  wrongAnswers: WrongAnswer[],
  mode: QuizMode,
): Question {
  const bank =
    mode === 'mindscan'
      ? module.questions
      : module.diagnosticQuestions

  const missedText = wrongAnswers
    .map(item => `${item.question} ${item.chosen_answer}`)
    .join(' ')
    .toLowerCase()

  let index = 0

  if (module.id === 'tree-traversals') {
    if (/postorder|root.*last|last.*root/.test(missedText)) index = 2
    else if (/inorder|between|middle/.test(missedText)) index = 1
    else if (/preorder|root.*first|first.*root/.test(missedText)) index = 0
  } else if (module.id === 'binary-trees-intro') {
    if (/leaf|no children|without children/.test(missedText)) index = 2
    else if (/root|topmost/.test(missedText)) index = 1
    else if (/maximum|one child|two children|exactly two/.test(missedText)) index = 0
  } else if (module.id === 'binary-search-trees') {
    if (/inorder|ascending|sorted/.test(missedText)) index = 1
    else if (/balanced|skewed|efficient|slow/.test(missedText)) index = 2
    else if (/smaller|greater|larger|left|right/.test(missedText)) index = 0
  } else if (module.id === 'tree-applications') {
    if (/operator|expression/.test(missedText)) index = 1
    else if (/dom|html|document/.test(missedText)) index = 2
    else if (/folder|file system|hierarch/.test(missedText)) index = 0
  }

  return bank[Math.min(index, bank.length - 1)] ?? bank[0]
}


// =============================================================================
// TUTOR RESPONSE MARKDOWN
// =============================================================================

type TutorBlock = {
  title: string
  body: string
}

function parseTutorMarkdown(markdown: string): TutorBlock[] {
  const lines = markdown.replace(/\r\n/g, '\n').split('\n')
  const blocks: TutorBlock[] = []

  let currentTitle = 'AI EXPLANATION'
  let currentLines: string[] = []

  for (const line of lines) {
    const heading = line.trim().match(/^\*\*(.+?)\*\*\s*:?\s*$/)

    if (heading) {
      const body = currentLines.join('\n').trim()

      if (body) {
        blocks.push({
          title: currentTitle,
          body,
        })
      }

      currentTitle = heading[1].trim()
      currentLines = []
    } else {
      currentLines.push(line)
    }
  }

  const finalBody = currentLines.join('\n').trim()

  if (finalBody) {
    blocks.push({
      title: currentTitle,
      body: finalBody,
    })
  }

  return blocks.length
    ? blocks
    : [{ title: 'AI EXPLANATION', body: markdown.trim() }]
}

function TutorInlineText({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g)

  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          return (
            <strong key={index}>
              {part.slice(2, -2)}
            </strong>
          )
        }

        return part
      })}
    </>
  )
}

function TutorParagraphs({ text }: { text: string }) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map(paragraph => paragraph.trim())
    .filter(Boolean)

  return (
    <div className="ai-tutor-generated-body">
      {paragraphs.map((paragraph, index) => {
        const lines = paragraph.split('\n')

        return (
          <p key={index}>
            {lines.map((line, lineIndex) => (
              <span key={lineIndex}>
                <TutorInlineText
                  text={line.replace(/^\s*[-*]\s+/, '')}
                />
                {lineIndex < lines.length - 1 && <br/>}
              </span>
            ))}
          </p>
        )
      })}
    </div>
  )
}


// =============================================================================
// ASSESSMENT RESULT + GROQ TUTOR
// =============================================================================

function AssessmentResult({
  passportId,
  result,
  module,
  wrongAnswers,
  onRetry,
  onCourses,
}: {
  passportId: string
  result: {
    score: number
    total: number
    percent: number
    moduleId: string
    mode: QuizMode
  }
  module: Module
  wrongAnswers: WrongAnswer[]
  onRetry: () => void
  onCourses: () => void
}) {
  const good = result.percent >= 67

  const [tutor, setTutor] = useState<TutorResponse | null>(null)
  const [tutorLanguage, setTutorLanguage] = useState('English')
  const [tutorLoading, setTutorLoading] = useState(false)
  const [tutorError, setTutorError] = useState('')
  const [followUpChoice, setFollowUpChoice] = useState<number | null>(null)
  const [followUpChecked, setFollowUpChecked] = useState(false)
  const [followUpSaving, setFollowUpSaving] = useState(false)
  const [followUpError, setFollowUpError] = useState('')

  const adaptiveQuestion = useMemo(
    () => selectAdaptiveQuestion(module, wrongAnswers, result.mode),
    [module, wrongAnswers, result.mode],
  )


  async function checkFollowUp() {
    if (
      followUpChoice === null ||
      followUpChecked ||
      followUpSaving
    ) return

    setFollowUpSaving(true)
    setFollowUpError('')

    try {
      const followUpScore =
        followUpChoice === adaptiveQuestion.answer ? 100 : 0

      await saveDiagnostic(
        passportId,
        module.id,
        followUpScore,
      )

      setFollowUpChecked(true)
    } catch (error) {
      setFollowUpError(
        error instanceof Error
          ? error.message
          : 'Could not save this re-check.',
      )
    } finally {
      setFollowUpSaving(false)
    }
  }


  async function askTutor() {
    setTutorLoading(true)
    setTutorError('')

    try {
      const reply = await getTutorFeedback({
        lesson_id: module.id,
        lesson_title: module.title,
        lesson_text: module.lesson,
        concepts: module.concepts,
        score: result.percent,
        total: result.total,
        missed_questions: wrongAnswers,
        language: tutorLanguage,
      })

      setTutor(reply)
    } catch (error) {
      setTutorError(
        error instanceof Error
          ? error.message
          : 'The tutor request could not be completed.',
      )
    } finally {
      setTutorLoading(false)
    }
  }


  return (
    <section className="result-panel">

      <div className="result-seal">
        {good ? <Award size={27}/> : <Sprout size={27}/>}
      </div>

      <div>
        <p className="paper-kicker">
          {result.mode === 'mindscan'
            ? 'MINDSCAN COMPLETE'
            : 'CHECK-IN COMPLETE'}
        </p>

        <h2>
          {good
            ? 'A strong new root.'
            : 'Every insight helps you grow.'}
        </h2>

        <p className="result-score">
          {result.score} / {result.total} correct
          <span> · </span>
          {result.percent}%
        </p>


        <div className="concept-rescue">
          <strong>
            <Lightbulb size={16}/> Concept rescue
          </strong>
          <p>{module.rescue}</p>
        </div>


        <div className="ai-tutor-card">

          <div className="ai-tutor-heading">
            <span className="ai-tutor-mark">
              <Sparkles size={16}/>
            </span>

            <div>
              <strong>Your adaptive learning plan</strong>
              <small>
                Groq-powered adaptive tutor · {wrongAnswers.length} missed{' '}
                {wrongAnswers.length === 1 ? 'question' : 'questions'}
              </small>
            </div>
          </div>


          <div className="ai-language-control">
            <label htmlFor="ai-tutor-language">Explain in</label>

            <select
              id="ai-tutor-language"
              value={tutorLanguage}
              disabled={tutorLoading}
              onChange={event => {
                setTutorLanguage(event.target.value)
                setTutor(null)
                setTutorError('')
              }}
            >
              <option value="English">English</option>
              <option value="Kannada">ಕನ್ನಡ · Kannada</option>
              <option value="Hindi">हिन्दी · Hindi</option>
              <option value="Tamil">தமிழ் · Tamil</option>
              <option value="Telugu">తెలుగు · Telugu</option>
            </select>

            <small>
              The AI explanation changes language. The lesson and quiz are currently in English.
            </small>
          </div>


          {!tutor && (
            <p className="ai-tutor-intro">
              Get a second explanation shaped around the answers you missed,
              using the lesson content as its source.
            </p>
          )}


          {tutor && (() => {
            const structuredTutor = tutor as TutorResponse & {
              sections?: {
                diagnosis?: string
                explanation?: string
                analogy?: string
              } | null
              verified_reference?: string[]
            }

            const sections = structuredTutor.sections

            return (
              <div className="ai-tutor-response">

                <span
                  className={
                    tutor.available
                      ? 'ai-state online'
                      : 'ai-state offline'
                  }
                >
                  {tutor.available
                    ? `AI CONNECTED · ${tutor.model}`
                    : 'CURATED FALLBACK · AI OFFLINE'}
                </span>


                {sections?.diagnosis ||
                sections?.explanation ||
                sections?.analogy ? (
                  <div className="ai-tutor-sections">

                    {sections.diagnosis && (
                      <article className="ai-tutor-section diagnosis">
                        <span>01 / WHAT WENT WRONG</span>
                        <h4>Your learning gap</h4>
                        <p>{sections.diagnosis}</p>
                      </article>
                    )}

                    {sections.explanation && (
                      <article className="ai-tutor-section explanation">
                        <span>02 / UNDERSTAND THE CONCEPT</span>
                        <h4>Let's make it simple</h4>
                        <p>{sections.explanation}</p>
                      </article>
                    )}

                    {sections.analogy && (
                      <article className="ai-tutor-section analogy">
                        <span>03 / REMEMBER IT</span>
                        <h4>A simple way to remember</h4>
                        <p>{sections.analogy}</p>
                      </article>
                    )}

                  </div>
                ) : (
                  <div className="ai-tutor-generated-grid">
                    {parseTutorMarkdown(tutor.explanation).map(
                      (block, index) => (
                        <article
                          className="ai-tutor-generated-section"
                          key={`${index}-${block.title}`}
                        >
                          <span>
                            {String(index + 1).padStart(2, '0')} / TUTOR INSIGHT
                          </span>

                          <h4>{block.title}</h4>
                          <TutorParagraphs text={block.body}/>
                        </article>
                      ),
                    )}
                  </div>
                )}


                {structuredTutor.verified_reference?.length ? (
                  <details className="ai-verified-facts">
                    <summary>View verified lesson facts</summary>
                    <ul>
                      {structuredTutor.verified_reference.map(
                        (fact, index) => (
                          <li key={`${index}-${fact}`}>{fact}</li>
                        ),
                      )}
                    </ul>
                  </details>
                ) : null}


                {tutor.detail && (
                  <small>Connection detail: {tutor.detail}</small>
                )}

              </div>
            )
          })()}


          {tutorError && <p className="inline-error">{tutorError}</p>}


          {tutor && (
            <section
              className="adaptive-followup"
              aria-label="Adaptive understanding check"
            >
              <div className="adaptive-followup-kicker">
                04 / CHECK WHAT STUCK
              </div>

              <h4>
                A quick re-check, chosen for your learning gap
              </h4>

              <p className="adaptive-followup-question">
                {adaptiveQuestion.question}
              </p>

              <div className="adaptive-followup-options">
                {adaptiveQuestion.options.map((option, index) => (
                  <button
                    key={`${index}-${option}`}
                    type="button"
                    disabled={followUpChecked || followUpSaving}
                    className={[
                      'adaptive-followup-option',
                      followUpChoice === index ? 'selected' : '',
                      followUpChecked &&
                      index === adaptiveQuestion.answer
                        ? 'correct'
                        : '',
                      followUpChecked &&
                      followUpChoice === index &&
                      index !== adaptiveQuestion.answer
                        ? 'incorrect'
                        : '',
                    ].filter(Boolean).join(' ')}
                    onClick={() => setFollowUpChoice(index)}
                  >
                    <span>{String.fromCharCode(65 + index)}</span>
                    {option}
                  </button>
                ))}
              </div>


              {followUpChecked && (
                <div
                  className={
                    followUpChoice === adaptiveQuestion.answer
                      ? 'adaptive-followup-feedback correct'
                      : 'adaptive-followup-feedback'
                  }
                >
                  <strong>
                    {followUpChoice === adaptiveQuestion.answer
                      ? 'That concept is getting stronger.'
                      : 'Let’s revisit this idea once more.'}
                  </strong>

                  <p>{adaptiveQuestion.explanation}</p>
                </div>
              )}


              {followUpError && (
                <p className="inline-error">{followUpError}</p>
              )}


              <button
                type="button"
                className="button button-dark adaptive-followup-submit"
                disabled={
                  followUpChoice === null ||
                  followUpChecked ||
                  followUpSaving
                }
                onClick={() => void checkFollowUp()}
              >
                {followUpSaving
                  ? 'Saving re-check…'
                  : followUpChecked
                    ? 'Re-check saved'
                    : 'Check my understanding'}
                <ArrowRight size={15}/>
              </button>

              <small className="adaptive-followup-note">
                This question is selected from TAPLEARN’s verified question bank.
                Your result is stored separately from lesson completion.
              </small>
            </section>
          )}


          <button
            className="button button-dark"
            onClick={() => void askTutor()}
            disabled={tutorLoading}
          >
            {tutorLoading
              ? 'Thinking…'
              : tutor
                ? 'Regenerate learning plan'
                : 'Ask the AI tutor'}
            <Sparkles size={15}/>
          </button>

        </div>


        <div className="result-actions">
          <button className="button button-dark" onClick={onRetry}>
            Try again <ArrowRight size={15}/>
          </button>

          <button className="text-link" onClick={onCourses}>
            Explore another lesson <ArrowUpRight size={15}/>
          </button>
        </div>

      </div>
    </section>
  )
}


// =============================================================================
// PASSPORT
// =============================================================================

function PassportView({
  passport,
  copyState,
  onCopy,
  onCourses,
  onResume,
}: {
  passport: Passport
  copyState: string
  onCopy: () => void
  onCourses: () => void
  onResume: () => void
}) {
  return (
    <section className="inner-page passport-page section-wrap">

      <div className="inner-heading">
        <div>
          <p className="eyebrow dark-eyebrow">
            YOUR LEARNING IDENTITY
          </p>

          <h1>
            One tap.<br/>
            <em>Your journey.</em>
          </h1>

          <p>
            Your passport carries your learning state between shared classroom devices,
            without an account or password.
          </p>
        </div>

        <div className="inner-heading-stat">
          <Nfc size={26}/>
          <span>NFC READY</span>
        </div>
      </div>


      <div className="passport-layout">

        <article className="passport-showcase">
          <div className="passport-topline">
            <span>TAPLEARN / LEARNING PASSPORT</span>
            <Nfc size={22}/>
          </div>

          <div className="passport-name">
            {passport.display_name}
            <small>CURIOUS LEARNER</small>
          </div>

          <div className="passport-chip">
            <div className="chip-circuit"/>
            <span>TL</span>
          </div>

          <div className="passport-id">
            PASSPORT ID <strong>{passport.passport_id}</strong>
          </div>

          <div className="passport-bottomline">
            <span>LEARNING, IN MOTION</span>
            <span>001 / 001</span>
          </div>
        </article>


        <article className="passport-instructions">
          <p className="paper-kicker">PROGRAM YOUR CARD</p>

          <h2>Your learning follows <em>you.</em></h2>

          <p>
            Use your card as a portable classroom pass. Each tap starts a Tap-In session,
            restores the learner profile and records that a learning session began.
            After public HTTPS deployment, write this URL to the card.
          </p>

          <div className="passport-url">
            <span>
              {`${window.location.origin}/tap/${passport.passport_id}`}
            </span>
            <button onClick={onCopy}>{copyState}</button>
          </div>

          <ol>
            <li>Open NFC Tools on your phone.</li>
            <li>Choose Write → Add a URL record.</li>
            <li>Paste the passport URL and write it to the card.</li>
            <li>
              Tap the card on a shared phone or classroom device to restore the learner session.
            </li>
          </ol>

          <p className="privacy-note">
            <CheckCircle2 size={15}/>
            The card stores a link only. It is not a secure login credential.
          </p>

          <div className="passport-actions">
            <button className="button button-dark" onClick={onResume}>
              Resume learning <ArrowRight size={15}/>
            </button>

            <button className="text-link" onClick={onCourses}>
              Browse lessons <ArrowUpRight size={15}/>
            </button>
          </div>
        </article>

      </div>


      <div className="passport-stats">
        <div>
          <strong>{passport.lessons_completed}/{passport.lessons_total}</strong>
          <span>Lessons completed</span>
        </div>

        <div>
          <strong>{passport.progress_percent}%</strong>
          <span>Overall progress</span>
        </div>

        <div>
          <strong>{passport.streak_days} days</strong>
          <span>Current streak</span>
        </div>
      </div>

    </section>
  )
}


// =============================================================================
// STUDY ROOMS + QR SHARING
// =============================================================================

const REPOSITORY_URL = (
  import.meta.env.VITE_GITHUB_REPO_URL || ''
).trim()

const ROOM_SESSION_KEY = 'taplearn:active-study-room:v1'

function loadSavedRoomSession(): StudyRoomSession | null {
  try {
    const raw = sessionStorage.getItem(ROOM_SESSION_KEY)
    return raw ? JSON.parse(raw) as StudyRoomSession : null
  } catch {
    return null
  }
}

function saveRoomSession(session: StudyRoomSession | null) {
  try {
    if (session) {
      sessionStorage.setItem(
        ROOM_SESSION_KEY,
        JSON.stringify(session),
      )
    } else {
      sessionStorage.removeItem(ROOM_SESSION_KEY)
    }
  } catch {
    // The active room can still work without session storage.
  }
}


function RoomsView({
  learnerName,
  lessons,
  onStartLesson,
}: {
  learnerName: string
  lessons: Array<{ id: string; title: string }>
  onStartLesson: (lessonId: string) => void
}) {
  const initialCode = useMemo(
    () => new URLSearchParams(window.location.search)
      .get('room')
      ?.toUpperCase() || '',
    [],
  )

  const [displayName, setDisplayName] = useState(
    learnerName || 'Learner',
  )

  const [roomTitle, setRoomTitle] = useState(
    'TAPLEARN Study Room',
  )

  const [lessonId, setLessonId] = useState(
    lessons[0]?.id || 'binary-trees-intro',
  )

  const [joinCode, setJoinCode] = useState(initialCode)

  const [session, setSession] = useState<StudyRoomSession | null>(() => {
    const saved = loadSavedRoomSession()

    if (initialCode && saved?.room.room_code !== initialCode) {
      return null
    }

    return saved
  })

  const [room, setRoom] = useState<StudyRoom | null>(() => {
    const saved = loadSavedRoomSession()

    if (initialCode && saved?.room.room_code !== initialCode) {
      return null
    }

    return saved?.room ?? null
  })

  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [copied, setCopied] = useState(false)

  const [loadingRoom, setLoadingRoom] = useState(false)

  const inviteUrl = room
    ? `${window.location.origin}/?room=${encodeURIComponent(room.room_code)}`
    : ''


  // Load public room details when opening an invitation QR.
  useEffect(() => {
    if (!initialCode || session) return

    let active = true
    setLoadingRoom(true)

    const loadRoom = async () => {
      try {
        const response = await fetch(
          `${import.meta.env.VITE_API_BASE_URL || ''}/api/rooms/${encodeURIComponent(initialCode)}`,
        )

        if (!response.ok) {
          throw new Error('This room is no longer active.')
        }

        await response.json()

        if (active) {
          setJoinCode(initialCode)
          setMessage('Room invitation found. Enter your display name to join.')
        }
      } catch (err) {
        if (active) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load this room.',
          )
        }
      } finally {
        if (active) setLoadingRoom(false)
      }
    }

    void loadRoom()

    return () => {
      active = false
    }
  }, [initialCode, session])


  // Heartbeat keeps the participant visible in the active room.
  useEffect(() => {
    if (!session?.member_token || !session.room?.room_code) return

    let active = true

    const refresh = async () => {
      try {
        const updated = await heartbeatStudyRoom(
          session.room.room_code,
          session.member_token,
        )

        if (active) setRoom(updated)
      } catch {
        if (active) {
          setMessage(
            'Room connection paused. Try refreshing or joining again.',
          )
        }
      }
    }

    void refresh()

    const timer = window.setInterval(
      () => void refresh(),
      10000,
    )

    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [session?.member_token, session?.room?.room_code])


  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!displayName.trim()) return

    setBusy(true)
    setError('')
    setMessage('')

    try {
      const created = await createStudyRoom({
        host_name: displayName.trim(),
        lesson_id: lessonId,
        title: roomTitle.trim() || 'TAPLEARN Study Room',
      })

      setSession(created)
      saveRoomSession(created)
      setRoom(created.room)
      setJoinCode(created.room.room_code)

      // Remove the old invitation query after successful creation.
      window.history.replaceState(
        { view: 'rooms' },
        '',
        '/?view=rooms',
      )

      setMessage(
        'Your room is live. Share its QR code or six-character invite code.',
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not create the room.',
      )
    } finally {
      setBusy(false)
    }
  }


  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!joinCode.trim() || !displayName.trim()) return

    setBusy(true)
    setError('')
    setMessage('')

    try {
      const joined = await joinStudyRoom(
        joinCode.trim().toUpperCase(),
        { display_name: displayName.trim() },
      )

      setSession(joined)
      saveRoomSession(joined)
      setRoom(joined.room)
      setJoinCode(joined.room.room_code)

      window.history.replaceState(
        { view: 'rooms' },
        '',
        `/?room=${encodeURIComponent(joined.room.room_code)}`,
      )

      setMessage(
        `You're in ${joined.room.title}. Welcome to the room.`,
      )
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Could not join this room.',
      )
    } finally {
      setBusy(false)
    }
  }


  async function copyInvite() {
    if (!inviteUrl) return

    try {
      await navigator.clipboard.writeText(inviteUrl)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1800)
    } catch {
      setError(
        'Clipboard was blocked. Copy the invitation URL manually.',
      )
    }
  }


  async function handleLeave() {
    if (!session || !room) return

    setBusy(true)

    try {
      await leaveStudyRoom(
        room.room_code,
        session.member_token,
      )
    } catch {
      // Clear the local session even if the server is unavailable.
    }

    setSession(null)
    setRoom(null)
    saveRoomSession(null)

    window.history.replaceState(
      { view: 'rooms' },
      '',
      '/?view=rooms',
    )

    setMessage('You left the study room.')
    setBusy(false)
  }


  return (
    <section className="rooms-page section-wrap">

      <header className="rooms-heading">
        <div>
          <p className="eyebrow dark-eyebrow">
            TAPLEARN / OPEN STUDY
          </p>

          <h1>
            Learn together.<br/>
            <em>Grow together.</em>
          </h1>

          <p>
            Create a study room around a lesson, then invite classmates
            with a code or QR link.
          </p>
        </div>

        <div className="rooms-heading-mark">
          <Users size={32}/>
          <span>ROOMS / 01</span>
        </div>
      </header>


      <div className="rooms-name-field">
        <label htmlFor="room-display-name">
          Your display name
        </label>

        <input
          id="room-display-name"
          value={displayName}
          maxLength={60}
          onChange={event => setDisplayName(event.target.value)}
          placeholder="Enter your name"
        />
      </div>


      {error && (
        <div className="rooms-alert error">
          <X size={16}/> {error}
        </div>
      )}

      {message && (
        <div className="rooms-alert success">
          <Check size={16}/> {message}
        </div>
      )}


      {loadingRoom && (
        <div className="rooms-alert">
          Loading room invitation…
        </div>
      )}


      {room && session ? (
        <div className="room-live-layout">

          <article className="room-live-card">

            <div className="room-live-topline">
              <span className="room-live-dot"/>
              LIVE STUDY ROOM

              <button
                type="button"
                className="room-leave"
                onClick={() => void handleLeave()}
                disabled={busy}
              >
                Leave <X size={14}/>
              </button>
            </div>

            <p className="paper-kicker">{room.title}</p>

            <div className="room-code-large">
              {room.room_code}
            </div>

            <p className="room-topic">
              <BookOpen size={15}/>
              {lessons.find(item => item.id === room.lesson_id)?.title || room.lesson_id}
            </p>


            <div className="room-live-stats">
              <div>
                <strong>{room.member_count}</strong>
                <span>online now</span>
              </div>

              <div>
                <strong>{room.max_members}</strong>
                <span>room capacity</span>
              </div>

              <div>
                <strong>2 hrs</strong>
                <span>room lifetime</span>
              </div>
            </div>


            <button
              className="button button-dark room-start-button"
              onClick={() => onStartLesson(room.lesson_id)}
            >
              Open shared lesson <ArrowRight size={15}/>
            </button>

          </article>


          <aside className="room-invite-card">
            <p className="paper-kicker">
              INVITE YOUR CLASSMATES
            </p>

            <div className="room-qr-frame">
              <QRCodeSVG
                value={inviteUrl}
                size={184}
                level="H"
                includeMargin
              />
            </div>

            <button
              type="button"
              className="room-copy-button"
              onClick={() => void copyInvite()}
            >
              {copied ? <Check size={15}/> : <Copy size={15}/>}
              {copied ? 'Invite copied' : 'Copy invite link'}
            </button>

            <p className="room-invite-hint">
              Scan the QR or enter <strong>{room.room_code}</strong> in Join a room.
            </p>
          </aside>


          <article className="room-members-card">

            <div className="room-members-heading">
              <div>
                <p className="paper-kicker">THE STUDY GROUP</p>
                <h3>Who's here?</h3>
              </div>

              <span>{room.member_count} ACTIVE</span>
            </div>


            <div className="room-member-list">
              {room.members.map((member, index) => (
                <div
                  className="room-member-row"
                  key={`${member.display_name}-${member.role}-${index}`}
                >
                  <span className="room-member-avatar">
                    {member.display_name.slice(0, 1).toUpperCase()}
                  </span>

                  <div>
                    <strong>{member.display_name}</strong>
                    <small>
                      {member.role === 'host'
                        ? 'Room host'
                        : 'Learner'}
                    </small>
                  </div>

                  {member.role === 'host' && (
                    <span className="room-host-tag">HOST</span>
                  )}
                </div>
              ))}

              {!room.member_count && (
                <p className="room-invite-hint">
                  Waiting for classmates to join…
                </p>
              )}
            </div>


            <p className="room-live-footnote">
              <Radio size={13}/>
              Participant list refreshes every ten seconds.
            </p>

          </article>

        </div>
      ) : (
        <div className="rooms-actions-grid">

          <form
            className="room-create-card"
            onSubmit={handleCreate}
          >
            <div className="room-card-icon">
              <Users size={21}/>
            </div>

            <p className="paper-kicker">HOST A SESSION</p>
            <h2>Create a <em>study room.</em></h2>

            <label htmlFor="room-title">Room name</label>

            <input
              id="room-title"
              value={roomTitle}
              onChange={event => setRoomTitle(event.target.value)}
              maxLength={80}
            />

            <label htmlFor="room-lesson">Shared lesson</label>

            <select
              id="room-lesson"
              value={lessonId}
              onChange={event => setLessonId(event.target.value)}
            >
              {lessons.map(lesson => (
                <option key={lesson.id} value={lesson.id}>
                  {lesson.title}
                </option>
              ))}
            </select>

            <button
              className="button button-dark"
              disabled={busy || !displayName.trim()}
            >
              {busy ? 'Creating…' : 'Create room'}
              <ArrowRight size={15}/>
            </button>
          </form>


          <form
            className="room-join-card"
            onSubmit={handleJoin}
          >
            <div className="room-card-icon">
              <Link2 size={21}/>
            </div>

            <p className="paper-kicker">
              JOIN YOUR CLASSMATES
            </p>

            <h2>
              Already have a <em>room code?</em>
            </h2>

            <label htmlFor="room-code">
              Six-character invite code
            </label>

            <input
              id="room-code"
              value={joinCode}
              onChange={event =>
                setJoinCode(
                  event.target.value
                    .toUpperCase()
                    .replace(/[^A-Z0-9]/g, '')
                    .slice(0, 6),
                )
              }
              maxLength={6}
              placeholder="e.g. 4K8P2D"
              autoComplete="off"
            />

            <p className="room-join-note">
              Scan a room QR code and TAPLEARN will fill in the invite code.
            </p>

            <button
              className="button button-outline"
              disabled={
                busy ||
                joinCode.trim().length !== 6 ||
                !displayName.trim()
              }
            >
              {busy ? 'Joining…' : 'Join room'}
              <ArrowRight size={15}/>
            </button>
          </form>

        </div>
      )}


      {/* PUBLIC SOURCE CODE QR */}

      <section className="open-source-share-card">

        <div className="open-source-copy">
          <p className="paper-kicker">BUILT IN THE OPEN</p>
          <h2>Explore the <em>source.</em></h2>

          <p>
            Scan the code to visit TAPLEARN's public repository,
            inspect the implementation and contribute improvements.
          </p>

          {REPOSITORY_URL ? (
            <a
              href={REPOSITORY_URL}
              target="_blank"
              rel="noreferrer"
              className="open-source-link"
            >
              Open GitHub repository <ExternalLink size={14}/>
            </a>
          ) : (
            <span className="open-source-pending">
              Add VITE_GITHUB_REPO_URL after publishing the public repository.
            </span>
          )}
        </div>


        <div className="open-source-qr">

          {REPOSITORY_URL ? (
            <QRCodeSVG
              value={REPOSITORY_URL}
              size={148}
              level="H"
              includeMargin
            />
          ) : (
            <div className="open-source-qr-empty">
              <Github size={34}/>
              <span>
                Repository QR<br/>
                available after GitHub push
              </span>
            </div>
          )}

          <span>OPEN-SOURCE QR</span>

        </div>

      </section>

    </section>
  )
}


// =============================================================================
// LESSON DIAGRAMS
// =============================================================================

function LessonVisual({ module }: { module: Module }) {

  if (module.id === 'tree-traversals') {
    return (
      <div className="lesson-visual-card">
        <p className="paper-kicker">
          FOUR WAYS TO WALK THE SAME TREE
        </p>

        <div className="traversal-grid">
          <div>
            <strong>PREORDER</strong>
            <span>8 → 4 → 2 → 6 → 12 → 10 → 14</span>
            <small>Root comes first</small>
          </div>

          <div>
            <strong>INORDER</strong>
            <span>2 → 4 → 6 → 8 → 10 → 12 → 14</span>
            <small>Root sits in the middle</small>
          </div>

          <div>
            <strong>POSTORDER</strong>
            <span>2 → 6 → 4 → 10 → 14 → 12 → 8</span>
            <small>Root comes last</small>
          </div>

          <div>
            <strong>LEVEL-ORDER</strong>
            <span>8 → 4 → 12 → 2 → 6 → 10 → 14</span>
            <small>Visit one level at a time</small>
          </div>
        </div>

        <TreeDiagram/>
      </div>
    )
  }


  if (module.id === 'binary-search-trees') {
    return (
      <div className="lesson-visual-card">
        <p className="paper-kicker">FOLLOW THE ORDER RULE</p>

        <svg
          className="bst-diagram"
          viewBox="0 0 520 245"
          role="img"
          aria-label="Binary search tree"
        >
          <g className="branch-lines">
            <path d="M260 42 L130 112 M260 42 L390 112 M130 112 L65 190 M130 112 L195 190 M390 112 L455 190"/>
          </g>

          <g className="bst-node root">
            <circle cx="260" cy="42" r="25"/>
            <text x="260" y="48">8</text>
          </g>

          <g className="bst-node">
            <circle cx="130" cy="112" r="22"/>
            <text x="130" y="118">4</text>
            <circle cx="390" cy="112" r="22"/>
            <text x="390" y="118">12</text>
          </g>

          <g className="bst-node leaf">
            <circle cx="65" cy="190" r="18"/>
            <text x="65" y="196">2</text>
            <circle cx="195" cy="190" r="18"/>
            <text x="195" y="196">6</text>
            <circle cx="455" cy="190" r="18"/>
            <text x="455" y="196">14</text>
          </g>
        </svg>

        <div className="bst-rules">
          <span>← Smaller values</span>
          <span>Larger values →</span>
        </div>
      </div>
    )
  }


  if (module.id === 'tree-applications') {
    return (
      <div className="application-visual">
        <p className="paper-kicker">
          TREES IN EVERYDAY SOFTWARE
        </p>

        <div className="application-examples">
          <div>
            <Folder size={25}/>
            <strong>File systems</strong>
            <small>Folders contain folders and files.</small>
          </div>

          <div>
            <Code size={25}/>
            <strong>HTML / DOM</strong>
            <small>Elements form a nested document.</small>
          </div>

          <div>
            <GitBranch size={25}/>
            <strong>Expressions</strong>
            <small>Operators connect values.</small>
          </div>
        </div>
      </div>
    )
  }

  return <TreeDiagram/>
}


function TreeDiagram() {
  return (
    <div className="tree-visual">
      <svg
        viewBox="0 0 520 230"
        role="img"
        aria-label="Binary tree with root 8 and child nodes"
      >
        <g className="branch-lines">
          <path d="M260 40 L130 112 M260 40 L390 112 M130 112 L65 188 M130 112 L195 188 M390 112 L325 188 M390 112 L455 188"/>
        </g>

        <g className="root-circle">
          <circle cx="260" cy="38" r="25"/>
          <text x="260" y="44">8</text>
        </g>

        <g className="parent-circle">
          <circle cx="130" cy="112" r="22"/>
          <text x="130" y="118">4</text>

          <circle cx="390" cy="112" r="22"/>
          <text x="390" y="118">12</text>
        </g>

        <g className="leaf-circle">
          <circle cx="65" cy="188" r="18"/>
          <text x="65" y="193">2</text>

          <circle cx="195" cy="188" r="18"/>
          <text x="195" y="193">6</text>

          <circle cx="325" cy="188" r="18"/>
          <text x="325" y="193">10</text>

          <circle cx="455" cy="188" r="18"/>
          <text x="455" y="193">14</text>
        </g>
      </svg>

      <div className="tree-caption">
        <span><i className="root-dot"/> Root</span>
        <span><i className="parent-dot"/> Parent</span>
        <span><i className="leaf-dot"/> Leaf</span>
      </div>
    </div>
  )
}
