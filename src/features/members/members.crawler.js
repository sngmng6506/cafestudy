import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';
import { normalizeEvent, buildFaceIdMap, extractFaceId } from './members.events.js';

// Chromium 실행 파일 경로를 방어적으로 결정한다.
// PUPPETEER_EXECUTABLE_PATH가 실제로 존재하면 그걸 쓰고, 아니면 알려진 후보를
// 순회한다. (Alpine 버전에 따라 chromium-browser / chromium 으로 경로가 갈림)
function resolveChromiumPath() {
  const candidates = [
    process.env.PUPPETEER_EXECUTABLE_PATH,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  // 아무것도 못 찾으면 undefined → puppeteer가 번들 Chromium을 시도(로컬 개발용).
  return undefined;
}

const NAME_REGEX = /^[가-힣A-Za-z0-9_.\s]{2,20}$/;
const BIO_KEYWORDS = ['안녕하세요', '개발자', '프로그래밍', '하는 일', 'Engineer'];
const SKIP_WORDS = new Set([
  '최근가입',
  '모임 멤버 더보기',
  'Image',
  'member face',
  'refresh',
  'Premium Sponsor',
]);

function cleanText(t) {
  return t.replace(/\s+/g, ' ').trim();
}

function findSection(lines) {
  const start = lines.findIndex((l) => l.includes('모임 멤버'));
  if (start === -1) return [];
  let end = lines.length;
  for (let j = start + 1; j < lines.length; j++) {
    if (['비슷한 모임', '게시판', '공유하기'].some((kw) => lines[j].includes(kw))) {
      end = j;
      break;
    }
  }
  return lines.slice(start + 1, end);
}

function parseMembers(lines) {
  const section = findSection(lines);
  const members = [];
  let current = null;

  for (const raw of section) {
    const line = raw.replace('Premium Sponsor', '').trim();
    if (!line || SKIP_WORDS.has(line) || line.startsWith('Image')) continue;

    const isName = NAME_REGEX.test(line);
    const isBio = line.length > 20 || BIO_KEYWORDS.some((kw) => line.includes(kw));

    if (isName && !isBio) {
      if (current) members.push(current);
      current = { name: line, bio: '' };
    } else if (current) {
      current.bio = cleanText([current.bio, line].filter(Boolean).join(' '));
    }
  }
  if (current) members.push(current);

  const seen = new Set();
  return members.filter(({ name }) => {
    if (seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

function parseMemberCount(lines) {
  for (const l of lines) {
    const m = l.match(/모임 멤버\s*(\d+)/);
    if (m) return +m[1];
  }
  for (const l of lines) {
    const m = l.match(/멤버\s*(\d+)/);
    if (m) return +m[1];
  }
  return null;
}

async function clickMoreUntilEnd(page, max = 50) {
  for (let i = 0; i < max; i++) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((r) => setTimeout(r, 1000));

    const clicked = await page.evaluate(() => {
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent.trim() === '모임 멤버 더보기') {
          node.parentElement.scrollIntoView({ block: 'center' });
          node.parentElement.click();
          return true;
        }
      }
      return false;
    });

    if (!clicked) {
      console.log('[crawler] 더보기 버튼 없음, 종료');
      break;
    }
    console.log(`[crawler] 모임 멤버 더보기 클릭: ${i + 1}회`);
    await new Promise((r) => setTimeout(r, 1500));
  }
}

// 브라우저 컨텍스트에서 실행 (page.evaluate). DOM 의존적이라 여기 정의.
// 각 정모 카드의 이미지 URL/텍스트를 raw 형태로 뽑는다. 정규화는 Node 쪽에서.
// groupId: 페이지 URL 마지막 세그먼트. 썸네일 파일명이 groupId로 시작하므로
// "비슷한 모임" 등 다른 그룹의 정모 카드가 섞이는 것을 막는 필터로 쓴다.
/* c8 ignore start */
function extractEventCardsInPage(groupId) {
  // "정모 일정" 텍스트를 포함하는 요소 중 "가장 깊은" 것을 헤더로 삼는다.
  // (조상 wrapper div의 textContent에도 매칭되므로, 첫 매치를 쓰면 scope가
  // 사실상 body 전체가 되어 다른 섹션의 카드가 섞여 들어온다.)
  const candidates = Array.from(document.querySelectorAll('h1, h2, h3, div, span')).filter(
    (el) => /정모\s*일정/.test(el.textContent || ''),
  );
  const startEl = candidates.find(
    (el) => !candidates.some((other) => other !== el && el.contains(other)),
  );
  if (!startEl) return [];

  const scope = startEl.closest('section, div') || document.body;

  // 썸네일(정모 대표 이미지)을 카드 앵커로 사용: <groupId><YYYYMMDDHHMM>s<n>.png
  const thumbs = Array.from(scope.querySelectorAll('img')).filter(
    (img) =>
      /\d{12}s\d+\.png/.test(img.src) && (!groupId || img.src.includes(groupId)),
  );

  return thumbs.map((thumb) => {
    // 카드 컨테이너 추정: 썸네일의 조상 중 얼굴 이미지를 포함하는 가장 가까운 블록.
    let card = thumb.parentElement;
    for (let i = 0; i < 6 && card; i++) {
      const faces = card.querySelectorAll('img[src*="1t.png"]');
      if (faces.length > 0) break;
      card = card.parentElement;
    }
    card = card || thumb.parentElement;

    const text = (card.innerText || '').split('\n').map((s) => s.trim()).filter(Boolean);

    // 아이콘 기준 필드 추출: i_clock/i_location2/i_currency 아이콘 다음 텍스트.
    const iconField = (iconKey) => {
      const icon = card.querySelector(`img[src*="${iconKey}"]`);
      if (!icon) return null;
      // 아이콘의 다음 형제 또는 부모의 다음 텍스트를 찾는다.
      let node = icon.nextElementSibling || icon.parentElement?.nextElementSibling;
      const t = node?.textContent?.trim();
      return t || null;
    };

    const faceSrcs = Array.from(card.querySelectorAll('img[src*="1t.png"]')).map((i) => i.src);

    // 제목: h3 우선, 없으면 상세 일시 텍스트 앞 라인.
    const titleEl = card.querySelector('h3');
    const title = titleEl?.textContent?.trim() || text[0] || null;

    // 상세 일시 텍스트: "7/4(토) 오전 10:00" 패턴.
    const dateTimeText = text.find((l) => /\d{1,2}\/\d{1,2}\([월화수목금토일]\)/.test(l)) || null;

    // 정원 텍스트: "7/10" 패턴 (얼굴 이미지 뒤).
    const capacityText = text.find((l) => /^\d+\s*\/\s*\d+$/.test(l)) || null;

    return {
      thumbnailSrc: thumb.src,
      title,
      dateTimeText,
      location: iconField('i_location2'),
      cost: iconField('i_currency'),
      attendeeFaceSrcs: faceSrcs,
      capacityText,
    };
  });
}

// 멤버 섹션에서 이름<->얼굴 매핑을 뽑는다 (face_id 채우기용).
function extractMemberFacesInPage() {
  const results = [];
  const seen = new Set();
  const nameRegex = /^[가-힣A-Za-z0-9_.\s]{2,20}$/;
  const skipWords = new Set([
    '최근가입',
    '모임 멤버 더보기',
    'Image',
    'member face',
    'refresh',
    'Premium Sponsor',
  ]);
  // 멤버/운영진 카드: 얼굴 이미지(1n.png) + 인접 이름 텍스트.
  const faces = Array.from(document.querySelectorAll('img[src*="1n.png"]'));
  for (const face of faces) {
    let node = face.parentElement;
    let name = null;
    for (let i = 0; i < 8 && node; i++) {
      const text = (node.innerText || '')
        .split('\n')
        .map((s) => s.replace('Premium Sponsor', '').trim())
        .filter(Boolean);
      name = text.find((line) => nameRegex.test(line) && !skipWords.has(line)) || null;
      if (name) break;
      node = node.parentElement;
    }
    if (name && !seen.has(face.src)) {
      seen.add(face.src);
      results.push({ src: face.src, name });
    }
  }
  return results;
}
/* c8 ignore stop */

export async function crawlMembers(url) {
  const executablePath = resolveChromiumPath();
  console.log(`[crawler] Chromium 경로: ${executablePath ?? '(puppeteer 번들 사용)'}`);

  const browser = await puppeteer.launch({
    executablePath,
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--window-size=1400,1200',
      '--disable-blink-features=AutomationControlled',
      '--lang=ko-KR',
    ],
  });

  try {
    const page = await browser.newPage();
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    );
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 });
    await new Promise((r) => setTimeout(r, 3000));

    await clickMoreUntilEnd(page, 50);

    const rawText = await page.evaluate(() => document.body.innerText);
    const lines = rawText.split('\n').map(cleanText).filter(Boolean);
    const members = parseMembers(lines);

    // DOM 기반 추출: 멤버 얼굴 매핑 + 정모 카드.
    // groupId = URL 마지막 세그먼트 (썸네일 필터용).
    const groupId = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    const memberFaces = await page.evaluate(extractMemberFacesInPage);
    const rawEventCards = await page.evaluate(extractEventCardsInPage, groupId);

    // 이름 -> face_id 매핑을 members 에 병합.
    const faceByName = new Map();
    for (const { src, name } of memberFaces) {
      const faceId = extractFaceId(src);
      if (faceId && name && !faceByName.has(name)) {
        faceByName.set(name, { faceId, avatarUrl: src });
      }
    }
    const membersWithFace = members.map((m) => ({
      ...m,
      face_id: faceByName.get(m.name)?.faceId ?? null,
      avatar_url: faceByName.get(m.name)?.avatarUrl ?? null,
    }));

    // 정모 정규화 + 참가자 이름 매핑.
    const memberByFaceId = buildFaceIdMap(membersWithFace);
    const crawlYear = new Date().getFullYear();
    const events = rawEventCards.map((card) =>
      normalizeEvent(card, { crawlYear, memberByFaceId }),
    );

    return {
      url,
      expected_member_count: parseMemberCount(lines),
      crawled_member_count: membersWithFace.length,
      members: membersWithFace,
      events,
    };
  } finally {
    await browser.close();
  }
}
