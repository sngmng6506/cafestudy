// 목록 응답 rows에 대표 뱃지 이미지의 presigned URL을 붙이는 공용 헬퍼.
// members/ranking/dice/meetups처럼 "사람 목록"을 반환하는 feature들이 함께 쓴다.
// (feature 간 직접 import는 금지지만 shared/는 공용 — AGENTS.md 참고)
//
// rows의 keyField(S3 object key)를 제거하고 urlField(서명된 URL 또는 null)로
// 바꾼 새 배열을 반환한다. 같은 key는 요청 내에서 한 번만 서명한다.
export async function attachBadgeImageUrls(
  storage,
  rows,
  { keyField = 'activeBadgeObjectKey', urlField = 'activeBadgeImageUrl' } = {},
) {
  const signed = new Map();

  return Promise.all(
    (rows ?? []).map(async (row) => {
      const { [keyField]: objectKey, ...rest } = row;
      if (!objectKey) return { ...rest, [urlField]: null };

      if (!signed.has(objectKey)) {
        signed.set(objectKey, storage.createDownloadUrl(objectKey));
      }
      return { ...rest, [urlField]: await signed.get(objectKey) };
    }),
  );
}
