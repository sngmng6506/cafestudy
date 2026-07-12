import pg from 'pg';

const { Pool } = pg;

export function createDb({ connectionString }) {
  if (!connectionString) {
    console.warn('DATABASE_URL is not set. Database-backed routes will fail until configured.');
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    // 원격 DB(Railway)는 유휴 TCP 연결을 끊는다. 서버 쪽이 끊기 전에 우리가 먼저
    // 유휴 클라이언트를 정리하고, keepalive로 중간 장비의 idle reset을 막는다.
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  // 풀에 대기 중인(유휴) 클라이언트의 소켓이 끊기면 'error'가 발생한다.
  // 핸들러가 없으면 프로세스 전체가 죽으므로 로그만 남기고 해당 클라이언트는 버린다.
  pool.on('error', (error) => {
    console.error('Unexpected error on idle database client', error);
  });

  return {
    query: (text, params) => pool.query(text, params),
    transaction: async (callback) => {
      const client = await pool.connect();

      try {
        await client.query('BEGIN');
        const result = await callback(client);
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
    close: () => pool.end(),
  };
}
