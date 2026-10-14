"""OpenAlex quantum computing observation windows, with separate preprint feed."""
from __future__ import annotations
import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import hashlib
import json
from pathlib import Path
import re
import urllib.parse
import urllib.request
from refresh_data import fetch, paper_record
from refresh_neuroscience import month_windows, shift_year

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'config/quantum-computing.json').read_text(encoding='utf-8'))
DEST = ROOT / 'public/data/quantum-computing.json'
CACHE = ROOT / '.cache/openalex-quantum'
REVIEW = re.compile(r'\breview\b|\bsurvey\b', re.I)


def query(title, start, end, *, kind='article|review', size=1, sort=None, journal=True, cursor=None):
    filters = f'is_retracted:false,type:{kind},title.search:{title},from_publication_date:{start},to_publication_date:{end}'
    if journal:
        filters += ',primary_location.source.type:journal'
    params = {'filter': filters, 'per-page': size}
    if sort:
        params['sort'] = sort
    if cursor:
        params['cursor'] = cursor
    key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
    cache = CACHE / (key + '.json')
    if cache.exists():
        return json.loads(cache.read_text(encoding='utf-8'))
    data = fetch('works', **params)
    if not isinstance(data.get('meta', {}).get('count'), int) or not isinstance(data.get('results'), list):
        raise ValueError('Invalid OpenAlex response; previous quantum snapshot retained.')
    CACHE.mkdir(parents=True, exist_ok=True)
    cache.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    return data


def record(work, topic_id, lane):
    result = paper_record(work, topic_id, CONFIG['id'])
    preprint = work['type'] == 'preprint'
    review = not preprint and (work['type'] == 'review' or bool(REVIEW.search(work.get('title', ''))))
    result.update({'type': 'preprint' if preprint else 'review' if review else 'article', 'publicationType': work['type'],
                   'lanes': [lane], 'topicLanes': {topic_id: [lane]}, 'studySignals': [], 'source': 'OpenAlex',
                   'publicationStatus': '프리프린트 · 심사 여부 미확인' if preprint else '저널 논문', 'fwci': None})
    return result


def collect(topic, today):
    end, start = today - dt.timedelta(days=1), shift_year(today)
    previous_start, previous_end = shift_year(start), start - dt.timedelta(days=1)
    recent = today - dt.timedelta(days=30)
    title = '(' + topic['query'] + ')'
    corpus, cursor, seen_cursors = {}, '*', set()
    while cursor:
        if cursor in seen_cursors:
            raise ValueError('Repeated OpenAlex cursor; incomplete corpus cannot replace snapshot.')
        seen_cursors.add(cursor)
        response = query(title, previous_start, end, size=200, cursor=cursor)
        for work in response['results']:
            if not work.get('publication_date'):
                raise ValueError('Publication date missing; cannot calculate complete monthly history.')
            corpus[work['id']] = work
        cursor = response['meta'].get('next_cursor') if len(response['results']) == 200 else None
    current = [work for work in corpus.values() if str(start) <= work['publication_date'] <= str(end)]
    previous = [work for work in corpus.values() if str(previous_start) <= work['publication_date'] <= str(previous_end)]
    original = [work for work in current if work['type'] == 'article' and not REVIEW.search(work.get('title', ''))]
    reviews = [work for work in current if work['type'] == 'review' or REVIEW.search(work.get('title', ''))]
    latest = sorted([work for work in original if work['publication_date'] >= str(recent)], key=lambda work: work['publication_date'], reverse=True)
    impact = sorted(original, key=lambda work: work.get('cited_by_count', 0), reverse=True)
    reviews = sorted(reviews, key=lambda work: work.get('cited_by_count', 0), reverse=True)
    preprints = query(title, recent, end, kind='preprint', size=20, sort='publication_date:desc', journal=False)
    history = [{'month': first.strftime('%Y-%m'), 'count': sum(str(first) <= work['publication_date'] <= str(last) for work in corpus.values())} for first, last in month_windows(today)]
    count, previous_count = len(current), len(previous)
    items = []
    for lane, works in [('latest', latest[:20]), ('impact', impact[:10]), ('review', reviews[:5]), ('preprint', preprints['results'])]:
        for work in works:
            item = record(work, topic['id'], lane)
            if lane in ('latest', 'impact') and item['type'] != 'article':
                continue
            items.append(item)
    source = 'https://api.openalex.org/works?' + urllib.parse.urlencode({'filter': f'is_retracted:false,type:article|review,title.search:{title},from_publication_date:{start},to_publication_date:{end},primary_location.source.type:journal'})
    out = {**topic, 'field': CONFIG['id'], 'count': count, 'previousCount': previous_count,
           'growth': round((count / previous_count - 1) * 100, 1) if previous_count >= 20 else None,
           'growthReason': '직전 기간 20편 미만' if previous_count < 20 else None,
           'recentCount': len(latest), 'preprintCount': preprints['meta']['count'], 'monthly': history,
           'sourceUrl': source, 'paperIds': sorted({p['id'] for p in items})}
    print(f"{topic['id']}: {count} journal records, {preprints['meta']['count']} recent preprints", flush=True)
    return out, items


def restore():
    try:
        with urllib.request.urlopen('https://loong-kid.github.io/research-dashboard/data/quantum-computing.json', timeout=20) as response:
            data = json.load(response)
        expected = {t['id']: t['query'] for t in CONFIG['topics']}
        if data.get('field') != CONFIG['id'] or {t['id']: t['query'] for t in data.get('topics', [])} != expected:
            return
        existing = json.loads(DEST.read_text(encoding='utf-8')) if DEST.exists() else {}
        if data.get('asOf', '') > existing.get('asOf', ''):
            DEST.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
            print('Restored the last published quantum snapshot.')
    except Exception:
        print('Using the checked-in quantum snapshot.')


def main():
    global CACHE
    parser = argparse.ArgumentParser()
    parser.add_argument('--as-of')
    parser.add_argument('--restore-only', action='store_true')
    args = parser.parse_args()
    if args.restore_only:
        restore()
        return
    today = dt.date.fromisoformat(args.as_of) if args.as_of else dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
    CACHE /= str(today)
    topics, papers = [], {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        for topic, items in pool.map(lambda topic: collect(topic, today), CONFIG['topics']):
            topics.append(topic)
            for item in items:
                if item['id'] not in papers:
                    papers[item['id']] = item
                else:
                    old = papers[item['id']]
                    old['topicIds'] = sorted(set(old['topicIds'] + item['topicIds']))
                    old['lanes'] = sorted(set(old['lanes'] + item['lanes']))
                    for topic_id, lanes in item['topicLanes'].items():
                        old['topicLanes'][topic_id] = sorted(set(old['topicLanes'].get(topic_id, []) + lanes))
    notes_path = ROOT / 'public/data/quantum-notes.json'
    notes = json.loads(notes_path.read_text(encoding='utf-8')) if notes_path.exists() else {}
    for paper_id, note in notes.items():
        if paper_id not in papers:
            work = fetch('works/' + paper_id)
            if work.get('is_retracted'):
                continue
            item = record(work, note['topicIds'][0], 'curated')
            item['topicIds'] = note['topicIds']
            item['topicLanes'] = {topic_id: ['curated'] for topic_id in note['topicIds']}
            papers[paper_id] = item
        if 'curated' not in papers[paper_id]['lanes']:
            papers[paper_id]['lanes'].append('curated')
    start = shift_year(today)
    output = {'schemaVersion': 2, 'field': CONFIG['id'], 'name': CONFIG['name'], 'description': CONFIG['description'],
              'defaultTopic': CONFIG['defaultTopic'], 'asOf': str(today), 'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'source': 'OpenAlex',
              'period': {'start': str(start), 'end': str(today - dt.timedelta(days=1)), 'previousStart': str(shift_year(start)), 'previousEnd': str(start - dt.timedelta(days=1)), 'recentStart': str(today - dt.timedelta(days=30))},
              'groups': CONFIG['groups'], 'topics': topics, 'papers': list(papers.values()), 'queryVersion': 'quantum-v1',
              'methodology': 'Boolean title-synonym queries. Counts/monthly include OpenAlex article/review records with primary journal source only. Reviews: explicit type or title review/survey. Preprints are separate, not added to journal counts. Latest: 20/topic in 30 days; impact: 10/topic in 12 months; reviews: 5/topic in 12 months; preprints: 20/topic in 30 days. Deduplicate by OpenAlex ID; topics overlap; versions may remain distinct records. Growth suppressed when previous count <20. Counts are activity proxies, not progress or quality.'}
    DEST.parent.mkdir(parents=True, exist_ok=True)
    temporary = DEST.with_suffix('.tmp')
    temporary.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(DEST)
    print(f'Quantum snapshot saved: {len(topics)} topics, {len(papers)} unique records.')


if __name__ == '__main__':
    main()
