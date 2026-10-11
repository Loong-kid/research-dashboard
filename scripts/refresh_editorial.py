"""Collect Nature's own neuroscience editorial listings, not journal popularity."""
import datetime as dt
from concurrent.futures import ThreadPoolExecutor
from email.utils import parsedate_to_datetime
import gzip
import json
from pathlib import Path
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/data/neuroscience-editorial.json'
SOURCE = 'https://www.nature.com/subjects/neuroscience'


def editorial_type(article):
    label = article.select_one('[data-test="article-category"]')
    meta = article.select_one('meta[name="dc.type"]')
    raw = label.get_text(' ', strip=True) if label else meta.get('content', '') if meta else ''
    return {'research highlight': 'Research Highlights', 'research highlights': 'Research Highlights',
            'news & views': 'News & Views', 'news and views': 'News & Views'}.get(raw.lower())


def fetch_bytes(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0', 'Accept-Encoding': 'identity'})
    with urllib.request.urlopen(request, timeout=25) as response:
        body = response.read()
        if response.headers.get('Content-Encoding') == 'gzip':
            body = gzip.decompress(body)
        return body


def fetch(url):
    return BeautifulSoup(fetch_bytes(url).decode('utf-8', errors='replace'), 'html.parser')


def collect(soup):
    items = {}
    for card in soup.select('.c-card'):
        kind, link, date = card.select_one('.c-meta__type'), card.select_one('.c-card__title a'), card.select_one('time[datetime]')
        if not kind or kind.get_text(strip=True) not in ('Research Highlight', 'Research Highlights', 'News & Views') or not link or not date:
            continue
        url = urllib.parse.urljoin(SOURCE, link.get('href', ''))
        if urllib.parse.urlparse(url).hostname != 'www.nature.com':
            continue
        journal = card.select_one('a[data-track-action="clicked journal"]')
        items[url] = {'title': link.get_text(' ', strip=True), 'url': url, 'date': date['datetime'],
                      'type': kind.get_text(strip=True), 'journal': journal.get_text(' ', strip=True) if journal else 'Nature portfolio',
                      'originalLinks': []}
    if not items:
        print(f'Nature HTML listing unavailable: title={soup.title.get_text(strip=True) if soup.title else "none"}; cards={len(soup.select(".c-card"))}', flush=True)
        raise ValueError('Nature listing format changed; previous editorial snapshot preserved.')
    return sorted(items.values(), key=lambda item: item['date'], reverse=True)[:12]


def collect_rss(existing):
    """RSS supplies URLs; only publisher category/type can make one an editorial."""
    feeds = ['https://www.nature.com/subjects/neuroscience.rss', 'https://www.nature.com/nrn.rss', 'https://www.nature.com/neuro.rss']
    fresh, candidates = {}, {}
    now = dt.datetime.now(dt.timezone.utc).isoformat()
    for feed in feeds:
        try:
            root = ET.fromstring(fetch_bytes(feed))
            for entry in root.iter():
                if entry.tag.split('}')[-1] != 'item':
                    continue
                fields = {child.tag.split('}')[-1]: child.text for child in entry}
                url = fields.get('link')
                if not url or urllib.parse.urlparse(url).hostname != 'www.nature.com' or url in candidates:
                    continue
                candidates[url] = (fields, feed)
        except Exception as error:
            print(f'Nature official feed unavailable: {feed}: {type(error).__name__}', flush=True)
    def verify(candidate):
        url, (fields, feed) = candidate
        try:
            article = fetch(url)
            kind = editorial_type(article)
            if not kind:
                return None
            date = article.select_one('meta[name="dc.date"]') or article.select_one('meta[name="prism.publicationDate"]')
            raw_date = fields.get('date') or (date.get('content') if date else None)
            published = dt.date.fromisoformat(raw_date[:10]) if raw_date else parsedate_to_datetime(fields['pubDate']).date()
            journal = article.select_one('meta[name="prism.publicationName"]')
            return {'title': fields['title'], 'url': url, 'date': str(published), 'type': kind,
                    'journal': fields.get('publicationName') or (journal.get('content') if journal else 'Nature portfolio'),
                    'originalLinks': [], 'listedOn': feed, 'lastVerifiedAt': now}
        except Exception:
            return None
    with ThreadPoolExecutor(max_workers=4) as executor:
        for item in executor.map(verify, candidates.items()):
            if item:
                fresh[item['url']] = item
    if not fresh:
        raise ValueError('Nature HTML and official RSS verification unavailable. Previous snapshot preserved.')
    # Keep previously verified editorials for 60 days, without changing their verification dates.
    cutoff = str(dt.date.today() - dt.timedelta(days=60))
    items = {item['url']: item for item in existing.get('items', []) if item['date'] >= cutoff}
    items.update(fresh)
    return sorted(items.values(), key=lambda item: item['date'], reverse=True)[:12]


def main():
    # On daily builds retain the latest published data if source refresh fails.
    try:
        with urllib.request.urlopen('https://loong-kid.github.io/research-dashboard/data/neuroscience-editorial.json', timeout=20) as response:
            deployed = json.load(response)
        existing = json.loads(DEST.read_text(encoding='utf-8')) if DEST.exists() else {}
        if deployed.get('sourceUrl') == SOURCE and deployed.get('fetchedAt', '') > existing.get('fetchedAt', ''):
            DEST.write_text(json.dumps(deployed, ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception:
        pass
    existing = json.loads(DEST.read_text(encoding='utf-8')) if DEST.exists() else {}
    mode = 'subject-page'
    try:
        items = collect(fetch(SOURCE))
        for item in items:
            item['listedOn'] = SOURCE
            item['lastVerifiedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    except Exception:
        mode = 'official-rss-and-verified-archive'
        items = collect_rss(existing)
    for item in items:
        try:
            article = fetch(item['url'])
            # Publisher-labelled references, kept as references rather than a claimed one-to-one mapping.
            links = article.select('.c-article-references a[data-track-action="article reference"]')
            item['originalLinks'] = list(dict.fromkeys(link['href'] for link in links if link.get('href', '').startswith('https://doi.org/')))[:5]
        except Exception:
            pass
    output = {'sourceUrl': SOURCE, 'collectionMode': mode, 'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'items': items}
    temporary = DEST.with_suffix('.tmp')
    temporary.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(DEST)
    print(f'Nature neuroscience editorial listings saved: {len(items)}')


if __name__ == '__main__':
    main()
