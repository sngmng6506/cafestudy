import puppeteer from 'puppeteer';

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

export async function crawlMembers(url) {
  const browser = await puppeteer.launch({
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
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

    return {
      url,
      expected_member_count: parseMemberCount(lines),
      crawled_member_count: members.length,
      members,
    };
  } finally {
    await browser.close();
  }
}
