import 'dotenv/config';
import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.join(__dirname, '../migrations');
let lockClient;
let pool;

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });
  }
  return pool;
}

// 배포 시작 커맨드에서 매번 실행되므로(이미 적용된 마이그레이션은 skip돼 무해),
// 롤링 디플로이 등으로 두 프로세스가 동시에 뜰 경우를 대비해 advisory lock으로 직렬화.
const MIGRATION_LOCK_KEY = 727_2001; // 임의의 고정 정수(앱 전용 네임스페이스)

// SQL 텍스트의 checksum. 적용된 마이그레이션이 이후 수정됐는지 감지하는 데 쓴다.
export function migrationChecksum(sql) {
  return createHash('sha256').update(sql).digest('hex');
}

// 적용 기록(applied)과 현재 파일 checksum을 비교해 다음 행동을 결정한다.
// 반환: { action: 'apply' | 'skip' | 'error', message? }
// - 미적용: apply
// - 적용됐고 checksum 동일(또는 checksum 미기록): skip
// - 적용됐는데 checksum 불일치: error (적용된 파일이 수정됨)
export function decideMigration(applied, checksum, filename) {
  if (!applied) return { action: 'apply' };
  if (applied.checksum && applied.checksum !== checksum) {
    return {
      action: 'error',
      message:
        `[migrate] 이미 적용된 마이그레이션이 수정되었습니다: ${filename}\n` +
        '적용된 마이그레이션 파일은 수정하지 마세요. 변경이 필요하면 새 마이그레이션 파일을 추가하세요.',
    };
  }
  return { action: 'skip' };
}

// 스크립트로 직접 실행할 때만 마이그레이션을 돌린다.
// (테스트가 순수 함수만 import 할 때는 이 블록이 실행되지 않도록 가드.)
const isMain = process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isMain) {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL is required to run migrations.');
    process.exit(1);
  }
  await runMigrations();
}

async function runMigrations() {
  try {
    await acquireLock();
    await ensureMigrationsTable();
    const files = (await readdir(migrationsDir))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    for (const file of files) {
      const sql = await readFile(path.join(migrationsDir, file), 'utf8');
      const checksum = migrationChecksum(sql);

      const applied = await appliedRow(file);
      const decision = decideMigration(applied, checksum, file);

      if (decision.action === 'error') throw new Error(decision.message);
      if (decision.action === 'skip') {
        console.log(`skip ${file}`);
        continue;
      }

      await applyMigration(file, sql, checksum);
    }
  } finally {
    await releaseLock();
    await getPool().end();
  }
}

async function acquireLock() {
  // pg_advisory_lock은 세션(커넥션) 단위로 유효하므로, pool.query가 아니라
  // 전용 client를 하나 고정해서 잡고 있어야 한다.
  lockClient = await getPool().connect();
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
  await getPool().query(`
    CREATE TABLE IF NOT EXISTS _migrations (
      id serial PRIMARY KEY,
      filename text NOT NULL UNIQUE,
      checksum text,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);
  // 기존 테이블에 checksum 컬럼이 없으면 추가 (이미 배포된 환경 호환).
  await getPool().query('ALTER TABLE _migrations ADD COLUMN IF NOT EXISTS checksum text');
}

async function appliedRow(filename) {
  const result = await getPool().query(
    'SELECT checksum FROM _migrations WHERE filename = $1',
    [filename],
  );
  return result.rows[0] ?? null;
}

async function applyMigration(filename, sql, checksum) {
  const client = await getPool().connect();

  try {
    console.log(`apply ${filename}`);
    await client.query('BEGIN');
    await client.query(sql);
    await client.query(
      'INSERT INTO _migrations (filename, checksum) VALUES ($1, $2)',
      [filename, checksum],
    );
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
