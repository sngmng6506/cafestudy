import re
import json
import os
import sys
import time

sys.stdout.reconfigure(encoding='utf-8')
from pathlib import Path
from typing import List, Dict, Any

import requests
from bs4 import BeautifulSoup
from dotenv import dotenv_values

from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from webdriver_manager.chrome import ChromeDriverManager


URL = "https://www.somoim.co.kr/eb377bbe-e53f-46c2-a0a3-89b7dd98667c1"


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def create_driver(headless: bool = False):
    options = Options()

    if headless:
        options.add_argument("--headless=new")

    options.add_argument("--window-size=1400,1200")
    options.add_argument("--disable-blink-features=AutomationControlled")
    options.add_argument("--lang=ko-KR")
    options.add_argument(
        "--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    )

    service = Service(ChromeDriverManager().install())
    return webdriver.Chrome(service=service, options=options)


def click_member_more_until_end(driver, max_clicks: int = 30):
    for i in range(max_clicks):
        time.sleep(1)

        driver.find_element(By.TAG_NAME, "body").send_keys(Keys.END)
        time.sleep(1)

        buttons = driver.find_elements(
            By.XPATH,
            "//*[contains(text(), '모임 멤버 더보기')]"
        )

        if not buttons:
            print("더보기 버튼 없음. 클릭 종료.")
            break

        button = buttons[0]

        try:
            driver.execute_script(
                "arguments[0].scrollIntoView({block: 'center'});",
                button
            )
            time.sleep(0.5)
            driver.execute_script("arguments[0].click();", button)
            print(f"모임 멤버 더보기 클릭: {i + 1}회")
            time.sleep(1.5)

        except Exception as e:
            print(f"더보기 클릭 실패: {e}")
            break


def get_lines_from_html(html: str) -> List[str]:
    soup = BeautifulSoup(html, "html.parser")
    text = soup.get_text("\n")

    lines = []
    for line in text.split("\n"):
        line = clean_text(line)
        if line:
            lines.append(line)

    return lines


def find_section(lines: List[str], start_keyword: str, end_keywords: List[str]) -> List[str]:
    start_idx = None

    for i, line in enumerate(lines):
        if start_keyword in line:
            start_idx = i
            break

    if start_idx is None:
        return []

    end_idx = len(lines)

    for j in range(start_idx + 1, len(lines)):
        if any(keyword in lines[j] for keyword in end_keywords):
            end_idx = j
            break

    return lines[start_idx + 1:end_idx]


def parse_all_members(lines: List[str]) -> List[Dict[str, str]]:
    section = find_section(
        lines,
        start_keyword="모임 멤버",
        end_keywords=["비슷한 모임", "게시판", "공유하기"]
    )

    members = []

    skip_words = {
        "최근가입",
        "모임 멤버 더보기",
        "Image",
        "member face",
        "refresh",
        "Premium Sponsor",
    }

    current = None

    for raw in section:
        line = raw.replace("Premium Sponsor", "").strip()

        if not line:
            continue

        if line in skip_words:
            continue

        if line.startswith("Image"):
            continue

        is_name = bool(re.match(r"^[가-힣A-Za-z0-9_.\s]{2,20}$", line))

        is_bio = len(line) > 20 or any(
            keyword in line
            for keyword in ["안녕하세요", "개발자", "프로그래밍", "하는 일", "Engineer"]
        )

        if is_name and not is_bio:
            if current:
                members.append(current)

            current = {"name": line, "bio": ""}

        else:
            if current:
                current["bio"] = clean_text(f"{current.get('bio', '')} {line}")

    if current:
        members.append(current)

    unique_members = []
    seen = set()

    for member in members:
        name = member["name"]

        if name not in seen:
            unique_members.append(member)
            seen.add(name)

    return unique_members


def parse_member_count(lines: List[str]):
    for line in lines:
        match = re.search(r"모임 멤버\s*(\d+)", line)
        if match:
            return int(match.group(1))

    for line in lines:
        match = re.search(r"멤버\s*(\d+)", line)
        if match:
            return int(match.group(1))

    return None


def extract_face_id(url: str):
    """얼굴 이미지 URL에서 UUID(36자) 추출. 예: .../<uuid>1t.png"""
    if not url:
        return None
    m = re.search(r"/([0-9a-f-]{36})1[tn]\.png", url, re.IGNORECASE)
    return m.group(1) if m else None


def extract_datetime_from_thumbnail(url: str):
    """정모 썸네일 URL 끝의 YYYYMMDDHHMM 추출."""
    if not url:
        return None
    m = re.search(r"(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})s\d+\.png$", url)
    if not m:
        return None
    y, mo, d, h, mi = map(int, m.groups())
    try:
        from datetime import datetime
        return datetime(y, mo, d, h, mi)
    except ValueError:
        return None


def parse_datetime_text(text: str, crawl_year: int):
    """텍스트 fallback: '7/4(토) 오전 10:00' + 크롤링 연도."""
    if not text:
        return None
    m = re.search(r"(\d{1,2})/(\d{1,2})\([월화수목금토일]\)\s*(오전|오후)?\s*(\d{1,2}):(\d{2})", text)
    if not m:
        return None
    mo, d = int(m.group(1)), int(m.group(2))
    ampm = m.group(3)
    h, mi = int(m.group(4)), int(m.group(5))
    if ampm == "오후" and h != 12:
        h += 12
    if ampm == "오전" and h == 12:
        h = 0
    try:
        from datetime import datetime
        return datetime(crawl_year, mo, d, h, mi)
    except ValueError:
        return None


def parse_capacity(text: str):
    if not text:
        return (None, None)
    m = re.search(r"(\d+)\s*/\s*(\d+)", text)
    if not m:
        return (None, None)
    return (int(m.group(1)), int(m.group(2)))


def extract_member_faces(driver) -> Dict[str, str]:
    """멤버/운영진 얼굴(1n.png) <-> 이름 매핑 테이블 생성."""
    face_by_name = {}
    faces = driver.find_elements(By.CSS_SELECTOR, 'img[src*="1n.png"]')
    for face in faces:
        try:
            src = face.get_attribute("src")
            face_id = extract_face_id(src)
            if not face_id:
                continue
            # 얼굴 이미지의 조상 컨테이너에서 이름 텍스트 추출
            container = face.find_element(By.XPATH, "./ancestor::div[1]")
            text_lines = [
                l.replace("Premium Sponsor", "").strip()
                for l in container.text.split("\n")
                if l.strip()
            ]
            name = text_lines[0] if text_lines else None
            if name and name not in face_by_name:
                face_by_name[name] = face_id
        except Exception:
            continue
    return face_by_name


def extract_events(driver, member_by_face_id: Dict[str, str], crawl_year: int) -> List[Dict[str, Any]]:
    """정모 카드 추출 + 참가자 이름 매핑."""
    events = []
    # 정모 썸네일(YYYYMMDDHHMMs?.png)을 카드 앵커로 사용
    thumbs = [
        img for img in driver.find_elements(By.TAG_NAME, "img")
        if re.search(r"\d{12}s\d+\.png", img.get_attribute("src") or "")
    ]

    for thumb in thumbs:
        try:
            thumb_src = thumb.get_attribute("src")
            # 카드 컨테이너: 얼굴 이미지를 포함하는 가장 가까운 조상
            card = thumb
            for _ in range(6):
                card = card.find_element(By.XPATH, "./..")
                if card.find_elements(By.CSS_SELECTOR, 'img[src*="1t.png"]'):
                    break

            text_lines = [l.strip() for l in card.text.split("\n") if l.strip()]

            def icon_field(icon_key):
                icons = card.find_elements(By.CSS_SELECTOR, f'img[src*="{icon_key}"]')
                if not icons:
                    return None
                try:
                    sib = icons[0].find_element(By.XPATH, "./following::*[1]")
                    return sib.text.strip() or None
                except Exception:
                    return None

            face_srcs = [
                i.get_attribute("src")
                for i in card.find_elements(By.CSS_SELECTOR, 'img[src*="1t.png"]')
            ]

            title = None
            h3s = card.find_elements(By.TAG_NAME, "h3")
            if h3s:
                title = h3s[0].text.strip()
            if not title and text_lines:
                title = text_lines[0]

            date_time_text = next(
                (l for l in text_lines if re.search(r"\d{1,2}/\d{1,2}\([월화수목금토일]\)", l)),
                None,
            )
            capacity_text = next((l for l in text_lines if re.fullmatch(r"\d+\s*/\s*\d+", l)), None)

            scheduled = extract_datetime_from_thumbnail(thumb_src) or parse_datetime_text(date_time_text, crawl_year)
            joined, capacity = parse_capacity(capacity_text)

            seen = set()
            attendees = []
            for src in face_srcs:
                fid = extract_face_id(src)
                if not fid or fid in seen:
                    continue
                seen.add(fid)
                attendees.append({"faceId": fid, "name": member_by_face_id.get(fid)})

            events.append({
                "title": (title or "").strip() or "(제목 없음)",
                "scheduledAt": scheduled.isoformat() if scheduled else None,
                "location": icon_field("i_location2"),
                "cost": icon_field("i_currency"),
                "joinedCount": joined,
                "capacity": capacity,
                "thumbnailUrl": thumb_src,
                "attendees": attendees,
            })
        except Exception as e:
            print(f"정모 카드 파싱 실패: {e}")
            continue

    return events


def crawl_all_members(url: str) -> Dict[str, Any]:
    from datetime import datetime
    driver = create_driver(headless=True)

    try:
        driver.get(url)
        time.sleep(3)

        click_member_more_until_end(driver, max_clicks=50)

        html = driver.page_source
        lines = get_lines_from_html(html)

        members = parse_all_members(lines)
        expected_count = parse_member_count(lines)

        # DOM 기반: 얼굴 매핑 + 정모 추출
        crawl_year = datetime.now().year
        face_by_name = extract_member_faces(driver)
        for m in members:
            m["face_id"] = face_by_name.get(m["name"])

        member_by_face_id = {fid: name for name, fid in face_by_name.items()}
        events = extract_events(driver, member_by_face_id, crawl_year)

        return {
            "url": url,
            "expected_member_count": expected_count,
            "crawled_member_count": len(members),
            "members": members,
            "events": events,
        }

    finally:
        driver.quit()


def sync_to_backend(result: Dict[str, Any], endpoint: str, api_key: str) -> None:
    resp = requests.post(
        endpoint,
        json=result,
        headers={
            "x-internal-key": api_key,
            "Content-Type": "application/json",
        },
        timeout=30,
    )
    resp.raise_for_status()
    print(f"동기화 완료: {resp.json()}")


if __name__ == "__main__":
    # .env 파일과 환경변수를 합쳐서 읽음 (환경변수 우선)
    env = {**dotenv_values(Path(__file__).parent.parent / ".env"), **os.environ}

    endpoint = env.get("SYNC_ENDPOINT")
    api_key = env.get("INTERNAL_API_KEY")

    if not endpoint or not api_key:
        print("오류: .env에 SYNC_ENDPOINT와 INTERNAL_API_KEY를 설정해주세요.")
        sys.exit(1)

    print(f"크롤링 시작: {URL}")
    result = crawl_all_members(URL)

    print(f"크롤링 완료: {result['crawled_member_count']}명 수집")
    print(json.dumps(result, ensure_ascii=False, indent=2))

    print(f"백엔드 동기화 중: {endpoint}")
    sync_to_backend(result, endpoint, api_key)
