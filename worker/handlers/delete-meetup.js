import path from 'node:path';
import { ManualReviewError } from '../errors.js';
import {
  DEFAULT_TARGET_GROUP_NAME,
  assertDeviceTimezone,
  assertScheduledAtIsFuture,
  captureEvidence,
  findByResourceId,
  formatKoreanDate,
  formatKoreanTime,
  launchApp,
  openJoinedGroup,
  readScreen,
  scrollUntilFound,
  sleep,
  tap,
  toKstParts,
} from '../somoim-app.js';

// 정기모임 섹션의 정모 카드를 찾는다. 카드마다 이름(name_text)과 우상단 편집
// 버튼(edit_text_layout)이 있고, 편집을 눌러야 정모 수정 화면으로 들어간다.
//
// 카드의 `취소` 버튼(join_text)은 삭제가 아니다. 누르면 "정모 참석을
// 취소하시겠습니까?"가 뜬다 — 참석만 취소되고 정모는 남는다. 실기기에서 확인했다.
export function matchEventCard(nodes, title) {
  const name = nodes.find((n) => n.resourceId.endsWith('/name_text') && n.text === title);
  if (!name) return null;

  // 같은 카드에 속한 편집 버튼은 이름과 세로로 가까운 것이다. 카드가 여러 개일 때
  // 엉뚱한 카드의 편집을 누르면 다른 정모를 지우게 되므로 위치로 짝을 짓는다.
  const editButton = nodes
    .filter((n) => n.resourceId.endsWith('/edit_text_layout') && n.center)
    .map((n) => ({ node: n, distance: Math.abs(n.center.y - name.center.y) }))
    .sort((a, b) => a.distance - b.distance)[0];
  if (!editButton || editButton.distance > 200) return null;

  return { name, editButton: editButton.node };
}

// 정기모임 섹션은 클럽 홈 중간에 있어 스크롤해야 나온다. 위에서부터 훑는다.
async function scrollToEventCard(adb, deviceId, artifactDir, title) {
  for (let i = 0; i < 5; i += 1) {
    await adb.shell(deviceId, ['input', 'swipe', '1280', '500', '1280', '1300', '200']);
  }
  await sleep(800);

  for (let i = 0; i < 10; i += 1) {
    const nodes = await readScreen(adb, deviceId, artifactDir);
    const card = matchEventCard(nodes, title);
    if (card) return card;
    await adb.shell(deviceId, ['input', 'swipe', '1280', '1200', '1280', '700', '250']);
    await sleep(800);
  }
  return null;
}

// 클럽 홈 탭으로 이동한다. 클럽을 열면 마지막에 보던 하위 탭으로 들어가므로
// 정기모임 섹션이 있는 홈으로 옮겨야 한다.
async function openClubHome(adb, deviceId, artifactDir, targetGroupName) {
  let nodes = await readScreen(adb, deviceId, artifactDir);
  const homeTab = nodes.find((n) => n.text === '홈');
  if (homeTab) {
    await tap(adb, deviceId, homeTab.center);
    await sleep(1000);
    nodes = await readScreen(adb, deviceId, artifactDir);
  }
  if (!nodes.some((n) => n.text === targetGroupName)) {
    throw new ManualReviewError('Did not land on the target group page', {
      stage: 'open_group_page',
      expected: targetGroupName,
      onScreen: nodes.filter((n) => n.text).slice(0, 8).map((n) => n.text),
    });
  }
}

// 소모임 앱에서 정모를 지운다. 실기기에서 확인한 경로다:
//   클럽 홈 → 정기모임 섹션의 정모 카드 → 카드 우상단 편집 → 정모 수정 화면
//   → 정모 삭제하기 → "삭제" 확인
export function createDeleteMeetupHandler({
  adb,
  artifactDir = './worker-artifacts',
  targetGroupName = DEFAULT_TARGET_GROUP_NAME,
} = {}) {
  return async function deleteMeetup({ payload, deviceId, mode, jobId, onBeforeSubmit }) {
    if (mode !== 'dryRun' && mode !== 'submit') {
      throw new ManualReviewError(`Unknown mode "${mode}"`, { stage: 'validate_mode' });
    }
    if (!payload?.title || !payload?.scheduledAt) {
      throw new ManualReviewError('payload is missing required fields', { stage: 'validate_payload' });
    }

    const target = toKstParts(payload.scheduledAt);
    // 지난 정모는 정기모임 섹션에 없다. 지우려면 다른 화면이 필요한데 확인한 적이
    // 없으므로 추측하지 않고 사람에게 넘긴다.
    assertScheduledAtIsFuture(payload.scheduledAt);

    const jobArtifactDir = jobId ? path.join(artifactDir, String(jobId)) : artifactDir;

    await assertDeviceTimezone(adb, deviceId);
    await launchApp(adb, deviceId, jobArtifactDir);
    const groupName = await openJoinedGroup(adb, deviceId, jobArtifactDir, targetGroupName);
    await openClubHome(adb, deviceId, jobArtifactDir, targetGroupName);

    const card = await scrollToEventCard(adb, deviceId, jobArtifactDir, payload.title);
    if (!card) {
      throw new ManualReviewError(`Event "${payload.title}" not found in 정기모임`, {
        stage: 'find_event',
        title: payload.title,
      });
    }

    await tap(adb, deviceId, card.editButton.center);
    await sleep(1500);

    let nodes = await readScreen(adb, deviceId, jobArtifactDir);
    if (!nodes.some((n) => n.text === '정모 수정')) {
      throw new ManualReviewError('정모 수정 화면이 열리지 않음', { stage: 'open_edit' });
    }

    // 삭제는 되돌릴 수 없다. 제목만 맞으면 지우는 게 아니라 일시까지 대조한다.
    const shown = {
      title: findByResourceId(nodes, 'name_edit')?.text ?? null,
      date: findByResourceId(nodes, 'date_text')?.text ?? null,
      time: findByResourceId(nodes, 'time_text')?.text ?? null,
    };
    const expected = {
      title: payload.title,
      date: formatKoreanDate(target),
      time: formatKoreanTime(target),
    };
    if (shown.title !== expected.title || shown.date !== expected.date || shown.time !== expected.time) {
      throw new ManualReviewError('Edit screen does not match the meetup to delete', {
        stage: 'verify_target',
        expected,
        actual: shown,
      });
    }

    if (mode === 'dryRun') {
      const evidence = await captureEvidence(adb, deviceId, jobArtifactDir, jobId, 'before-delete');
      return { stoppedAt: 'before_delete', groupName, ...evidence };
    }

    nodes = await scrollUntilFound(adb, deviceId, jobArtifactDir, 'delete_button');
    const deleteButton = findByResourceId(nodes, 'delete_button');
    if (!deleteButton) {
      throw new ManualReviewError('정모 삭제하기 버튼을 찾을 수 없음', { stage: 'delete' });
    }

    // create와 같은 규칙이다. 되돌릴 수 없는 동작 직전에 서버에 기록을 남기고,
    // 기록에 실패하면 누르지 않는다(아직 아무것도 지우지 않아 재시도해도 안전하다).
    if (onBeforeSubmit) await onBeforeSubmit();

    await tap(adb, deviceId, deleteButton.center);
    await sleep(1500);

    nodes = await readScreen(adb, deviceId, jobArtifactDir);
    const confirm = nodes.find((n) => n.resourceId.endsWith('/button1') && n.text === '삭제');
    if (!confirm) {
      throw new ManualReviewError('정모 삭제 확인 창이 뜨지 않음', { stage: 'delete' });
    }
    await tap(adb, deviceId, confirm.center);
    await sleep(2000);

    // 눌렀다는 사실을 성공으로 삼지 않는다. 목록에서 사라졌는지 확인한다.
    let gone = false;
    for (let i = 0; i < 3 && !gone; i += 1) {
      gone = (await scrollToEventCard(adb, deviceId, jobArtifactDir, payload.title)) === null;
    }

    const evidence = await captureEvidence(adb, deviceId, jobArtifactDir, jobId, 'after-delete');
    if (!gone) {
      throw new ManualReviewError('삭제한 뒤에도 정모가 목록에 남아 있음', {
        stage: 'delete',
        ...evidence,
      });
    }
    return { stoppedAt: null, deleted: true, groupName, ...evidence };
  };
}
