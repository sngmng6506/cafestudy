import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, '../migrations');
let lockClient;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required to run migrations.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

// 배포 시작 커맨드에서 매번 실행되므로(이미 적용된 마이그레이션은 skip돼 무해),
// 롤링 디플로이 등으로 두 프로세스가 동시에 뜰 경우를 대비해 advisory lock으로 직렬화.
const MIGRATION_LOCK_KEY = 727_2001; // 임의의 고정 정수(앱 전용 네임스페이스)

try {
  await acquireLock();
  await ensureMigrationsTable();
  const files = (await readdir(migrationsDir))
    .filter((file) => file.endsWith('.sql'))
    .sort();

  for (const file of files) {
    const alreadyApplied = await isApplied(file);

    if (alreadyApplied) {
      console.log(`skip ${file}`);
      continue;
    }

    await applyMigration(file);
  }
} finally {
  await releaseLock();
  await pool.end();
}

async function acquireLock() {
  // pg_advisory_lock은 세션(커넥션) 단위로 유효하므로, pool.query가 아니라
  // 전용 client를 하나 고정해서 잡고 있어야 한다.
  lockClient = await pool.connect();
  console.log('[migrate] advisory lock 대기 중...');
  await lockClient.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
  console.log('[migrate] advisory lock 획득');
}

async function releaseLock() {
  if (!lockClient) return;
  try {
    await lockClient.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY]);
  } finally {
    lockClient.release();
  }
}

async function ensureMigrationsTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id serial PRIMARY KEY,
      filename text NOT NULL UNIQUE,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
}

async function isApplied(filename) {
  const result = await pool.query('SELECT 1 FROM _migrations WHERE filename = $1', [filename]);
  return result.rowCount > 0;
}

async function applyMigration(filename) {
  const client = await pool.connect();
  const sql = await readFile(path.join(migrationsDir, filename), 'utf8');

  try {
    console.log(`apply ${filename}`);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query('INSERT INTO _migrations (filename) VALUES ($1)', [filename]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
