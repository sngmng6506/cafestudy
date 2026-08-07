import cron from 'node-cron';

const BATCH_SIZE = 100;

export function registerVerificationUploadCleanup({ db, storage, config }) {
  if (config?.env === 'test') return;
  if (!storage || storage.status?.().configured === false) return;

  const schedule = config?.storage?.verificationGcSchedule ?? '15 * * * *';
  const retentionHours = config?.storage?.verificationRetentionHours ?? 24;
  if (!cron.validate(schedule)) {
    console.error(`[verifications] 유효하지 않은 업로드 GC 스케줄: "${schedule}"`);
    return;
  }

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const candidates = await db.query(
        `SELECT id, object_key AS "objectKey"
           FROM verification_uploads
          WHERE status <> 'consumed'
            AND (
              expires_at < now() - interval '10 minutes'
              OR created_at < now() - ($1::int * interval '1 hour')
            )
          ORDER BY created_at
          LIMIT $2`,
        [retentionHours, BATCH_SIZE],
      );

      for (const candidate of candidates.rows) {
        await storage.deleteObject(candidate.objectKey).catch(() => {});
        await db.query(
          `DELETE FROM verification_uploads WHERE id = $1 AND status <> 'consumed'`,
          [candidate.id],
        );
      }
    } catch (error) {
      console.error('[verifications] 업로드 GC 오류:', error.message);
    } finally {
      running = false;
    }
  };

  void run();
  cron.schedule(schedule, run, { timezone: 'Asia/Seoul' });
}
