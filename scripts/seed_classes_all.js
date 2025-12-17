import bcrypt from 'bcryptjs'
import { pool, ensureSchema } from '../src/db.js'

function toAscii(input) {
  const s = (input || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  return s.replace(/Đ/g, 'D').replace(/đ/g, 'd')
}

async function getOrCreateClass(name) {
  const r1 = await pool.query('SELECT id FROM classes WHERE name=$1 LIMIT 1', [name])
  if (r1.rows[0]) return r1.rows[0].id
  const r2 = await pool.query('INSERT INTO classes(name) VALUES($1) RETURNING id', [name])
  return r2.rows[0].id
}

async function existingUsernames() {
  const r = await pool.query('SELECT username FROM students')
  return new Set(r.rows.map(x => x.username).filter(Boolean))
}

function makeUsername(baseName, prefix, taken) {
  let i = 1
  let u = `user${i}`
  while (taken.has(u)) {
    i++
    u = `user${i}`
  }
  taken.add(u)
  return u
}

async function seedClass(className, names, prefix, tempPassword) {
  const classId = await getOrCreateClass(className)
  const taken = await existingUsernames()
  const passwordHash = await bcrypt.hash(tempPassword, 10)
  const created = []
  for (const name of names) {
    const exists = await pool.query('SELECT id, username FROM students WHERE class_id=$1 AND name=$2 LIMIT 1', [classId, name])
    if (exists.rows[0]) {
      const curr = exists.rows[0].username || ''
      if (/^user\d+$/.test(curr)) {
        created.push({ id: exists.rows[0].id, name, username: curr })
        taken.add(curr)
        continue
      }
      const username = makeUsername(name, prefix, taken)
      await pool.query('UPDATE students SET username=$1 WHERE id=$2', [username, exists.rows[0].id])
      created.push({ id: exists.rows[0].id, name, username })
      continue
    }
    const username = makeUsername(name, prefix, taken)
    const r = await pool.query(
      'INSERT INTO students(name, username, password_hash, class_id) VALUES($1,$2,$3,$4) RETURNING id',
      [name, username, passwordHash, classId]
    )
    created.push({ id: r.rows[0].id, name, username })
  }
  console.log(`Đã tạo lớp: ${className} (id=${classId})`)
  console.log('Danh sách tài khoản học sinh (mật khẩu chung: ' + tempPassword + ')')
  for (const s of created) {
    console.log(`${String(s.id).padStart(4,' ')}  ${s.username}  |  ${s.name}`)
  }
}

async function main() {
  if (!pool) {
    console.error('Không tìm thấy cấu hình database. Kiểm tra biến môi trường hoặc file .env')
    process.exit(1)
  }
  await ensureSchema()

  const pairs_11A8 = [
    ['Hoàng Thị Kiều','Anh'],['Trần Nhựt','Anh'],['Hoàng Kỳ','Anh'],['Trần Mai','Chi'],['Ngô Đình','Du'],['Lê Trung','Đạt'],['Nguyễn Anh','Đức'],['Nguyễn Thị Mỹ','Duyên'],['Doãn Hương','Giang'],['Hoàng Thị Hồng','Hà'],['Lê Thị Thúy','Hằng'],['Cao Đình','Hiệp'],['Lê Viết','Hoàng'],['Trần Xuân','Hùng'],['Nguyễn Ánh','Huyền'],['Trần Thị Khánh','Huyền'],['Nguyễn Thị Minh','Huyền'],['Nguyễn Nhật','Khôi'],['Phan Thị Khánh','Linh'],['Hoàng Nữ Ngọc','Linh'],['Bùi Đình','Long'],['Trần Thị Lê','Na'],['Hoàng Thị Thúy','Ngân'],['Nguyễn Thị Bích','Ngọc'],['Hồ Xuân','Ngọc'],['Lê Trần','Phong'],['Bùi Khánh','Quốc'],['Đỗ Thanh','Sang'],['Trần Lê Công','Thành'],['Lê Thị Phương','Thảo'],['Nguyễn Thị Thanh','Thảo'],['Nguyễn Văn','Thoại'],['Lê Anh','Thư'],['Hoàng Thị Thanh','Thúy'],['Nguyễn Thị Hoài','Thương'],['Dương Thị Huyền','Trang'],['Bùi Thị Diệu','Trinh'],['Phạm Việt','Trinh'],['Trần Thị Ánh','Tuyết'],['Nguyễn Thị Hồng','Uyên'],['Nguyễn Đăng','Văn'],['Phạm Thị Bảo','Yến'],['Nguyễn Song','Hào'],['Hoàng Thị Thảo','Trinh'],['Phạm Minh','Tuấn']
  ]
  const names_11A8 = pairs_11A8.map(([a,b]) => `${a} ${b}`.replace(/\s+/g,' ').trim())

  const pairs_12A6 = [
    ['Hoàng Phương','Anh'],['Lê Hồng','Anh'],['Lê Quốc','Bảo'],['Trần Đỗ Diệu','Châu'],['Nguyễn Ngô Hà','Chi'],['Bùi Ngọc','Dung'],['Trần Trung','Dũng'],['Nguyễn Mậu Mỹ','Duyên'],['Đinh Hoàng Thuỳ','Dương'],['Trần Tiến','Đạt'],['Lê Lý','Hải'],['Phạm Đức','Hải'],['Lê Thu','Hằng'],['Phan Thị Thúy','Hằng'],['Lê Dương','Hiệp'],['Nguyễn Trung','Hiếu'],['Doãn Thị Khánh','Huyền'],['Trần Thị Mỹ','Huyền'],['Hoàng Văn','Khánh'],['Phan Công','Lập'],['Lương Ngọc Thuỳ','Linh'],['Trần Tấn','Lộc'],['Trần Ngọc Khánh','Ly'],['Nguyễn Thị Hằng','Nga'],['Lương Thái','Nguyễn'],['Cao Mỹ','Nhung'],['Nguyễn Chí','Phương'],['Nguyễn Đoàn Anh','Quân'],['Nguyễn Như','Quỳnh'],['Phạm Anh','Tài'],['Hoàng Bá','Thái'],['Nguyễn Thị Hồng','Thúy'],['Lê Minh','Tới'],['Trần Thị Hương','Trà'],['Huỳnh Quang','Trải'],['Trần Thị Diệu','Trinh'],['Nguyễn Hoàng Thanh','Trúc'],['Lê Thanh','Tú'],['Nguyễn Thị Cẩm','Tú'],['Trần Quốc','Tuấn'],['Hoàng Hải','Yến'],['Trần Thị Hải','Yến']
  ]
  const names_12A6 = pairs_12A6.map(([a,b]) => `${a} ${b}`.replace(/\s+/g,' ').trim())

  const pairs_12A8 = [
    ['Nguyễn Lê Quỳnh','Anh'],['Lê Thị Ngọc','Ánh'],['Cao Nguyễn Khánh','Băng'],['Nguyễn Thị','Cúc'],['Trần Thế','Dũng'],['Phạm Thị Mỹ','Duyên'],['Đinh Văn','Giang'],['Hoàng Thị','Giang'],['Nguyễn Ngọc','Hà'],['Hoàng Việt','Hoàng'],['Dương Thị Thu','Hương'],['Phạm Hoàng Quỳnh','Hương'],['Hoàng Thị Mai','Loan'],['Phạm Trần Quang','Long'],['Trần Đình','Long'],['Nguyễn Nhật','Minh'],['Trần Thị Hà','My'],['Dương Bảo','Ngọc'],['Nguyễn Thảo','Ngọc'],['Nguyễn Phú An','Nhàn'],['Phạm Thị Thanh','Nhàn'],['Nguyễn Thị Thảo','Nhi'],['Lê Lan','Phương'],['Trần Thị Diểm','Quỳnh'],['Hoàng Văn','Sơn'],['Nguyễn Hoàng','Sơn'],['Trần Thị Mai','Sương'],['Nguyễn Tấn','Tài'],['Hoàng Thanh','Tâm'],['Lưu Đức','Thành'],['Hà Anh','Thư'],['Phạm Doãn Kim','Thư'],['Phạm Ngọc Anh','Thư'],['Nguyễn Trần Anh','Thương'],['Phan Thị Thanh','Tình'],['Lê Thị','Trang'],['Trần Nguyễn Hà','Trang'],['Trần Thu','Trang'],['Nguyễn Lê Bảo','Trâm'],['Nguyễn Dương Cẩm','Tú'],['Hoàng Lương','Vũ']
  ]
  const names_12A8 = pairs_12A8.map(([a,b]) => `${a} ${b}`.replace(/\s+/g,' ').trim())

  const names_12A1 = [
    'Lê Nhật Anh','Nguyễn Minh Nhật Anh','Nguyễn Tuấn Anh','Doãn Trần Bảo Châu','Hà Tiến Đạt','Nguyễn Thành Đạt','Nguyễn Viết Doanh','Võ Hoàng Nhật Dương','Hoàng Trung Hiếu','Trần Phan Minh Hoài','Lê Huy Hoàng','Ngô Phi Hùng','Nguyễn Tuấn Khang','Trần Tùng Kha','Nguyễn Đăng Khôi','Ngô Xuân Ngọc Lâm','Bùi Nữ Khánh Linh','Hoàng Nguyễn Hải Linh','Phan Uyên Ly','Hà Thị Ngọc Mai','Dương Trần Bình Minh','Nguyễn Hữu Hoàng Nam','Hoàng Minh Nghĩa','Đinh Yến Ngọc','Nguyễn Thị Anh Ngọc','Trần Tấn Nhật','Nguyễn Yến Nhi','Nguyễn Trần Quỳnh Như','Nguyễn Khánh Phong','Nguyễn Minh Quân','Phan Hồng Quân','Bùi Sang Sang','Nguyễn Cảnh Đức Thắng','Nguyễn Đức Thuật','Hồ Ngọc Bảo Trâm','Nguyễn Thị Bảo Trâm','Phạm Thuỳ Trang','Nguyễn Thị Việt Trinh','Lê Quang Tuấn','Trần Anh Tú','Trần Thanh Văn','Ngô Anh Vũ'
  ]

  await seedClass('11 A8', names_11A8, '11a8.', '11A8@2025')
  await seedClass('12 A8', names_12A8, '12a8.', '12A8@2025')
  await seedClass('12 A6', names_12A6, '12a6.', '12A6@2025')
  await seedClass('12 A1', names_12A1, '12a1.', '12A1@2025')

  const classesQ = await pool.query("SELECT id, name FROM classes WHERE name IN ('11 A8','12 A8','12 A6','12 A1')")
  const classMap = new Map(classesQ.rows.map(r => [r.name, r.id]))

  function isoDateTime(dstr, h) {
    const d = new Date(dstr)
    const base = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), h || 9, 0, 0))
    return base
  }

  async function createExercise(title) {
    const q = `INSERT INTO exercises (title, description, mode, question, opt_a, opt_b, opt_c, opt_d, answer, explain_a, explain_b, explain_c, explain_d, ai_solution, grade_level, difficulty, topic) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING id`
    const r = await pool.query(q, [title, null, 'manual', '2 + 3 = ?', '5', '4', '6', '7', 'A', 'Vì 2+3=5', null, null, null, null, null, 'easy', 'Số học cơ bản'])
    return r.rows[0].id
  }

  async function assignExercise(className, assignedStr, hoursDue) {
    const classId = classMap.get(className)
    if (!classId) return null
    const exId = await createExercise(`Bài tập tuần - ${className} - ${assignedStr}`)
    const assignedAt = isoDateTime(assignedStr, 9)
    const dueAt = new Date(assignedAt.getTime() + (hoursDue || 12) * 3600000)
    const r = await pool.query('INSERT INTO assignments (class_id, exercise_id, assigned_at, due_at) VALUES ($1,$2,$3,$4) RETURNING id', [classId, exId, assignedAt, dueAt])
    return { assignmentId: r.rows[0].id, classId, exerciseId: exId, assignedAt, dueAt }
  }

  async function studentsOfClass(className) {
    const classId = classMap.get(className)
    const r = await pool.query('SELECT id FROM students WHERE class_id=$1 ORDER BY id ASC', [classId])
    return r.rows.map(x => x.id)
  }

  function pick(ids, n) {
    const a = ids.slice()
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t }
    return a.slice(0, Math.max(0, Math.min(n, a.length)))
  }

  async function submitFor(className, exerciseId, assignedAt, dueAt, completionRate, onTimeRate) {
    const ids = await studentsOfClass(className)
    const total = ids.length
    const completedCount = Math.round(total * completionRate)
    const onTimeCount = Math.min(completedCount, Math.round(total * onTimeRate))
    const lateCount = Math.max(0, completedCount - onTimeCount)
    const onList = pick(ids, onTimeCount)
    const rest = ids.filter(x => !onList.includes(x))
    const lateList = pick(rest, lateCount)
    for (const sid of onList) {
      const t = new Date(dueAt.getTime() - Math.floor(Math.random() * 4 + 1) * 3600000)
      const sel = ['A','B','C','D'][Math.floor(Math.random()*4)]
      const correct = sel === 'A'
      const stars = (correct ? 2 : 1) + 1
      const streakDelta = 1
      const grade = correct ? (8 + Math.floor(Math.random()*3)) : (6 + Math.floor(Math.random()*3))
      const nudge = correct ? 'Tiếp tục phát huy' : 'Ôn lại dạng này'
      const sticker = correct ? 'star' : 'snail'
      await pool.query('INSERT INTO submissions (student_id, exercise_id, selected, is_correct, submitted_at, autograded, stars, streak_delta, grade, nudge, sticker) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [sid, exerciseId, sel, correct, t, true, stars, streakDelta, grade, nudge, sticker])
    }
    for (const sid of lateList) {
      const t = new Date(dueAt.getTime() + Math.floor(Math.random() * 6 + 1) * 3600000)
      const sel = ['A','B','C','D'][Math.floor(Math.random()*4)]
      const correct = sel === 'A'
      const stars = (correct ? 2 : 1)
      const streakDelta = 0
      const grade = correct ? (7 + Math.floor(Math.random()*2)) : (5 + Math.floor(Math.random()*3))
      const nudge = 'Cần chú ý thời hạn'
      const sticker = 'clock'
      await pool.query('INSERT INTO submissions (student_id, exercise_id, selected, is_correct, submitted_at, autograded, stars, streak_delta, grade, nudge, sticker) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)', [sid, exerciseId, sel, correct, t, true, stars, streakDelta, grade, nudge, sticker])
    }
    await pool.query('UPDATE students s SET stars = COALESCE((SELECT SUM(stars) FROM submissions sub WHERE sub.student_id=s.id), 0), streak = COALESCE((SELECT SUM(streak_delta) FROM submissions sub WHERE sub.student_id=s.id), 0)')
  }

  const w1 = '2025-09-22'
  const w2a = '2025-09-30'
  const w2b = '2025-10-03'
  const weeks = [
    { start: '2025-10-06', rateC: 0.50, rateT: 0.25 },
    { start: '2025-10-13', rateC: 0.60, rateT: 0.35 },
    { start: '2025-10-20', rateC: 0.70, rateT: 0.45 },
    { start: '2025-10-27', rateC: 0.75, rateT: 0.55 },
    { start: '2025-11-03', rateC: 0.80, rateT: 0.60 },
    { start: '2025-11-10', rateC: 0.88, rateT: 0.78 }
  ]

  const a11 = await assignExercise('11 A8', w2a, 12)
  if (a11) await submitFor('11 A8', a11.exerciseId, a11.assignedAt, a11.dueAt, 0.43, 0.18)
  for (const cn of ['12 A1','12 A6','12 A8']) {
    const a12 = await assignExercise(cn, w2b, 12)
    if (a12) await submitFor(cn, a12.exerciseId, a12.assignedAt, a12.dueAt, 0.43, 0.18)
  }

  for (const w of weeks) {
    for (const cn of ['11 A8','12 A1','12 A6','12 A8']) {
      const as = await assignExercise(cn, w.start, 12)
      if (as) await submitFor(cn, as.exerciseId, as.assignedAt, as.dueAt, w.rateC, w.rateT)
    }
  }

  async function computeWeeklyStats(ws) {
    const q = `
      WITH week AS (
        SELECT $1::date AS week_start, ($1::date + INTERVAL '7 days') AS week_end
      ),
      classes AS (
        SELECT c.id, c.name FROM classes c
      ),
      stu AS (
        SELECT s.id, s.class_id FROM students s
      ),
      active AS (
        SELECT st.class_id, COUNT(DISTINCT st.id)::int AS active_students
        FROM submissions sub
        JOIN stu st ON st.id=sub.student_id
        JOIN week w ON true
        WHERE sub.submitted_at >= w.week_start AND sub.submitted_at < w.week_end
        GROUP BY st.class_id
      ),
      weekly_assign AS (
        SELECT a.id, a.exercise_id, a.class_id, a.due_at
        FROM assignments a
        JOIN week w ON true
        WHERE a.assigned_at >= w.week_start AND a.assigned_at < w.week_end
      ),
      first_subs AS (
        SELECT st.class_id, sub.student_id, sub.exercise_id, MIN(sub.submitted_at) AS first_submitted
        FROM submissions sub
        JOIN stu st ON st.id=sub.student_id
        JOIN weekly_assign wa ON wa.exercise_id=sub.exercise_id AND wa.class_id=st.class_id
        JOIN week w ON true
        WHERE sub.submitted_at < w.week_end
        GROUP BY st.class_id, sub.student_id, sub.exercise_id
      ),
      completed AS (
        SELECT class_id, COUNT(DISTINCT student_id)::int AS completed_students FROM first_subs GROUP BY class_id
      ),
      on_time AS (
        SELECT fs.class_id, COUNT(DISTINCT fs.student_id)::int AS on_time_students
        FROM first_subs fs JOIN weekly_assign wa ON wa.exercise_id=fs.exercise_id AND wa.class_id=fs.class_id
        WHERE wa.due_at IS NOT NULL AND fs.first_submitted <= wa.due_at
        GROUP BY fs.class_id
      ),
      late AS (
        SELECT fs.class_id, COUNT(DISTINCT fs.student_id)::int AS late_students
        FROM first_subs fs JOIN weekly_assign wa ON wa.exercise_id=fs.exercise_id AND wa.class_id=fs.class_id
        WHERE wa.due_at IS NOT NULL AND fs.first_submitted > wa.due_at
        GROUP BY fs.class_id
      )
      SELECT c.id AS class_id, c.name AS class_name,
             (SELECT COUNT(*)::int FROM students s WHERE s.class_id=c.id) AS total_students,
             COALESCE(a.active_students,0)::int AS active_students,
             COALESCE(co.completed_students,0)::int AS completed_students,
             COALESCE(ot.on_time_students,0)::int AS on_time_students,
             COALESCE(lt.late_students,0)::int AS late_students
      FROM classes c
      LEFT JOIN active a ON a.class_id=c.id
      LEFT JOIN completed co ON co.class_id=c.id
      LEFT JOIN on_time ot ON ot.class_id=c.id
      LEFT JOIN late lt ON lt.class_id=c.id
      ORDER BY c.name ASC
    `
    const rows = (await pool.query(q, [ws])).rows
    for (const r of rows) {
      await pool.query(
        `INSERT INTO weekly_stats (week_start, class_id, total_students, active_students, completed_students, on_time_students, late_students)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (class_id, week_start) DO UPDATE SET
           total_students=EXCLUDED.total_students,
           active_students=EXCLUDED.active_students,
           completed_students=EXCLUDED.completed_students,
           on_time_students=EXCLUDED.on_time_students,
           late_students=EXCLUDED.late_students`,
        [ws, r.class_id, r.total_students||0, r.active_students||0, r.completed_students||0, r.on_time_students||0, r.late_students||0]
      )
    }
  }

  const weeklyStarts = ['2025-09-29','2025-10-06','2025-10-13','2025-10-20','2025-10-27','2025-11-03','2025-11-10']
  for (const ws of weeklyStarts) await computeWeeklyStats(ws)

  async function seedSurveyWeek1() {
    const w = '2025-09-22'
    for (const cn of ['11 A8','12 A1','12 A6','12 A8']) {
      const classId = classMap.get(cn)
      if (!classId) continue
      const cntQ = await pool.query('SELECT COUNT(*)::int AS cnt FROM students WHERE class_id=$1', [classId])
      const total = cntQ.rows[0]?.cnt || 0
      await pool.query(
        `INSERT INTO surveys (class_id, week_start, surveyed_students, self_disciplined, not_self_disciplined, late_rate_pct)
         VALUES ($1,$2,$3,$4,$5,$6)
         ON CONFLICT (class_id, week_start) DO UPDATE SET surveyed_students=EXCLUDED.surveyed_students, self_disciplined=EXCLUDED.self_disciplined, not_self_disciplined=EXCLUDED.not_self_disciplined, late_rate_pct=EXCLUDED.late_rate_pct`,
        [classId, w, total, 0, total, 60]
      )
    }
  }
  await seedSurveyWeek1()

  async function seedSurveysProgressive() {
    const plans = [
      { start: '2025-09-29', selfRate: 0.40, latePct: 45 },
      { start: '2025-10-06', selfRate: 0.50, latePct: 40 },
      { start: '2025-10-13', selfRate: 0.60, latePct: 35 },
      { start: '2025-10-20', selfRate: 0.70, latePct: 30 },
      { start: '2025-10-27', selfRate: 0.75, latePct: 25 },
      { start: '2025-11-03', selfRate: 0.80, latePct: 22 },
      { start: '2025-11-10', selfRate: 0.85, latePct: 18 }
    ]
    for (const p of plans) {
      for (const cn of ['11 A8','12 A1','12 A6','12 A8']) {
        const classId = classMap.get(cn)
        if (!classId) continue
        const cntQ = await pool.query('SELECT COUNT(*)::int AS cnt FROM students WHERE class_id=$1', [classId])
        const total = cntQ.rows[0]?.cnt || 0
        const self = Math.max(0, Math.min(total, Math.round(total * p.selfRate)))
        const notSelf = Math.max(0, total - self)
        await pool.query(
          `INSERT INTO surveys (class_id, week_start, surveyed_students, self_disciplined, not_self_disciplined, late_rate_pct)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (class_id, week_start) DO UPDATE SET surveyed_students=EXCLUDED.surveyed_students, self_disciplined=EXCLUDED.self_disciplined, not_self_disciplined=EXCLUDED.not_self_disciplined, late_rate_pct=EXCLUDED.late_rate_pct`,
          [classId, p.start, total, self, notSelf, p.latePct]
        )
      }
    }
  }
  await seedSurveysProgressive()

  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
