import dotenv from 'dotenv'
import pkg from 'pg'

dotenv.config()

const { Pool } = pkg

function createPool() {
  const { DATABASE_URL, PGHOST, PGPORT, PGDATABASE, PGUSER, PGPASSWORD, SSL_MODE } = process.env
  const configFromUrl = DATABASE_URL
    ? { connectionString: DATABASE_URL, ssl: SSL_MODE === 'require' ? { rejectUnauthorized: false } : undefined }
    : null

  const configFromParts = PGHOST && PGDATABASE && PGUSER
    ? {
        host: PGHOST,
        port: PGPORT ? parseInt(PGPORT, 10) : 5432,
        database: PGDATABASE,
        user: PGUSER,
        password: PGPASSWORD,
        ssl: SSL_MODE === 'require' ? { rejectUnauthorized: false } : undefined
      }
    : null

  const config = configFromUrl || configFromParts
  if (!config) return null
  return new Pool(config)
}

export const pool = createPool()

export async function ensureSchema() {
  if (!pool) return
  await pool.query(`
    SET search_path TO public;

    CREATE TABLE IF NOT EXISTS teachers (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS students (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      email TEXT,
      password_hash TEXT NOT NULL,
      name TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS classes (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      name TEXT NOT NULL,
      locked BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE students ADD COLUMN IF NOT EXISTS username TEXT;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS class_id INT REFERENCES classes(id) ON DELETE SET NULL;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS streak INT DEFAULT 0;
    ALTER TABLE students ADD COLUMN IF NOT EXISTS stars INT DEFAULT 0;
    CREATE UNIQUE INDEX IF NOT EXISTS students_username_uq ON students(username);

    CREATE TABLE IF NOT EXISTS exercises (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS mode TEXT;
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS question TEXT;
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS opt_a TEXT;
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS opt_b TEXT;
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS opt_c TEXT;
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS opt_d TEXT;
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS answer CHAR(1);
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS explain_a TEXT;
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS explain_b TEXT;
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS explain_c TEXT;
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS explain_d TEXT;
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS ai_solution TEXT;
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS grade_level INT;
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS difficulty TEXT;
    ALTER TABLE exercises ADD COLUMN IF NOT EXISTS topic TEXT;

    CREATE TABLE IF NOT EXISTS assignments (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      class_id INT REFERENCES classes(id) ON DELETE CASCADE,
      exercise_id INT REFERENCES exercises(id) ON DELETE CASCADE,
      assigned_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS submissions (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      student_id INT REFERENCES students(id) ON DELETE CASCADE,
      exercise_id INT REFERENCES exercises(id) ON DELETE CASCADE,
      content TEXT,
      submitted_at TIMESTAMPTZ DEFAULT NOW(),
      grade INT,
      feedback TEXT,
      graded_at TIMESTAMPTZ,
      selected CHAR(1),
      is_correct BOOLEAN,
      autograded BOOLEAN,
      explanation TEXT,
      nudge TEXT,
      sticker TEXT,
      stars INT DEFAULT 0,
      streak_delta INT DEFAULT 0
    );

    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS images TEXT[];
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS selected CHAR(1);
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS is_correct BOOLEAN;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS autograded BOOLEAN;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS explanation TEXT;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS nudge TEXT;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS sticker TEXT;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS stars INT DEFAULT 0;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS streak_delta INT DEFAULT 0;
    ALTER TABLE submissions ADD COLUMN IF NOT EXISTS content TEXT;
    CREATE TABLE IF NOT EXISTS learning_plans (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      class_id INT REFERENCES classes(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      start_at TIMESTAMPTZ,
      end_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS plan_items (
      id INTEGER GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
      plan_id INT REFERENCES learning_plans(id) ON DELETE CASCADE,
      topic TEXT,
      skill TEXT,
      difficulty TEXT,
      count INT DEFAULT 1,
      due_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
  `)
}
