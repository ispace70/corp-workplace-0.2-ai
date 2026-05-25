"""URL 크롤러 — 단일 페이지 + 하위 페이지 재귀 크롤링 (BFS)"""
import re
import time
import logging
from collections import deque
from urllib.parse import urlparse, urljoin, urldefrag

import requests

log = logging.getLogger(__name__)

_UA = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/124.0.0.0 Safari/537.36"
)
_HEADERS = {
    "User-Agent": _UA,
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7",
    "Accept-Encoding": "gzip, deflate, br",
}

# 본문 가능성이 높은 CSS 선택자 (우선순위 순)
_CONTENT_SELECTORS = [
    "article", "main", "[role='main']",
    ".content", "#content", ".post", "#post",
    ".article", "#article", ".entry", ".body",
    ".wrap", "#wrap", ".container", "#container",
]

# JS 리다이렉트 패턴
_JS_REDIRECT_RE = re.compile(r"location\.href\s*=\s*['\"]([^'\"]+)['\"]", re.I)
_META_REFRESH_RE = re.compile(
    r'<meta[^>]+http-equiv=["\']refresh["\'][^>]+content=["\'][^;]*;\s*url=([^"\'>\s]+)', re.I
)

# 인덱싱 제외할 확장자
_SKIP_EXTS = {
    ".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico",
    ".mp4", ".mp3", ".avi", ".mov", ".zip", ".tar", ".gz",
    ".exe", ".dmg", ".apk", ".css", ".js", ".woff", ".woff2", ".ttf",
}


# ── 내부 헬퍼 ─────────────────────────────────────────────────────────────

def _get(url: str, timeout: int = 30) -> requests.Response:
    resp = requests.get(url, headers=_HEADERS, timeout=timeout, allow_redirects=True)
    resp.raise_for_status()
    if resp.encoding and resp.encoding.lower() not in ("iso-8859-1", "latin-1"):
        pass
    else:
        resp.encoding = resp.apparent_encoding or "utf-8"
    return resp


def _js_redirect(html: str, base_url: str) -> str | None:
    m = _JS_REDIRECT_RE.search(html)
    if m:
        return urljoin(base_url, m.group(1))
    m = _META_REFRESH_RE.search(html)
    if m:
        return urljoin(base_url, m.group(1))
    return None


def _fetch_with_redirect(url: str, timeout: int = 30) -> tuple[requests.Response, str]:
    """JS 리다이렉트까지 최대 3회 추적. (response, final_url) 반환."""
    current = url
    for _ in range(3):
        resp = _get(current, timeout)
        if len(resp.text) < 2000:
            redir = _js_redirect(resp.text, current)
            if redir and redir != current:
                current = redir
                continue
        return resp, current
    return resp, current


def _extract_text(resp: requests.Response) -> tuple[str, str]:
    """(텍스트, 제목) 추출."""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        raise RuntimeError("beautifulsoup4 패키지가 필요합니다.")

    soup = BeautifulSoup(resp.text, "lxml")
    for tag in soup(["script", "style", "nav", "footer", "header",
                     "aside", "noscript", "iframe", "form"]):
        tag.decompose()

    title = soup.title.string.strip() if soup.title and soup.title.string else ""

    for sel in _CONTENT_SELECTORS:
        node = soup.select_one(sel)
        if node:
            candidate = _clean(node.get_text(separator="\n"))
            if len(candidate) >= 200:
                return candidate, title

    body = soup.body or soup
    return _clean(body.get_text(separator="\n")), title


def _extract_links(resp: requests.Response, base_url: str) -> list[str]:
    """같은 도메인의 링크만 반환."""
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return []

    base_netloc = urlparse(base_url).netloc
    soup = BeautifulSoup(resp.text, "lxml")
    links = []
    for a in soup.find_all("a", href=True):
        href = a["href"].strip()
        if not href or href.startswith(("mailto:", "tel:", "javascript:", "#")):
            continue
        abs_url, _ = urldefrag(urljoin(base_url, href))
        parsed = urlparse(abs_url)
        if parsed.netloc != base_netloc:
            continue
        if any(abs_url.lower().endswith(ext) for ext in _SKIP_EXTS):
            continue
        if parsed.scheme not in ("http", "https"):
            continue
        links.append(abs_url)
    return links


def _clean(raw: str) -> str:
    text = re.sub(r'[ \t]{2,}', ' ', raw)
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def _normalize(url: str) -> str:
    """비교용 URL 정규화 (fragment 제거, 후행 슬래시 통일)."""
    u, _ = urldefrag(url)
    return u.rstrip("/")


# ── 공개 API ──────────────────────────────────────────────────────────────

def fetch_url(url: str, timeout: int = 30) -> str:
    """단일 URL 텍스트 추출 (JS 리다이렉트 자동 처리)."""
    resp, final_url = _fetch_with_redirect(url, timeout)
    text, title = _extract_text(resp)

    if not text or len(text) < 100:
        raise ValueError(
            "페이지에서 텍스트를 추출할 수 없습니다 "
            "(JS 전용 페이지이거나 접근이 차단되었을 수 있습니다)."
        )

    prefix = f"URL: {url}\n제목: {title}\n\n" if title else f"URL: {url}\n\n"
    return prefix + text


def crawl_site(
    start_url: str,
    max_pages: int = 50,
    delay: float = 0.5,
    timeout: int = 30,
    progress_cb=None,
) -> list[dict]:
    """
    시작 URL부터 같은 도메인의 하위 페이지를 BFS로 재귀 크롤링.

    Returns:
        list of {"url": str, "title": str, "text": str}

    Args:
        max_pages: 최대 수집 페이지 수 (기본 50)
        delay:     페이지 간 요청 딜레이 초 (기본 0.5s)
        progress_cb: (current, total_found) 를 받는 콜백 (선택)
    """
    visited: set[str] = set()
    queue: deque[str] = deque([start_url])
    results: list[dict] = []

    while queue and len(results) < max_pages:
        url = queue.popleft()
        norm = _normalize(url)
        if norm in visited:
            continue
        visited.add(norm)

        try:
            resp, final_url = _fetch_with_redirect(url, timeout)
            visited.add(_normalize(final_url))  # 리다이렉트 대상도 방문 처리

            text, title = _extract_text(resp)
            if text and len(text) >= 100:
                results.append({"url": final_url, "title": title, "text": text})
                log.info("[crawl] %d/%d  %s", len(results), max_pages, final_url)

                if progress_cb:
                    progress_cb(len(results), len(visited) + len(queue))

            # 하위 링크 수집 (아직 방문 안 한 것만)
            for link in _extract_links(resp, final_url):
                if _normalize(link) not in visited:
                    queue.append(link)

        except Exception as e:
            log.warning("[crawl] 실패 %s: %s", url, e)

        if queue:
            time.sleep(delay)

    return results


def url_to_filename(url: str) -> str:
    """URL을 파일명 형태로 변환."""
    from urllib.parse import urlparse
    parsed = urlparse(url)
    host = parsed.netloc.replace("www.", "")
    path = parsed.path.strip("/").replace("/", "_")[:50]
    return f"{host}_{path}" if path else host
