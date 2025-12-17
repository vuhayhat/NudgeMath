import express from 'express'
import session from 'express-session'
import connectPgSimple from 'connect-pg-simple'
import dotenv from 'dotenv'
import path from 'path'
import fs from 'fs'
import multer from 'multer'
import https from 'https'
import http from 'http'
import PDFDocument from 'pdfkit'
import { fileURLToPath } from 'url'
import { pool, ensureSchema } from './db.js'
import bcrypt from 'bcryptjs'

dotenv.config()

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()

app.set('view engine', 'ejs')
app.set('views', path.join(__dirname, '..', 'views'))

app.use(express.urlencoded({ extended: true }))
app.use(express.static(path.join(__dirname, '..', 'public')))

const uploadDir = path.join(__dirname, '..', (process.env.UPLOAD_DIR || 'uploads'))
fs.mkdirSync(uploadDir, { recursive: true })
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname)
    const base = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '') || 'img'
    const name = `${Date.now()}-${Math.random().toString(36).slice(2,8)}-${base}${ext}`
    cb(null, name)
  }
})
const upload = multer({ storage })
app.use('/uploads', express.static(uploadDir))

const PgSession = connectPgSimple(session)

const usePg = !!pool
const store = usePg
  ? new PgSession({ pool, tableName: 'session', createTableIfMissing: true })
  : undefined

app.use(
  session({
    secret: process.env.SESSION_SECRET || process.env.JWT_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    store
  })
)

app.get('/', (req, res) => {
  res.render('home')
})

app.get('/student', (req, res) => {
  const error = req.query.error
  res.render('student', { error })
})

app.get('/admin', (req, res) => {
  res.render('admin_dashboard', { name: 'Giáo viên' })
})

app.post('/student/login', async (req, res) => {
  if (!usePg) return res.redirect('/student?error=Database%20chưa%20cấu%20hình')
  const { username, password } = req.body
  const { rows } = await pool.query('SELECT * FROM students WHERE username=$1', [username])
  const student = rows[0]
  if (!student) return res.redirect('/student?error=Sai%20username%20hoặc%20mật%20khẩu')
  const ok = await bcrypt.compare(password, student.password_hash)
  if (!ok) return res.redirect('/student?error=Sai%20username%20hoặc%20mật%20khẩu')
  req.session.studentId = student.id
  req.session.studentName = student.name || 'Học sinh'
  res.redirect('/student/dashboard')
})

function requireStudent(req, res, next) {
  if (req.session && req.session.studentId) return next()
  res.redirect('/student?error=Bạn%20cần%20đăng%20nhập')
}

app.get('/student/dashboard', requireStudent, async (req, res) => {
  if (!usePg) return res.render('student_dashboard', { name: req.session.studentName, stats: null, topics: [] })
  const sid = req.session.studentId
  const totalsQ = await pool.query('SELECT COUNT(*)::int AS total, SUM(CASE WHEN is_correct THEN 1 ELSE 0 END)::int AS correct, SUM(CASE WHEN autograded THEN 1 ELSE 0 END)::int AS autograded FROM submissions WHERE student_id=$1', [sid])
  const totals = totalsQ.rows[0] || { total: 0, correct: 0, autograded: 0 }
  const acc = totals.total ? Math.round((totals.correct / totals.total) * 100) : 0
  const stuQ = await pool.query('SELECT streak, stars, class_id FROM students WHERE id=$1', [sid])
  const stu = stuQ.rows[0] || { streak: 0, stars: 0, class_id: null }
  const topicsQ = await pool.query(`
    SELECT COALESCE(e.topic, 'khác') AS topic,
           COUNT(*)::int AS total,
           SUM(CASE WHEN s.is_correct THEN 1 ELSE 0 END)::int AS correct
    FROM submissions s JOIN exercises e ON e.id=s.exercise_id
    WHERE s.student_id=$1
    GROUP BY COALESCE(e.topic, 'khác')
    ORDER BY total DESC
  `, [sid])
  const topics = topicsQ.rows
  const unreadQ = await pool.query('SELECT COUNT(*)::int AS cnt FROM messages WHERE (student_id=$1 OR class_id=$2) AND is_read=FALSE', [sid, stu.class_id || null])
  const unread = unreadQ.rows[0]?.cnt || 0
  const stats = { total: totals.total, correct: totals.correct, accuracy: acc, autograded: totals.autograded, streak: stu.streak, stars: stu.stars }
  res.render('student_dashboard', { name: req.session.studentName, stats, topics, unread })
})

app.get('/student/habits', requireStudent, async (req, res) => {
  if (!usePg) return res.render('student_habits', { rows: [], stickers: [], streak: 0, stars: 0 })
  const sid = req.session.studentId
  const subsQ = await pool.query('SELECT submitted_at, nudge, sticker, stars, streak_delta FROM submissions WHERE student_id=$1 ORDER BY submitted_at DESC LIMIT 20', [sid])
  const stuQ = await pool.query('SELECT streak, stars FROM students WHERE id=$1', [sid])
  const stu = stuQ.rows[0] || { streak: 0, stars: 0 }
  const counts = {}
  for (const r of subsQ.rows) {
    if (r.sticker) counts[r.sticker] = (counts[r.sticker] || 0) + 1
  }
  const stickers = Object.entries(counts).map(([sticker, count]) => ({ sticker, count }))
  res.render('student_habits', { rows: subsQ.rows, stickers, streak: stu.streak, stars: stu.stars })
})

app.post('/student/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/student')
  })
})

async function maybeSeedAdmin() {
  if (!usePg) return
  await ensureSchema()
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM teachers')
  if (rows[0].count > 0) return
  const email = process.env.DEFAULT_ADMIN_EMAIL
  const password = process.env.DEFAULT_ADMIN_PASSWORD
  if (!email || !password) return
  const hash = await bcrypt.hash(password, 10)
  await pool.query('INSERT INTO teachers (email, password_hash, name) VALUES ($1, $2, $3)', [email, hash, 'Quản trị'])
}

async function maybeSeedStudent() {
  if (!usePg) return
  await ensureSchema()
  const { rows } = await pool.query('SELECT COUNT(*)::int AS count FROM students')
  if (rows[0].count > 0) return
  const username = process.env.DEFAULT_STUDENT_USERNAME
  const password = process.env.DEFAULT_STUDENT_PASSWORD
  if (!username || !password) return
  const hash = await bcrypt.hash(password, 10)
  const { rows: classRows } = await pool.query('SELECT id FROM classes ORDER BY id ASC LIMIT 1')
  let classId = classRows[0]?.id || null
  if (!classId) {
    const created = await pool.query('INSERT INTO classes (name) VALUES ($1) RETURNING id', ['Lớp mẫu'])
    classId = created.rows[0].id
  }
  await pool.query('INSERT INTO students (username, password_hash, name, class_id) VALUES ($1, $2, $3, $4)', [username, hash, 'Học sinh mẫu', classId])
}

const port = process.env.PORT || 3000
let lastGeminiCall = 0
const NUDGE_TONE = (process.env.NUDGE_TONE || 'gentle').toLowerCase()
const NUDGE_POLICY = {
  difficultyStars: { easy: 1, medium: 2, hard: 3 },
  topicBonus: {
    'tích phân': { hard: 1, medium: 0, easy: 0 },
    'hàm số': { hard: 1, medium: 1, easy: 0 },
    'hình học': { hard: 1, medium: 1, easy: 0 },
    'xác suất': { hard: 1, medium: 0, easy: 0 }
  },
  stickers: { correct: '🎉', incorrect: '💡' },
  messages: {
    gentle: {
      correct: (t) => `Rất tốt! Tiếp tục phát huy nhé. Nếu muốn nâng cao, thử thêm vài bài ${t || 'khó hơn'}`,
      incorrect: (t) => `Chưa đúng nhưng bạn đang tiến bộ. Thử xem lại chủ đề ${t || 'vừa làm'}, bắt đầu từ ví dụ dễ trước, rồi tăng dần. Bạn làm được!`
    },
    coach: {
      correct: (t) => `Làm tốt! Tiếp tục luyện ${t || 'chủ đề này'} với độ khó cao hơn để bứt phá.`,
      incorrect: (t) => `Sai ở bước trọng tâm. Ôn lại nền tảng của ${t || 'chủ đề'}, luyện 2–3 bài dễ rồi quay lại bài này.`
    }
  }
}

function resolvePdfFont() {
  const candidates = [
    process.env.PDF_FONT_PATH,
    'C:/Windows/Fonts/segoeui.ttf',
    'C:/Windows/Fonts/arial.ttf',
    'C:/Windows/Fonts/tahoma.ttf',
    'C:/Windows/Fonts/times.ttf',
    'C:/Windows/Fonts/verdana.ttf'
  ].filter(Boolean)
  for (const p of candidates) {
    try { if (fs.existsSync(p)) return p } catch {}
  }
  return null
}

async function safeFetch(url, options = {}) {
  if (typeof globalThis.fetch === 'function') return globalThis.fetch(url, options)
  return new Promise((resolve, reject) => {
    try {
      const u = new URL(url)
      const isHttps = u.protocol === 'https:'
      const mod = isHttps ? https : http
      const req = mod.request({
        method: options.method || 'GET',
        hostname: u.hostname,
        path: u.pathname + u.search,
        port: u.port || (isHttps ? 443 : 80),
        headers: options.headers || {}
      }, res => {
        const chunks = []
        res.on('data', c => chunks.push(c))
        res.on('end', () => {
          const bodyStr = Buffer.concat(chunks).toString('utf8')
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: async () => JSON.parse(bodyStr || '{}'),
            text: async () => bodyStr
          })
        })
      })
      req.on('error', reject)
      if (options.body) req.write(options.body)
      req.end()
    } catch (err) {
      reject(err)
    }
  })
}

Promise.all([maybeSeedAdmin(), maybeSeedStudent()]).finally(() => {
  app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on http://0.0.0.0:${port}`)
  })
})

app.get('/admin/classes', (req, res) => {
  if (!usePg) return res.render('admin_classes', { classes: [], created: null })
  pool.query('SELECT * FROM classes ORDER BY id DESC').then(r => {
    res.render('admin_classes', { classes: r.rows, created: req.query.created || null })
  })
})

app.get('/admin/students', async (req, res) => {
  if (!usePg) return res.render('admin_students', { students: [], classes: [], createdUser: null, createdPass: null })
  const classes = await pool.query('SELECT * FROM classes ORDER BY name ASC')
  const students = await pool.query('SELECT s.*, c.name AS class_name FROM students s LEFT JOIN classes c ON c.id=s.class_id ORDER BY s.id DESC')
  res.render('admin_students', { students: students.rows, classes: classes.rows, createdUser: req.query.user || null, createdPass: req.query.pass || null })
})

app.get('/admin/exercises', async (req, res) => {
  if (!usePg) return res.render('admin_exercises', { exercises: [], classes: [], ai: req.query.ai || null })
  const exercises = await pool.query('SELECT * FROM exercises ORDER BY id DESC')
  const classes = await pool.query('SELECT * FROM classes ORDER BY name ASC')
  res.render('admin_exercises', { exercises: exercises.rows, classes: classes.rows, ai: req.query.ai || null })
})

app.get('/admin/exercises/new/manual', async (req, res) => {
  if (!usePg) return res.render('admin_exercise_new_manual', { classes: [] })
  const classes = await pool.query('SELECT * FROM classes ORDER BY name ASC')
  res.render('admin_exercise_new_manual', { classes: classes.rows })
})

app.post('/admin/exercises/new/manual', async (req, res) => {
  if (!usePg) return res.redirect('/admin/exercises')
  const { question, opt_a, opt_b, opt_c, opt_d, answer, class_id, topic, grade_level } = req.body
  if (!question || !opt_a || !opt_b || !opt_c || !opt_d || !answer) return res.redirect('/admin/exercises')
  const title = question.slice(0, 120)
  const q = `INSERT INTO exercises (title, description, mode, question, opt_a, opt_b, opt_c, opt_d, answer, topic, grade_level) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`
  const created = await pool.query(q, [title, null, 'manual', question, opt_a, opt_b, opt_c, opt_d, answer, topic || null, grade_level ? parseInt(grade_level, 10) : null])
  const exId = created.rows[0].id
  if (class_id) await pool.query('INSERT INTO assignments (class_id, exercise_id) VALUES ($1,$2)', [parseInt(class_id, 10), exId])
  res.redirect('/admin/exercises')
})

function generateAIQuestion(grade, difficulty, topic) {
  const g = grade || 10
  const d = (difficulty || 'easy').toLowerCase()
  const t = (topic || 'hàm số').toLowerCase()
  const base = `Câu hỏi ${t} lớp ${g} (${d})`
  let question = `${base}: Cho hàm số f(x)=x^2+2x+1. Giá trị f(2) bằng bao nhiêu?`
  let opts = { A: '3', B: '5', C: '9', D: '7' }
  let answer = 'C'
  let explains = {
    A: 'Sai: f(2)=2^2+2*2+1=9, không phải 3',
    B: 'Sai: cộng chưa đúng',
    C: 'Đúng: 4+4+1=9',
    D: 'Sai: kết quả không khớp'
  }
  let solution = 'Tính trực tiếp: f(2)=2^2+2*2+1=4+4+1=9'
  if (t.includes('tích phân')) {
    question = `${base}: Tính ∫_0^1 2x dx`
    opts = { A: '1', B: '2', C: '0.5', D: '3' }
    answer = 'A'
    explains = {
      A: 'Đúng: ∫0^1 2x dx = [x^2]_0^1 = 1',
      B: 'Sai: gấp đôi không đúng',
      C: 'Sai: nửa là nhầm',
      D: 'Sai: quá lớn'
    }
    solution = 'Nguyên hàm 2x là x^2, giá trị từ 0 đến 1 là 1'
  }
  return { question, opts, answer, explains, solution }
}

function computeAutoNudge(e, selected, isCorrect) {
  const d = (e.difficulty || '').toLowerCase()
  const t = (e.topic || '').toLowerCase()
  let stars = 0
  let streak_delta = 0
  let sticker = null
  let nudge = ''
  const baseStars = NUDGE_POLICY.difficultyStars[d] || 0
  const bonus = (NUDGE_POLICY.topicBonus[t] && NUDGE_POLICY.topicBonus[t][d]) || 0
  const tone = NUDGE_TONE === 'coach' ? 'coach' : 'gentle'
  if (isCorrect) {
    stars = baseStars + bonus
    streak_delta = 1
    sticker = NUDGE_POLICY.stickers.correct
    nudge = NUDGE_POLICY.messages[tone].correct(t)
  } else {
    stars = 0
    streak_delta = 0
    sticker = NUDGE_POLICY.stickers.incorrect
    nudge = NUDGE_POLICY.messages[tone].incorrect(t)
  }
  return { nudge, sticker, stars, streak_delta }
}

async function generateAIQuestionGemini(grade, difficulty, topic) {
  const apiKey = process.env.GEMINI_API_KEY
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash'
  if (!apiKey) throw new Error('Missing GEMINI_API_KEY')
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`
  const prompt = [
    `Bạn là trợ lý tạo bài toán trắc nghiệm Toán bằng tiếng Việt.`,
    `Yêu cầu: tạo 1 câu hỏi trắc nghiệm phù hợp lớp ${grade || ''} độ khó ${difficulty || ''} theo chủ đề "${topic || ''}".`,
    `Đầu ra chỉ là JSON không kèm giải thích, không markdown, với schema:`,
    `{"question": string, "opts": {"A": string, "B": string, "C": string, "D": string}, "answer": "A"|"B"|"C"|"D", "explains": {"A": string, "B": string, "C": string, "D": string}, "solution": string}`
  ].join('\n')
  const body = {
    contents: [
      {
        role: 'user',
        parts: [{ text: prompt }]
      }
    ]
  }
  const delays = [1200, 2500, 5000]
  const minInterval = parseInt(process.env.GEMINI_MIN_INTERVAL_MS || '1200', 10)
  for (let i = 0; i <= delays.length; i++) {
    const now = Date.now()
    const wait = Math.max(0, lastGeminiCall + minInterval - now)
    if (wait > 0) await new Promise(r => setTimeout(r, wait))
    lastGeminiCall = Date.now()
    const resp = await safeFetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })
    if (resp.status === 429 && i < delays.length) {
      await new Promise(r => setTimeout(r, delays[i]))
      continue
    }
    if (!resp.ok) throw new Error(`Gemini error: ${resp.status}`)
    const data = await resp.json()
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('\n') || ''
    let jsonText = text.trim()
    const m = jsonText.match(/```json[\s\S]*?```/) || jsonText.match(/\{[\s\S]*\}/)
    if (m) {
      jsonText = m[0]
      if (jsonText.startsWith('```')) jsonText = jsonText.replace(/^```json\s*/i, '').replace(/```\s*$/i, '')
    }
    const parsed = JSON.parse(jsonText)
    const question = String(parsed.question || '')
    const opts = parsed.opts || { A: '', B: '', C: '', D: '' }
    const answer = String(parsed.answer || 'A').toUpperCase()
    const explains = parsed.explains || { A: '', B: '', C: '', D: '' }
    const solution = String(parsed.solution || '')
    if (!question || !opts.A || !opts.B || !opts.C || !opts.D) throw new Error('Invalid Gemini output')
    return { question, opts, answer, explains, solution }
  }
  throw new Error('Gemini error: 429')
}

app.get('/admin/exercises/new/ai', async (req, res) => {
  if (!usePg) return res.render('admin_exercise_new_ai', { classes: [], error: req.query.error || null, selectedGrade: req.query.grade_level || null, selectedDifficulty: req.query.difficulty || null, selectedTopic: req.query.topic || '', selectedClassId: req.query.class_id || '' })
  const classes = await pool.query('SELECT * FROM classes ORDER BY name ASC')
  res.render('admin_exercise_new_ai', { classes: classes.rows, error: req.query.error || null, selectedGrade: req.query.grade_level || null, selectedDifficulty: req.query.difficulty || null, selectedTopic: req.query.topic || '', selectedClassId: req.query.class_id || '' })
})

app.post('/admin/exercises/new/ai', async (req, res) => {
  if (!usePg) return res.redirect('/admin/exercises')
  const { grade_level, difficulty, topic, class_id } = req.body
  const g = grade_level ? parseInt(grade_level, 10) : null
  const d = (difficulty || '').toLowerCase()
  const t = (topic || '').trim()
  if (!t) return res.redirect(`/admin/exercises/new/ai?error=${encodeURIComponent('Bạn chưa nhập chủ đề')}&grade_level=${encodeURIComponent(grade_level || '')}&difficulty=${encodeURIComponent(difficulty || '')}&topic=${encodeURIComponent(topic || '')}&class_id=${encodeURIComponent(class_id || '')}`)
  if (!g || ![10,11,12].includes(g)) return res.redirect(`/admin/exercises/new/ai?error=${encodeURIComponent('Lớp không hợp lệ')}&grade_level=${encodeURIComponent(grade_level || '')}&difficulty=${encodeURIComponent(difficulty || '')}&topic=${encodeURIComponent(topic || '')}&class_id=${encodeURIComponent(class_id || '')}`)
  if (!['easy','medium','hard'].includes(d)) return res.redirect(`/admin/exercises/new/ai?error=${encodeURIComponent('Độ khó không hợp lệ')}&grade_level=${encodeURIComponent(grade_level || '')}&difficulty=${encodeURIComponent(difficulty || '')}&topic=${encodeURIComponent(topic || '')}&class_id=${encodeURIComponent(class_id || '')}`)
  try {
    const gen = await generateAIQuestionGemini(g, d, t)
    const title = gen.question.slice(0, 120)
    const q = `INSERT INTO exercises (title, description, mode, question, opt_a, opt_b, opt_c, opt_d, answer, explain_a, explain_b, explain_c, explain_d, ai_solution, grade_level, difficulty, topic) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`
    const created = await pool.query(q, [title, null, 'ai', gen.question, gen.opts.A, gen.opts.B, gen.opts.C, gen.opts.D, gen.answer, gen.explains.A, gen.explains.B, gen.explains.C, gen.explains.D, gen.solution, g, d || null, t || null])
    const exId = created.rows[0].id
    if (class_id) await pool.query('INSERT INTO assignments (class_id, exercise_id) VALUES ($1,$2)', [parseInt(class_id, 10), exId])
    res.redirect('/admin/exercises?ai=done')
  } catch (e) {
    let raw = e && e.message ? e.message : 'Gemini bị lỗi'
    if (/429/.test(raw)) raw = '429 - vượt hạn mức hoặc rate limit, vui lòng thử lại sau'
    const qs = `grade_level=${encodeURIComponent(grade_level || '')}&difficulty=${encodeURIComponent(difficulty || '')}&topic=${encodeURIComponent(topic || '')}&class_id=${encodeURIComponent(class_id || '')}`
    const msg = encodeURIComponent(raw)
    res.redirect(`/admin/exercises/new/ai?error=${msg}&${qs}`)
  }
})

app.get('/student/exercises', requireStudent, async (req, res) => {
  if (!usePg) return res.render('student_exercises', { rows: [] })
  const s = await pool.query('SELECT class_id FROM students WHERE id=$1', [req.session.studentId])
  const classId = s.rows[0]?.class_id
  if (!classId) return res.render('student_exercises', { rows: [] })
  const rows = await pool.query('SELECT e.id, e.title, e.mode FROM assignments a JOIN exercises e ON e.id=a.exercise_id WHERE a.class_id=$1 ORDER BY a.id DESC', [classId])
  res.render('student_exercises', { rows: rows.rows })
})

app.get('/student/exercises/:id', requireStudent, async (req, res) => {
  if (!usePg) return res.render('student_exercise_detail', { ex: null })
  const id = parseInt(req.params.id, 10)
  const ex = await pool.query('SELECT * FROM exercises WHERE id=$1', [id])
  res.render('student_exercise_detail', { ex: ex.rows[0] })
})

app.post('/student/exercises/:id/submit', requireStudent, upload.array('images', 10), async (req, res) => {
  if (!usePg) return res.redirect('/student/exercises')
  const id = parseInt(req.params.id, 10)
  const { selected, content } = req.body
  const ex = await pool.query('SELECT * FROM exercises WHERE id=$1', [id])
  const e = ex.rows[0]
  if (!e) return res.redirect('/student/exercises')
  let isCorrect = null
  let autograded = false
  let explanation = null
  let nudge = null
  let sticker = null
  let starsAward = 0
  let streakDelta = 0
  if (e.mode === 'ai') {
    isCorrect = selected === e.answer
    autograded = true
    const map = { A: e.explain_a, B: e.explain_b, C: e.explain_c, D: e.explain_d }
    explanation = [map[selected] || '', e.ai_solution || ''].filter(Boolean).join('\n')
    const auto = computeAutoNudge(e, selected, isCorrect)
    nudge = auto.nudge
    sticker = auto.sticker
    starsAward = auto.stars
    streakDelta = auto.streak_delta
  }
  const files = Array.isArray(req.files) ? req.files : []
  const images = files.map(f => f.filename)
  const ins = await pool.query('INSERT INTO submissions (student_id, exercise_id, selected, is_correct, autograded, explanation, content, images, nudge, sticker, stars, streak_delta) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) RETURNING id', [req.session.studentId, id, selected || null, isCorrect, autograded, explanation, (content && content.trim()) ? content.trim() : null, images.length ? images : null, nudge || null, sticker || null, starsAward || 0, streakDelta || 0])
  if (autograded) {
    await pool.query('UPDATE students SET streak = GREATEST(0, streak + $1), stars = stars + $2 WHERE id=$3', [streakDelta || 0, starsAward || 0, req.session.studentId])
  }
  res.render('student_result', { ex: e, selected, isCorrect, explanation, images, nudge, sticker, starsAward, streakDelta })
})

app.get('/student/submissions', requireStudent, async (req, res) => {
  if (!usePg) return res.render('student_submissions', { rows: [] })
  const rows = await pool.query('SELECT s.id, s.exercise_id, s.submitted_at, s.selected, s.is_correct, s.autograded, s.grade, s.feedback, s.nudge, s.sticker, s.stars, s.explanation, s.images, e.title FROM submissions s JOIN exercises e ON e.id=s.exercise_id WHERE s.student_id=$1 ORDER BY s.id DESC', [req.session.studentId])
  res.render('student_submissions', { rows: rows.rows })
})

app.post('/admin/classes', async (req, res) => {
  if (!usePg) return res.redirect('/admin/classes')
  const { name } = req.body
  if (!name) return res.redirect('/admin/classes')
  await pool.query('INSERT INTO classes (name) VALUES ($1)', [name])
  res.redirect('/admin/classes?created=1')
})

app.get('/admin/classes/:id', async (req, res) => {
  if (!usePg) return res.render('admin_class_detail', { cls: null, students: [], assignments: [] })
  const id = parseInt(req.params.id, 10)
  const cls = await pool.query('SELECT * FROM classes WHERE id=$1', [id])
  const students = await pool.query('SELECT * FROM students WHERE class_id=$1 ORDER BY id DESC', [id])
  const assignments = await pool.query('SELECT a.*, e.title FROM assignments a JOIN exercises e ON e.id=a.exercise_id WHERE a.class_id=$1 ORDER BY a.id DESC', [id])
  res.render('admin_class_detail', { cls: cls.rows[0], students: students.rows, assignments: assignments.rows })
})

app.post('/admin/classes/:id/rename', async (req, res) => {
  if (!usePg) return res.redirect('/admin/classes')
  const id = parseInt(req.params.id, 10)
  const { name } = req.body
  await pool.query('UPDATE classes SET name=$1 WHERE id=$2', [name, id])
  res.redirect(`/admin/classes/${id}`)
})

app.post('/admin/classes/:id/lock', async (req, res) => {
  if (!usePg) return res.redirect('/admin/classes')
  const id = parseInt(req.params.id, 10)
  const { action } = req.body
  const locked = action === 'lock'
  await pool.query('UPDATE classes SET locked=$1 WHERE id=$2', [locked, id])
  res.redirect(`/admin/classes/${id}`)
})

function slugifyName(name) {
  return name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '').slice(0, 12)
}

async function genUniqueUsername(base) {
  let suffix = String(Math.floor(1000 + Math.random() * 9000))
  let username = `${base}${suffix}`
  let exists = await pool.query('SELECT 1 FROM students WHERE username=$1', [username])
  while (exists.rowCount > 0) {
    suffix = String(Math.floor(1000 + Math.random() * 9000))
    username = `${base}${suffix}`
    exists = await pool.query('SELECT 1 FROM students WHERE username=$1', [username])
  }
  return username
}

function genPassword() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
  let s = ''
  for (let i = 0; i < 8; i++) s += chars[Math.floor(Math.random() * chars.length)]
  return s
}

app.post('/admin/students', async (req, res) => {
  if (!usePg) return res.redirect('/admin/students')
  const { name, class_id, password: passwordInput } = req.body
  const base = slugifyName(name || 'hs')
  const username = await genUniqueUsername(base || 'hs')
  const password = (passwordInput && passwordInput.trim()) ? passwordInput.trim() : genPassword()
  const hash = await bcrypt.hash(password, 10)
  await pool.query('INSERT INTO students (username, password_hash, name, class_id) VALUES ($1, $2, $3, $4)', [username, hash, name, class_id ? parseInt(class_id, 10) : null])
  res.redirect(`/admin/students?user=${encodeURIComponent(username)}&pass=${encodeURIComponent(password)}`)
})

app.post('/admin/students/:id/delete', async (req, res) => {
  if (!usePg) return res.redirect('/admin/students')
  const id = parseInt(req.params.id, 10)
  await pool.query('DELETE FROM students WHERE id=$1', [id])
  res.redirect('/admin/students')
})

app.post('/admin/students/:id/reset', async (req, res) => {
  if (!usePg) return res.redirect('/admin/students')
  const id = parseInt(req.params.id, 10)
  const passwordInput = req.body.new_password
  const password = (passwordInput && passwordInput.trim()) ? passwordInput.trim() : genPassword()
  const hash = await bcrypt.hash(password, 10)
  await pool.query('UPDATE students SET password_hash=$1 WHERE id=$2', [hash, id])
  const s = await pool.query('SELECT username FROM students WHERE id=$1', [id])
  const u = s.rows[0]?.username || ''
  res.redirect(`/admin/students?user=${encodeURIComponent(u)}&pass=${encodeURIComponent(password)}`)
})

app.post('/admin/exercises', async (req, res) => {
  if (!usePg) return res.redirect('/admin/exercises')
  const { title, description } = req.body
  if (!title) return res.redirect('/admin/exercises')
  await pool.query('INSERT INTO exercises (title, description) VALUES ($1, $2)', [title, description || null])
  res.redirect('/admin/exercises')
})

app.post('/admin/exercises/:id/assign', async (req, res) => {
  if (!usePg) return res.redirect('/admin/exercises')
  const id = parseInt(req.params.id, 10)
  const { class_id } = req.body
  if (!class_id) return res.redirect('/admin/exercises')
  await pool.query('INSERT INTO assignments (class_id, exercise_id) VALUES ($1, $2)', [parseInt(class_id, 10), id])
  res.redirect('/admin/exercises')
})

app.get('/admin/exercises/assigned', async (req, res) => {
  if (!usePg) return res.render('admin_assignments', { rows: [] })
  const rows = await pool.query('SELECT a.id, c.name AS class_name, e.title, a.assigned_at FROM assignments a JOIN classes c ON c.id=a.class_id JOIN exercises e ON e.id=a.exercise_id ORDER BY a.id DESC')
  res.render('admin_assignments', { rows: rows.rows })
})

app.post('/admin/exercises/assigned/:id/delete', async (req, res) => {
  if (!usePg) return res.redirect('/admin/exercises/assigned')
  const id = parseInt(req.params.id, 10)
  await pool.query('DELETE FROM assignments WHERE id=$1', [id])
  res.redirect('/admin/exercises/assigned')
})

app.get('/admin/progress', async (req, res) => {
  if (!usePg) return res.render('admin_progress', { rows: [] })
  const rowsQ = await pool.query(`
    SELECT s.id, s.name, s.username, c.name AS class_name,
           COALESCE(COUNT(sub.*),0)::int AS total,
           COALESCE(SUM(CASE WHEN sub.is_correct THEN 1 ELSE 0 END),0)::int AS correct,
           s.stars::int AS stars,
           s.streak::int AS streak,
           MAX(sub.submitted_at) AS last_submitted
    FROM students s
    LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN submissions sub ON sub.student_id=s.id
    GROUP BY s.id, c.name
    ORDER BY c.name ASC NULLS LAST, s.id DESC
  `)
  const rows = rowsQ.rows
  const leaders = rows.slice().sort((a,b) => (b.streak - a.streak) || (b.stars - a.stars)).slice(0, 10)
  res.render('admin_progress', { rows, leaders })
})

app.get('/admin/progress/export/csv', async (req, res) => {
  if (!usePg) return res.status(400).send('No DB')
  const rowsQ = await pool.query(`
    SELECT s.name, s.username, c.name AS class_name,
           COALESCE(COUNT(sub.*),0)::int AS total,
           COALESCE(SUM(CASE WHEN sub.is_correct THEN 1 ELSE 0 END),0)::int AS correct,
           s.stars::int AS stars,
           s.streak::int AS streak,
           MAX(sub.submitted_at) AS last_submitted
    FROM students s
    LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN submissions sub ON sub.student_id=s.id
    GROUP BY s.id, c.name
    ORDER BY c.name ASC NULLS LAST, s.id DESC
  `)
  const rows = rowsQ.rows
  const header = ['Lớp','Học sinh','Username','Bài nộp','Đúng','Tỉ lệ','Sao','Chuỗi ngày','Lần nộp gần nhất']
  const lines = [header.join(',')]
  for (const r of rows) {
    const acc = r.total ? Math.round((r.correct / r.total) * 100) : 0
    const last = r.last_submitted ? new Date(r.last_submitted).toISOString() : ''
    lines.push([r.class_name||'', r.name||'', r.username||'', r.total||0, r.correct||0, `${acc}%`, r.stars||0, r.streak||0, last].map(x => String(x).replace(/,/g,';')).join(','))
  }
  const csv = lines.join('\n')
  const bom = '\uFEFF'
  res.setHeader('Content-Type', 'text/csv; charset=utf-8')
  res.setHeader('Content-Disposition', 'attachment; filename="tien_do.csv"')
  res.send(bom + csv)
})

app.get('/admin/progress/export/pdf', async (req, res) => {
  if (!usePg) return res.status(400).send('No DB')
  const rowsQ = await pool.query(`
    SELECT s.name, s.username, c.name AS class_name,
           COALESCE(COUNT(sub.*),0)::int AS total,
           COALESCE(SUM(CASE WHEN sub.is_correct THEN 1 ELSE 0 END),0)::int AS correct,
           s.stars::int AS stars,
           s.streak::int AS streak
    FROM students s
    LEFT JOIN classes c ON c.id=s.class_id
    LEFT JOIN submissions sub ON sub.student_id=s.id
    GROUP BY s.id, c.name
    ORDER BY c.name ASC NULLS LAST, s.id DESC
  `)
  const rows = rowsQ.rows
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'attachment; filename="tien_do.pdf"')
  const doc = new PDFDocument({ margin: 40 })
  doc.pipe(res)
  const fp = resolvePdfFont()
  if (fp) {
    try { doc.font(fp) } catch {}
  }
  doc.fontSize(18).text('Báo cáo tiến độ học sinh', { align: 'center' })
  doc.moveDown()
  doc.fontSize(12)
  const max = Math.min(rows.length, 50)
  for (let i = 0; i < max; i++) {
    const r = rows[i]
    const acc = r.total ? Math.round((r.correct / r.total) * 100) : 0
    doc.text(`${r.class_name||'-'} · ${r.name||'-'} (${r.username||'-'}) · Nộp: ${r.total||0} · Đúng: ${r.correct||0} · ${acc}% · ⭐ ${r.stars||0} · Chuỗi: ${r.streak||0}`)
  }
  doc.end()
})

app.get('/admin/plans', async (req, res) => {
  if (!usePg) return res.render('admin_plans', { rows: [] })
  const rows = await pool.query('SELECT p.id, p.name, p.start_at, p.end_at, c.name AS class_name FROM learning_plans p JOIN classes c ON c.id=p.class_id ORDER BY p.id DESC')
  res.render('admin_plans', { rows: rows.rows })
})

app.get('/admin/plans/new', async (req, res) => {
  if (!usePg) return res.render('admin_plan_new', { classes: [] })
  const classes = await pool.query('SELECT * FROM classes ORDER BY name ASC')
  res.render('admin_plan_new', { classes: classes.rows })
})

app.post('/admin/plans', async (req, res) => {
  if (!usePg) return res.redirect('/admin/plans')
  const { class_id, name, start_at, end_at } = req.body
  if (!class_id || !name) return res.redirect('/admin/plans')
  const created = await pool.query('INSERT INTO learning_plans (class_id, name, start_at, end_at) VALUES ($1,$2,$3,$4) RETURNING id', [parseInt(class_id, 10), name, start_at || null, end_at || null])
  res.redirect(`/admin/plans/${created.rows[0].id}`)
})

app.get('/admin/plans/:id', async (req, res) => {
  if (!usePg) return res.render('admin_plan_detail', { plan: null, items: [], classes: [] })
  const id = parseInt(req.params.id, 10)
  const plan = await pool.query('SELECT p.*, c.name AS class_name FROM learning_plans p JOIN classes c ON c.id=p.class_id WHERE p.id=$1', [id])
  const items = await pool.query('SELECT * FROM plan_items WHERE plan_id=$1 ORDER BY id DESC', [id])
  res.render('admin_plan_detail', { plan: plan.rows[0], items: items.rows, ok: req.query.ok || null, fail: req.query.fail || null })
})

app.post('/admin/plans/:id/items', async (req, res) => {
  if (!usePg) return res.redirect('/admin/plans')
  const id = parseInt(req.params.id, 10)
  const { topic, skill, difficulty, count, due_at, frequency, strategy, range_start, range_end } = req.body
  await pool.query('INSERT INTO plan_items (plan_id, topic, skill, difficulty, frequency, strategy, range_start, range_end, count, due_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)', [id, topic || null, skill || null, difficulty || null, frequency || null, strategy || null, range_start || null, range_end || null, count ? parseInt(count, 10) : 1, due_at || null])
  res.redirect(`/admin/plans/${id}`)
})

app.post('/admin/plans/:id/generate', async (req, res) => {
  if (!usePg) return res.redirect('/admin/plans')
  const id = parseInt(req.params.id, 10)
  const planQ = await pool.query('SELECT * FROM learning_plans WHERE id=$1', [id])
  const plan = planQ.rows[0]
  if (!plan) return res.redirect('/admin/plans')
  const itemsQ = await pool.query('SELECT * FROM plan_items WHERE plan_id=$1 ORDER BY id ASC', [id])
  let ok = 0
  let fail = 0
  for (const it of itemsQ.rows) {
    const grade_level = null
    const top = (it.topic || it.skill || '').trim()
    if (!top) { fail++; continue }
    let dates = []
    const freq = (it.frequency || '').toLowerCase()
    const rs = it.range_start ? new Date(it.range_start) : null
    const re = it.range_end ? new Date(it.range_end) : null
    if (freq === 'daily' && rs && re) {
      const d0 = new Date(Date.UTC(rs.getUTCFullYear(), rs.getUTCMonth(), rs.getUTCDate()))
      const d1 = new Date(Date.UTC(re.getUTCFullYear(), re.getUTCMonth(), re.getUTCDate()))
      for (let d = new Date(d0); d <= d1; d = new Date(d.getTime() + 86400000)) dates.push(new Date(d))
    } else if (freq === 'weekly' && rs && re) {
      const d0 = new Date(Date.UTC(rs.getUTCFullYear(), rs.getUTCMonth(), rs.getUTCDate()))
      const d1 = new Date(Date.UTC(re.getUTCFullYear(), re.getUTCMonth(), re.getUTCDate()))
      for (let d = new Date(d0); d <= d1; d = new Date(d.getTime() + 7*86400000)) dates.push(new Date(d))
    } else {
      const due = it.due_at ? new Date(it.due_at) : null
      const cnt = it.count || 1
      for (let i = 0; i < cnt; i++) dates.push(due)
    }
    let diff = (it.difficulty || '').toLowerCase()
    if ((it.strategy || '').toLowerCase() === 'progress') {
      const statsQ = await pool.query(`SELECT COUNT(*)::int AS total, SUM(CASE WHEN s.is_correct THEN 1 ELSE 0 END)::int AS correct FROM submissions s JOIN students st ON st.id=s.student_id WHERE st.class_id=$1`, [plan.class_id])
      const stats = statsQ.rows[0] || { total: 0, correct: 0 }
      const acc = stats.total ? Math.round((stats.correct / stats.total) * 100) : 0
      diff = acc < 50 ? 'easy' : (acc < 80 ? 'medium' : 'hard')
    }
    for (const due of dates) {
      try {
        const gen = await generateAIQuestionGemini(grade_level, diff || null, top)
        const title = gen.question.slice(0, 120)
        const q = `INSERT INTO exercises (title, description, mode, question, opt_a, opt_b, opt_c, opt_d, answer, explain_a, explain_b, explain_c, explain_d, ai_solution, grade_level, difficulty, topic) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`
        const created = await pool.query(q, [title, null, 'ai', gen.question, gen.opts.A, gen.opts.B, gen.opts.C, gen.opts.D, gen.answer, gen.explains.A, gen.explains.B, gen.explains.C, gen.explains.D, gen.solution, grade_level, diff || null, top])
        const exId = created.rows[0].id
        await pool.query('INSERT INTO assignments (class_id, exercise_id, assigned_at) VALUES ($1,$2,$3)', [plan.class_id, exId, due || new Date()])
        ok++
      } catch (e) {
        fail++
      }
    }
  }
  res.redirect(`/admin/plans/${id}?ok=${ok}&fail=${fail}`)
})

app.get('/admin/messages/new', async (req, res) => {
  if (!usePg) return res.render('admin_message_new', { classes: [], students: [], student_id: req.query.student_id || null, class_id: req.query.class_id || null })
  const classes = await pool.query('SELECT * FROM classes ORDER BY name ASC')
  const students = await pool.query('SELECT id, name, username FROM students ORDER BY id DESC')
  res.render('admin_message_new', { classes: classes.rows, students: students.rows, student_id: req.query.student_id || null, class_id: req.query.class_id || null })
})

app.post('/admin/messages/send', async (req, res) => {
  if (!usePg) return res.redirect('/admin')
  const { student_id, class_id, content } = req.body
  if (!content || (!student_id && !class_id)) return res.redirect('/admin/messages/new')
  await pool.query('INSERT INTO messages (student_id, class_id, content) VALUES ($1,$2,$3)', [student_id ? parseInt(student_id, 10) : null, class_id ? parseInt(class_id, 10) : null, content.trim()])
  res.redirect('/admin/progress')
})

app.get('/student/messages', requireStudent, async (req, res) => {
  if (!usePg) return res.render('student_messages', { rows: [] })
  const sid = req.session.studentId
  const sQ = await pool.query('SELECT class_id FROM students WHERE id=$1', [sid])
  const classId = sQ.rows[0]?.class_id || null
  const rows = await pool.query('SELECT * FROM messages WHERE student_id=$1 OR class_id=$2 ORDER BY created_at DESC', [sid, classId])
  res.render('student_messages', { rows: rows.rows })
})

app.post('/student/messages/:id/read', requireStudent, async (req, res) => {
  if (!usePg) return res.redirect('/student/messages')
  const id = parseInt(req.params.id, 10)
  await pool.query('UPDATE messages SET is_read=TRUE WHERE id=$1', [id])
  res.redirect('/student/messages')
})

app.get('/admin/exercises/:id/submissions', async (req, res) => {
  if (!usePg) return res.render('admin_submissions', { exercise: null, submissions: [] })
  const id = parseInt(req.params.id, 10)
  const exercise = await pool.query('SELECT * FROM exercises WHERE id=$1', [id])
  const subs = await pool.query('SELECT s.id, s.selected, s.is_correct, s.autograded, s.explanation, s.images, s.content, s.grade, s.feedback, s.nudge, s.sticker, s.stars, st.name AS student_name, st.username FROM submissions s JOIN students st ON st.id=s.student_id WHERE s.exercise_id=$1 ORDER BY s.id DESC', [id])
  res.render('admin_submissions', { exercise: exercise.rows[0], submissions: subs.rows })
})

app.post('/admin/submissions/:id/grade', async (req, res) => {
  if (!usePg) return res.redirect('/admin/exercises')
  const id = parseInt(req.params.id, 10)
  const { grade, feedback } = req.body
  await pool.query('UPDATE submissions SET grade=$1, feedback=$2, graded_at=NOW() WHERE id=$3', [grade ? parseInt(grade, 10) : null, feedback || null, id])
  const ex = await pool.query('SELECT exercise_id FROM submissions WHERE id=$1', [id])
  const exerciseId = ex.rows[0]?.exercise_id
  res.redirect(`/admin/exercises/${exerciseId}/submissions`)
})

app.post('/admin/submissions/:id/nudge', async (req, res) => {
  if (!usePg) return res.redirect('/admin/exercises')
  const id = parseInt(req.params.id, 10)
  const { nudge, sticker, stars, streak_delta } = req.body
  await pool.query('UPDATE submissions SET nudge=$1, sticker=$2, stars=$3, streak_delta=$4 WHERE id=$5', [nudge || null, sticker || null, stars ? parseInt(stars, 10) : 0, streak_delta ? parseInt(streak_delta, 10) : 0, id])
  const s = await pool.query('SELECT student_id, exercise_id, streak_delta, stars FROM submissions WHERE id=$1', [id])
  const row = s.rows[0]
  if (row) {
    await pool.query('UPDATE students SET streak = streak + $1, stars = stars + $2 WHERE id=$3', [row.streak_delta || 0, row.stars || 0, row.student_id])
  }
  res.redirect(`/admin/exercises/${row.exercise_id}/submissions`)
})
