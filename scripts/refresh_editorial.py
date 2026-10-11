"""Collect Nature's own neuroscience editorial listings, not journal popularity."""
import datetime as dt
import json
from pathlib import Path
import urllib.parse
import urllib.request
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/data/neuroscience-editorial.json'
SOURCE = 'https://www.nature.com/subjects/neuroscience'


def fetch(url):
    request = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0 (Research Atlas scholarly discovery)'})
    with urllib.request.urlopen(request, timeout=45) as response:
        return BeautifulSoup(response.read(), 'html.parser')


def collect(soup):
    items = {}
    for card in soup.select('article.c-card'):
        kind, link, date = card.select_one('.c-meta__type'), card.select_one('.c-card__title a'), card.select_one('time[datetime]')
        if not kind or kind.get_text(strip=True) not in ('Research Highlights', 'News & Views') or not link or not date:
            continue
        url = urllib.parse.urljoin(SOURCE, link.get('href', ''))
        if urllib.parse.urlparse(url).hostname != 'www.nature.com':
            continue
        journal = card.select_one('a[data-track-action="clicked journal"]')
        items[url] = {'title': link.get_text(' ', strip=True), 'url': url, 'date': date['datetime'],
                      'type': kind.get_text(strip=True), 'journal': journal.get_text(' ', strip=True) if journal else 'Nature portfolio',
                      'originalLinks': []}
    if not items:
        raise ValueError('Nature listing format changed; previous editorial snapshot preserved.')
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
    items = collect(fetch(SOURCE))
    for item in items:
        try:
            article = fetch(item['url'])
            # Publisher-labelled references, kept as references rather than a claimed one-to-one mapping.
            links = article.select('.c-article-references a[data-track-action="article reference"]')
            item['originalLinks'] = list(dict.fromkeys(link['href'] for link in links if link.get('href', '').startswith('https://doi.org/')))[:5]
        except Exception:
            pass
    output = {'sourceUrl': SOURCE, 'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'items': items}
    temporary = DEST.with_suffix('.tmp')
    temporary.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(DEST)
    print(f'Nature neuroscience editorial listings saved: {len(items)}')


if __name__ == '__main__':
    main()
