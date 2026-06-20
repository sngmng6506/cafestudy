import pg from 'pg';

const { Pool } = pg;

export function createDb({ connectionString }) {
  if (!connectionString) {
    console.warn('DATABASE_URL is not set. Database-backed routes will fail until configured.');
  }

  const pool = new Pool({
    connectionString,
    ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
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
