import cron from 'node-cron';

const DEFAULT_SCHEDULE = '30 3 * * *';
const BATCH_SIZE = 100;

export function registerBadgeGarbageCollection({ db, storage, config }) {
  if (config?.env === 'test') return;
  if (!storage || storage.status?.().configured === false) return;

  const schedule = config?.badges?.gcSchedule ?? DEFAULT_SCHEDULE;
  if (!cron.validate(schedule)) {
    console.error(`[badges] 유효하지 않은 BADGE_GC_SCHEDULE: "${schedule}"`);
    return;
  }

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      await db.query(
        `UPDATE badge_generations SET status = 'failed', error_message = 'stale_processing'
          WHERE status = 'processing' AND created_at < now() - interval '30 minutes'`,
      );

      const generations = await db.query(
        `SELECT id, image_object_key AS "imageObjectKey"
           FROM badge_generations
          WHERE (status = 'failed' AND created_at < now() - interval '1 day')
             OR (status = 'preview' AND created_at < now() - interval '7 days')
          ORDER BY created_at LIMIT $1`,
        [BATCH_SIZE],
      );
      for (const generation of generations.rows) {
        if (generation.imageObjectKey && !generation.imageObjectKey.startsWith('pending:')) {
          await storage.deleteObject(generation.imageObjectKey).catch(() => {});
        }
        await db.query(
          `DELETE FROM badge_generations
            WHERE id = $1 AND status IN ('failed', 'preview')`,
          [generation.id],
        );
      }

      const badges = await db.query(
        `SELECT b.id, b.image_object_key AS "imageObjectKey"
           FROM badges b
          WHERE NOT EXISTS (SELECT 1 FROM user_badges ub WHERE ub.badge_id = b.id)
          ORDER BY b.created_at LIMIT $1`,
        [BATCH_SIZE],
      );
      for (const badge of badges.rows) {
        if (badge.imageObjectKey) await storage.deleteObject(badge.imageObjectKey).catch(() => {});
        await db.query(
          `DELETE FROM badges b WHERE b.id = $1
            AND NOT EXISTS (SELECT 1 FROM user_badges ub WHERE ub.badge_id = b.id)`,
          [badge.id],
        );
      }
    } catch (error) {
      console.error('[badges] GC 오류:', error.message);
    } finally {
      running = false;
    }
  };

  void run();
  cron.schedule(schedule, run, { timezone: 'Asia/Seoul' });
}
