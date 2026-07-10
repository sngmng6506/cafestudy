import cron from 'node-cron';

const DEFAULT_SCHEDULE = '30 3 * * *';
const BATCH_SIZE = 100;

export function registerBadgeGarbageCollection({ db, storage }) {
  if (process.env.NODE_ENV === 'test') return;
  if (storage.status?.().configured === false) {
    console.warn('[badges] GC 건너뜀: 이미지 스토리지가 설정되지 않았습니다.');
    return;
  }

  const schedule = process.env.BADGE_GC_SCHEDULE ?? DEFAULT_SCHEDULE;
  if (!cron.validate(schedule)) {
    console.error(`[badges] 유효하지 않은 BADGE_GC_SCHEDULE: "${schedule}"`);
    return;
  }

  let running = false;
  const run = async () => {
    if (running) return;
    running = true;

    try {
      let removedCount = 0;

      while (true) {
        const result = await db.query(
          `
            SELECT b.id, b.image_object_key AS "imageObjectKey"
            FROM badges b
            WHERE NOT EXISTS (
              SELECT 1 FROM user_badges ub WHERE ub.badge_id = b.id
            )
            ORDER BY b.created_at
            LIMIT $1
          `,
          [BATCH_SIZE],
        );

        if (result.rows.length === 0) break;

        for (const badge of result.rows) {
          // S3 삭제는 idempotent하다. DB 삭제가 실패하더라도 다음 GC에서 재시도할 수
          // 있도록 이미지부터 지운 뒤, 여전히 미참조 상태인 경우에만 DB 행을 삭제한다.
          if (badge.imageObjectKey) {
            await storage.deleteObject(badge.imageObjectKey);
          }

          const deleted = await db.query(
            `
              DELETE FROM badges b
              WHERE b.id = $1
                AND NOT EXISTS (
                  SELECT 1 FROM user_badges ub WHERE ub.badge_id = b.id
                )
              RETURNING b.id
            `,
            [badge.id],
          );
          removedCount += deleted.rowCount;
        }

        if (result.rows.length < BATCH_SIZE) break;
      }

      if (removedCount > 0) {
        console.log(`[badges] 고아 뱃지 GC 완료: ${removedCount}개 삭제`);
      }
    } catch (error) {
      console.error('[badges] 고아 뱃지 GC 오류:', error.message);
    } finally {
      running = false;
    }
  };

  // 기존에 누적된 고아 데이터도 배포 직후 정리한다.
  void run();
  cron.schedule(run, schedule, { timezone: 'Asia/Seoul' });
  console.log(`[badges] GC 스케줄 등록: "${schedule}" (Asia/Seoul)`);
}
