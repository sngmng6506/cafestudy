import puppeteer from 'puppeteer';
import { existsSync } from 'node:fs';
import { normalizeEvent, buildFaceIdMap, extractFaceId } from './members.events.js';

function resolveChromiumPath(injectedPath = '') {
  const candidates = [
    injectedPath,
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
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
  const start = lines.findIndex((line) => line.includes('모임 멤버'));
  if (start === -1) return [];
  let end = lines.length;
  for (let index = start + 1; index < lines.length; index += 1) {
    if (['비슷한 모임', '게시판', '공유하기'].some((keyword) => lines[index].includes(keyword))) {
      end = index;
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
    const isBio = line.length > 20 || BIO_KEYWORDS.some((keyword) => line.includes(keyword));
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
  for (const line of lines) {
    const match = line.match(/모임 멤버\s*(\d+)/);
    if (match) return Number(match[1]);
  }
  for (const line of lines) {
    const match = line.match(/멤버\s*(\d+)/);
    if (match) return Number(match[1]);
  }
  return null;
}

async function clickMoreUntilEnd(page, max = 50) {
  for (let index = 0; index < max; index += 1) {
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await new Promise((resolve) => setTimeout(resolve, 1000));
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
    if (!clicked) break;
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

/* c8 ignore start */
function extractEventCardsInPage(groupId) {
  const diag = { candidates: 0, scopeTried: 0, thumbsFound: 0 };
  const candidates = Array.from(document.querySelectorAll('h1, h2, h3, div, span, a')).filter(
    (element) => /정모\s*일정/.test(element.textContent || ''),
  );
  const leaves = candidates.filter(
    (element) => !candidates.some((other) => other !== element && element.contains(other)),
  );
  diag.candidates = leaves.length;
  const isThumb = (image) =>
    /\d{12}s\d+\.png/.test(image.src) && (!groupId || image.src.includes(groupId));

  let thumbs = [];
  for (const startElement of leaves) {
    let scope = startElement;
    for (let depth = 0; depth < 6 && scope; depth += 1) {
      diag.scopeTried += 1;
      const found = Array.from(scope.querySelectorAll('img')).filter(isThumb);
      if (found.length > 0) {
        thumbs = found;
        break;
      }
      scope = scope.parentElement;
    }
    if (thumbs.length > 0) break;
  }
  diag.thumbsFound = thumbs.length;
  if (thumbs.length === 0) return { cards: [], __diag: diag };

  const cards = thumbs.map((thumb) => {
    let card = thumb.parentElement;
    for (let depth = 0; depth < 6 && card; depth += 1) {
      if (card.querySelectorAll('img[src*="1t.png"]').length > 0) break;
      card = card.parentElement;
    }
    card = card || thumb.parentElement;
    const text = (card.innerText || '').split('\n').map((value) => value.trim()).filter(Boolean);
    const iconField = (iconKey) => {
      const icon = card.querySelector(`img[src*="${iconKey}"]`);
      if (!icon) return null;
      const node = icon.nextElementSibling || icon.parentElement?.nextElementSibling;
      return node?.textContent?.trim() || null;
    };
    const faceSrcs = Array.from(card.querySelectorAll('img[src*="1t.png"]')).map((image) => image.src);
    const title = card.querySelector('h3')?.textContent?.trim() || text[0] || null;
    const dateTimeText = text.find((line) => /\d{1,2}\/\d{1,2}\([월화수목금토일]\)/.test(line)) || null;
    const capacityText = text.find((line) => /^\d+\s*\/\s*\d+$/.test(line)) || null;
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
  return { cards, __diag: diag };
}

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
  const faces = Array.from(document.querySelectorAll('img[src*="1n.png"]'));
  for (const face of faces) {
    let node = face.parentElement;
    let name = null;
    for (let depth = 0; depth < 8 && node; depth += 1) {
      const text = (node.innerText || '')
        .split('\n')
        .map((value) => value.replace('Premium Sponsor', '').trim())
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

export async function crawlMembers(url, { executablePath: configuredExecutablePath = '' } = {}) {
  const executablePath = resolveChromiumPath(configuredExecutablePath);
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
    await new Promise((resolve) => setTimeout(resolve, 3000));
    await clickMoreUntilEnd(page, 50);

    const rawText = await page.evaluate(() => document.body.innerText);
    const lines = rawText.split('\n').map(cleanText).filter(Boolean);
    const members = parseMembers(lines);
    const groupId = new URL(url).pathname.split('/').filter(Boolean).pop() ?? '';
    const memberFaces = await page.evaluate(extractMemberFacesInPage);
    const eventResult = await page.evaluate(extractEventCardsInPage, groupId);
    const rawEventCards = eventResult.cards ?? [];

    const faceByName = new Map();
    for (const { src, name } of memberFaces) {
      const faceId = extractFaceId(src);
      if (faceId && name && !faceByName.has(name)) {
        faceByName.set(name, { faceId, avatarUrl: src });
      }
    }
    const membersWithFace = members.map((member) => ({
      ...member,
      face_id: faceByName.get(member.name)?.faceId ?? null,
      avatar_url: faceByName.get(member.name)?.avatarUrl ?? null,
    }));
    const memberByFaceId = buildFaceIdMap(membersWithFace);
    const crawlYear = new Date().getFullYear();
    const events = rawEventCards.map((card) => normalizeEvent(card, { crawlYear, memberByFaceId }));

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
