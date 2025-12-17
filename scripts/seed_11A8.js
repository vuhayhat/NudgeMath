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
  return new Set(r.rows.map(x => x.username))
}

function makeUsername(baseName, prefix, taken) {
  const raw = toAscii(baseName).toLowerCase().replace(/[^a-z0-9\s]/g, '').trim().replace(/\s+/g, '.')
  let u = `${prefix}${raw}`
  let i = 1
  while (taken.has(u)) {
    u = `${prefix}${raw}.${i}`
    i++
  }
  taken.add(u)
  return u
}

async function main() {
  if (!pool) {
    console.error('Không tìm thấy cấu hình database. Kiểm tra biến môi trường hoặc file .env')
    process.exit(1)
  }
  await ensureSchema()

  const className = '11 A8'
  const classId = await getOrCreateClass(className)

  const pairs = [
    ['Hoàng Thị Kiều','Anh'],
    ['Trần Nhựt','Anh'],
    ['Hoàng Kỳ','Anh'],
    ['Trần Mai','Chi'],
    ['Ngô Đình','Du'],
    ['Lê Trung','Đạt'],
    ['Nguyễn Anh','Đức'],
    ['Nguyễn Thị Mỹ','Duyên'],
    ['Doãn Hương','Giang'],
    ['Hoàng Thị Hồng','Hà'],
    ['Lê Thị Thúy','Hằng'],
    ['Cao Đình','Hiệp'],
    ['Lê Viết','Hoàng'],
    ['Trần Xuân','Hùng'],
    ['Nguyễn Ánh','Huyền'],
    ['Trần Thị Khánh','Huyền'],
    ['Nguyễn Thị Minh','Huyền'],
    ['Nguyễn Nhật','Khôi'],
    ['Phan Thị Khánh','Linh'],
    ['Hoàng Nữ Ngọc','Linh'],
    ['Bùi Đình','Long'],
    ['Trần Thị Lê','Na'],
    ['Hoàng Thị Thúy','Ngân'],
    ['Nguyễn Thị Bích','Ngọc'],
    ['Hồ Xuân','Ngọc'],
    ['Lê Trần','Phong'],
    ['Bùi Khánh','Quốc'],
    ['Đỗ Thanh','Sang'],
    ['Trần Lê Công','Thành'],
    ['Lê Thị Phương','Thảo'],
    ['Nguyễn Thị Thanh','Thảo'],
    ['Nguyễn Văn','Thoại'],
    ['Lê Anh','Thư'],
    ['Hoàng Thị Thanh','Thúy'],
    ['Nguyễn Thị Hoài','Thương'],
    ['Dương Thị Huyền','Trang'],
    ['Bùi Thị Diệu','Trinh'],
    ['Phạm Việt','Trinh'],
    ['Trần Thị Ánh','Tuyết'],
    ['Nguyễn Thị Hồng','Uyên'],
    ['Nguyễn Đăng','Văn'],
    ['Phạm Thị Bảo','Yến'],
    ['Nguyễn Song','Hào'],
    ['Hoàng Thị Thảo','Trinh'],
    ['Phạm Minh','Tuấn']
  ]

  const students = pairs.map(([a,b]) => `${a} ${b}`.replace(/\s+/g,' ').trim())

  const taken = await existingUsernames()
  const prefix = '11a8.'
  const tempPassword = '11A8@2025'
  const passwordHash = await bcrypt.hash(tempPassword, 10)

  const created = []
  for (const name of students) {
    const exists = await pool.query('SELECT id, username FROM students WHERE class_id=$1 AND name=$2 LIMIT 1', [classId, name])
    if (exists.rows[0]) {
      created.push({ id: exists.rows[0].id, name, username: exists.rows[0].username })
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
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
