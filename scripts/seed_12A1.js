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

  const className = '12 A1'
  const classId = await getOrCreateClass(className)

  const names = [
    'Lê Nhật Anh',
    'Nguyễn Minh Nhật Anh',
    'Nguyễn Tuấn Anh',
    'Doãn Trần Bảo Châu',
    'Hà Tiến Đạt',
    'Nguyễn Thành Đạt',
    'Nguyễn Viết Doanh',
    'Võ Hoàng Nhật Dương',
    'Hoàng Trung Hiếu',
    'Trần Phan Minh Hoài',
    'Lê Huy Hoàng',
    'Ngô Phi Hùng',
    'Nguyễn Tuấn Khang',
    'Trần Tùng Kha',
    'Nguyễn Đăng Khôi',
    'Ngô Xuân Ngọc Lâm',
    'Bùi Nữ Khánh Linh',
    'Hoàng Nguyễn Hải Linh',
    'Phan Uyên Ly',
    'Hà Thị Ngọc Mai',
    'Dương Trần Bình Minh',
    'Nguyễn Hữu Hoàng Nam',
    'Hoàng Minh Nghĩa',
    'Đinh Yến Ngọc',
    'Nguyễn Thị Anh Ngọc',
    'Trần Tấn Nhật',
    'Nguyễn Yến Nhi',
    'Nguyễn Trần Quỳnh Như',
    'Nguyễn Khánh Phong',
    'Nguyễn Minh Quân',
    'Phan Hồng Quân',
    'Bùi Sang Sang',
    'Nguyễn Cảnh Đức Thắng',
    'Nguyễn Đức Thuật',
    'Hồ Ngọc Bảo Trâm',
    'Nguyễn Thị Bảo Trâm',
    'Phạm Thuỳ Trang',
    'Nguyễn Thị Việt Trinh',
    'Lê Quang Tuấn',
    'Trần Anh Tú',
    'Trần Thanh Văn',
    'Ngô Anh Vũ'
  ]

  const taken = await existingUsernames()
  const prefix = '12a1.'
  const tempPassword = '12A1@2025'
  const passwordHash = await bcrypt.hash(tempPassword, 10)

  const created = []
  for (const name of names) {
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

