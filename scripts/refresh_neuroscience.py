"""Neuroscience coverage with reproducible Europe PMC queries and atomic snapshots."""
from __future__ import annotations

import argparse
import calendar
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import hashlib
import html
import json
from pathlib import Path
import re
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'config/neuroscience.json').read_text(encoding='utf-8'))
DESTINATION = ROOT / 'public/data/neuroscience.json'
API = 'https://www.ebi.ac.uk/europepmc/webservices/rest/search'
BASE = 'SRC:MED AND NOT PUB_TYPE:"Retracted Publication" AND NOT PUB_TYPE:"Retraction of Publication" AND NOT PUB_TYPE:"Editorial" AND NOT PUB_TYPE:"Comment"'
CACHE = ROOT / '.cache/europepmc'


def clean(text):
    return re.sub(r'\s+', ' ', re.sub(r'<[^>]+>', ' ', html.unescape(text or ''))).strip()


def search(query, *, core=False, size=1):
    params = {'query': query, 'format': 'json', 'pageSize': size, 'resultType': 'core' if core else 'lite'}
    cache_key = hashlib.sha256(json.dumps(params, sort_keys=True).encode()).hexdigest()
    cache_file = CACHE / (cache_key + '.json')
    if cache_file.exists():
        return json.loads(cache_file.read_text(encoding='utf-8'))
    url = API + '?' + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'ResearchAtlas/0.2 (scholarly discovery; Europe PMC)'})
            with urllib.request.urlopen(request, timeout=55) as response:
                data = json.load(response)
            if 'hitCount' not in data or 'resultList' not in data:
                raise ValueError('Invalid Europe PMC result')
            CACHE.mkdir(parents=True, exist_ok=True)
            cache_file.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
            return data
        except Exception:
            if attempt == 3:
                raise RuntimeError('Europe PMC query failed. Existing neuroscience snapshot preserved.') from None
            time.sleep(min(2 ** attempt, 8))


def dated(query, start, end):
    return f'({BASE}) AND ({query}) AND FIRST_PDATE:[{start} TO {end}]'


def shift_year(day):
    year = day.year - 1
    return day.replace(year=year, day=min(day.day, calendar.monthrange(year, day.month)[1]))


def month_windows(today):
    month = today.replace(day=1)
    result = []
    for _ in range(12):
        end = month - dt.timedelta(days=1)
        start = end.replace(day=1)
        result.append((start, end))
        month = start
    return list(reversed(result))


def paper_record(work, topic_id, lane):
    publication = work.get('journalInfo') or {}
    journal = publication.get('journal') or {}
    pub_types = (work.get('pubTypeList') or {}).get('pubType', [])
    mesh = [heading.get('descriptorName', '') for heading in (work.get('meshHeadingList') or {}).get('meshHeading', [])]
    fulltext = (work.get('fullTextUrlList') or {}).get('fullTextUrl', [])
    readable = [entry for entry in fulltext if entry.get('availabilityCode') in ('OA', 'F') and entry.get('url')]
    readable.sort(key=lambda entry: entry.get('documentStyle') != 'html')
    is_review = any('review' in kind.lower() or 'meta-analysis' in kind.lower() for kind in pub_types) or bool(re.search(r'\breview\b|\bmeta[- ]analysis\b', clean(work.get('title')), re.I))
    study = []
    for term, label in [('Humans', '사람'), ('Animals', '동물'), ('Computer Simulation', '계산모델'), ('Cells, Cultured', '배양세포')]:
        if term in mesh:
            study.append({'id': {'Humans': 'human', 'Animals': 'animal', 'Computer Simulation': 'computational', 'Cells, Cultured': 'cell'}[term], 'label': label, 'basis': f'MeSH: {term}'})
    if any('Randomized Controlled Trial' in kind for kind in pub_types):
        study.append({'id': 'rct', 'label': '무작위 대조시험', 'basis': 'PubMed publication type'})
    doi = work.get('doi')
    abstract = clean(work.get('abstractText')) or None
    authors = [author.get('fullName') or author.get('collectiveName') for author in (work.get('authorList') or {}).get('author', [])]
    return {
        'id': f"EPMC-{work['source']}-{work['id']}", 'pmid': work.get('pmid'), 'pmcid': work.get('pmcid'),
        'title': clean(work.get('title')) or '제목 미제공', 'doi': f'https://doi.org/{doi}' if doi else None,
        'date': work.get('firstPublicationDate'), 'journal': journal.get('title') or journal.get('medlineAbbreviation') or '저널 미제공',
        'authors': [author for author in authors if author][:5], 'citations': work.get('citedByCount', 0), 'fwci': None,
        'oa': bool(readable), 'openAccessLicensed': work.get('isOpenAccess') == 'Y', 'oaUrl': readable[0]['url'] if readable else None,
        'license': work.get('license'), 'abstract': abstract, 'retracted': False, 'topicIds': [topic_id], 'fields': ['neuroscience'],
        'type': 'review' if is_review else 'article', 'pubTypes': pub_types, 'mesh': mesh, 'studySignals': study, 'lanes': [lane], 'topicLanes': {topic_id: [lane]},
        'source': 'Europe PMC / PubMed', 'sourceUrl': f"https://europepmc.org/article/{work['source']}/{work['id']}",
        'firstPublicationDateBasis': 'Europe PMC firstPublicationDate',
    }


def collect_topic(topic, today):
    end = today - dt.timedelta(days=1)
    start = shift_year(today)
    previous_start = shift_year(start)
    previous_end = start - dt.timedelta(days=1)
    month_start = today - dt.timedelta(days=30)
    count_query = dated(topic['query'], start, end)
    review_query = '(PUB_TYPE:review OR PUB_TYPE:"meta-analysis" OR TITLE:review OR TITLE:"meta-analysis")'
    impact_result = search(count_query + f' AND NOT {review_query} sort_cited:y', core=True, size=10)
    current = search(count_query)
    previous = search(dated(topic['query'], previous_start, previous_end))
    latest_result = search(dated(topic['query'], month_start, end) + f' AND NOT {review_query} sort_date:y', core=True, size=20)
    reviews = search(count_query + f' AND {review_query} sort_cited:y', core=True, size=5)
    history = []
    for first, last in month_windows(today):
        result = search(dated(topic['query'], first, last))
        history.append({'month': first.strftime('%Y-%m'), 'count': result['hitCount']})
    count, previous_count = current['hitCount'], previous['hitCount']
    record = {**topic, 'field': 'neuroscience', 'count': count, 'previousCount': previous_count,
              'growth': round((count / previous_count - 1) * 100, 1) if previous_count >= 20 else None,
              'growthReason': '직전 기간 20편 미만' if previous_count < 20 else None,
              'recentCount': latest_result['hitCount'], 'reviewCount': reviews['hitCount'], 'monthly': history,
              'sourceUrl': 'https://europepmc.org/search?' + urllib.parse.urlencode({'query': count_query})}
    papers = []
    for lane, result in [('latest', latest_result), ('impact', impact_result), ('review', reviews)]:
        records = [paper_record(work, topic['id'], lane) for work in result['resultList']['result']]
        papers.extend(record for record in records if (record['type'] == 'review') == (lane == 'review'))
    record['paperIds'] = sorted({paper['id'] for paper in papers})
    print(f"{topic['id']}: {count} annual, {latest_result['hitCount']} recent, {len(record['paperIds'])} papers", flush=True)
    return record, papers


def restore_deployed():
    try:
        with urllib.request.urlopen('https://loong-kid.github.io/research-dashboard/data/neuroscience.json', timeout=20) as response:
            data = json.load(response)
        if data.get('schemaVersion') != 2 or {topic['id'] for topic in data.get('topics', [])} != {topic['id'] for topic in CONFIG['topics']}:
            return
        expected_queries = {topic['id']: topic['query'] for topic in CONFIG['topics']}
        if any(topic.get('query') != expected_queries[topic['id']] for topic in data['topics']):
            return
        if DESTINATION.exists():
            existing = json.loads(DESTINATION.read_text(encoding='utf-8'))
            if existing.get('asOf', '') >= data.get('asOf', ''):
                return
        DESTINATION.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding='utf-8')
        print('Restored the last published neuroscience snapshot.', flush=True)
    except Exception:
        print('Using the checked-in neuroscience snapshot.', flush=True)


def main():
    global CACHE
    parser = argparse.ArgumentParser()
    parser.add_argument('--as-of')
    parser.add_argument('--restore-only', action='store_true')
    args = parser.parse_args()
    if args.restore_only:
        restore_deployed()
        return
    today = dt.date.fromisoformat(args.as_of) if args.as_of else dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
    CACHE = CACHE / str(today)
    topics, papers = [], {}
    with ThreadPoolExecutor(max_workers=3) as executor:
        jobs = [executor.submit(collect_topic, topic, today) for topic in CONFIG['topics']]
        for job in jobs:
            record, items = job.result()
            topics.append(record)
            for paper in items:
                if paper['id'] in papers:
                    existing = papers[paper['id']]
                    existing['topicIds'] = sorted(set(existing['topicIds'] + paper['topicIds']))
                    existing['lanes'] = sorted(set(existing['lanes'] + paper['lanes']))
                    for topic_id, lanes in paper['topicLanes'].items():
                        existing['topicLanes'][topic_id] = sorted(set(existing['topicLanes'].get(topic_id, []) + lanes))
                else:
                    papers[paper['id']] = paper
    notes_path = ROOT / 'public/data/neuroscience-notes.json'
    curated = json.loads(notes_path.read_text(encoding='utf-8')) if notes_path.exists() else {}
    for paper_id, note in curated.items():
        if paper_id not in papers:
            result = search(f'({BASE}) AND EXT_ID:{paper_id.split("-")[-1]}', core=True)
            if not result['resultList']['result']:
                continue
            record = paper_record(result['resultList']['result'][0], note['topicIds'][0], 'curated')
            record['topicIds'] = note['topicIds']
            record['topicLanes'] = {topic_id: ['curated'] for topic_id in note['topicIds']}
            papers[paper_id] = record
        if 'curated' not in papers[paper_id]['lanes']:
            papers[paper_id]['lanes'].append('curated')
    start = shift_year(today)
    output = {
        'schemaVersion': 2, 'field': CONFIG['id'], 'name': CONFIG['name'], 'description': CONFIG['description'],
        'asOf': str(today), 'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'source': 'Europe PMC / PubMed',
        'period': {'start': str(start), 'end': str(today - dt.timedelta(days=1)), 'previousStart': str(shift_year(start)), 'previousEnd': str(start - dt.timedelta(days=1)), 'recentStart': str(today - dt.timedelta(days=30))},
        'groups': CONFIG['groups'], 'topics': topics, 'papers': list(papers.values()),
        'methodology': 'PubMed-indexed publications matched by versioned title-synonym queries. Counts include reviews; feeds distinguish original research and reviews. Monthly history uses 12 complete calendar months. Latest: up to 20 original articles/topic in 30 days. Impact: up to 10 most cited original articles/topic in 12 months. Reviews: up to 5/topic in 12 months. Topic overlap is allowed. Citations are Europe PMC snapshot counts. Study labels use MeSH/publication types only. Growth suppressed for previous period <20 records. No claim of full discipline coverage or scientific progress.',
        'queryVersion': 'neuroscience-v1', 'editorialSource': 'https://www.nature.com/subjects/neuroscience',
    }
    DESTINATION.parent.mkdir(parents=True, exist_ok=True)
    temporary = DESTINATION.with_suffix('.tmp')
    temporary.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(DESTINATION)
    print(f'Neuroscience snapshot saved: {len(topics)} topics, {len(papers)} unique papers.', flush=True)


if __name__ == '__main__':
    main()
