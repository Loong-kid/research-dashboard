"""Fetch an honest, reproducible OpenAlex snapshot. No keys enter public JSON."""
from __future__ import annotations

import argparse
import calendar
import concurrent.futures
import datetime as dt
import json
import os
from pathlib import Path
import time
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
TOPICS = [
    ('quantum-error', 'physics', '양자 오류정정', 'quantum error correction', '양자 계산의 오류를 줄이고 논리 큐비트의 안정성을 높이는 연구'),
    ('fusion', 'physics', '핵융합 플라스마', 'fusion plasma', '플라스마 제어와 안정성을 통해 핵융합 에너지의 가능성을 탐구하는 연구'),
    ('superconductivity', 'physics', '초전도체', 'superconductivity', '전기저항이 사라지는 물질과 그 작동 원리를 탐구하는 연구'),
    ('solid-electrolyte', 'chemistry', '고체전해질', 'solid electrolyte', '전고체전지의 이온 전달과 계면 안정성을 개선하는 소재 연구'),
    ('perovskite', 'chemistry', '페로브스카이트 태양전지', 'perovskite solar cells', '광전 변환 효율과 장기 안정성을 개선하는 태양전지 연구'),
    ('carbon-catalysis', 'chemistry', '이산화탄소 전환', 'carbon dioxide reduction', '이산화탄소를 유용한 화합물로 바꾸는 촉매와 전기화학 연구'),
    ('protein-design', 'biotech', '단백질 설계', 'protein design', '단백질의 구조와 기능을 예측하고 새로운 분자를 설계하는 연구'),
    ('gene-editing', 'biotech', '유전자 편집', 'gene editing', '유전체를 정밀하게 바꾸는 도구와 전달 방법을 개발하는 연구'),
    ('organoid', 'biotech', '오가노이드', 'organoid', '장기의 구조와 기능을 모사해 발달과 질환을 연구하는 모델'),
    ('cancer-immunotherapy', 'medicine', '암 면역치료', 'cancer immunotherapy', '면역 반응을 활용한 암 치료와 치료 반응 예측 연구'),
    ('glp1', 'medicine', 'GLP-1 치료', 'GLP-1 receptor agonist', '대사질환을 중심으로 GLP-1 수용체 작용제의 효과를 평가하는 연구'),
    ('alzheimer', 'medicine', '알츠하이머 연구', 'Alzheimer', '알츠하이머병의 기전과 진단, 치료 전략을 탐구하는 연구'),
]


def fetch(endpoint, **params):
    if os.getenv('OPENALEX_API_KEY'):
        params['api_key'] = os.environ['OPENALEX_API_KEY']
    url = 'https://api.openalex.org/' + endpoint + '?' + urllib.parse.urlencode(params)
    for attempt in range(4):
        try:
            request = urllib.request.Request(url, headers={'User-Agent': 'ResearchAtlas/0.1 (public scholarly discovery dashboard)'})
            with urllib.request.urlopen(request, timeout=50) as response:
                return json.load(response)
        except Exception as error:
            if getattr(error, 'code', None) == 429:
                raise RuntimeError('OpenAlex quota reached. Set OPENALEX_API_KEY or retry after the quota resets. Existing snapshot preserved.') from None
            if attempt == 3:
                raise RuntimeError(f'OpenAlex request failed for {endpoint}; existing snapshot preserved') from None
            time.sleep(2 ** attempt)


def abstract_text(inverted):
    if not inverted:
        return None
    words = [(position, word) for word, positions in inverted.items() for position in positions]
    return ' '.join(word for _, word in sorted(words))


def paper_record(work, topic_id, field):
    source = (work.get('primary_location') or {}).get('source') or {}
    oa = work.get('best_oa_location') or {}
    identifier = work['id'].rsplit('/', 1)[-1]
    return {
        'id': identifier, 'title': work.get('title') or '제목 미제공',
        'doi': work.get('doi'), 'date': work.get('publication_date'),
        'journal': source.get('display_name') or '출판처 미제공',
        'authors': [a['author']['display_name'] for a in work.get('authorships', [])[:5]],
        'citations': work.get('cited_by_count', 0), 'fwci': work.get('fwci'),
        'oa': bool((work.get('open_access') or {}).get('is_oa')),
        'oaUrl': oa.get('pdf_url') or oa.get('landing_page_url') or (work.get('open_access') or {}).get('oa_url'),
        'license': oa.get('license'), 'abstract': abstract_text(work.get('abstract_inverted_index')),
        'retracted': bool(work.get('is_retracted')), 'topicIds': [topic_id], 'fields': [field],
        'type': work.get('type'), 'sourceUrl': work['id'],
    }


def collect_topic(topic, start, end, previous_start, previous_end):
    topic_id, field, name, query, description = topic
    exact_query = '"' + query + '"'
    title_filter = f'type:article,is_retracted:false,title.search:{exact_query}'
    current_filter = f'{title_filter},from_publication_date:{start},to_publication_date:{end}'
    current = fetch('works', filter=current_filter, sort='cited_by_count:desc', **{'per-page': 4})
    previous = fetch('works',
                     filter=f'{title_filter},from_publication_date:{previous_start},to_publication_date:{previous_end}',
                     **{'per-page': 1})
    count, previous_count = current['meta']['count'], previous['meta']['count']
    growth = round((count / previous_count - 1) * 100, 1) if previous_count else None
    papers = [paper_record(work, topic_id, field) for work in current['results']]
    record = {'id': topic_id, 'field': field, 'name': name, 'query': query, 'description': description,
              'count': count, 'previousCount': previous_count, 'growth': growth,
              'sourceUrl': 'https://api.openalex.org/works?' + urllib.parse.urlencode({'filter': current_filter}),
              'paperIds': [paper['id'] for paper in papers]}
    print(f'{topic_id}: {count} articles, {growth}% change', flush=True)
    return record, papers


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--as-of', help='Exclusive end date (YYYY-MM-DD); defaults to today in Seoul')
    args = parser.parse_args()
    today = dt.date.fromisoformat(args.as_of) if args.as_of else dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
    end = today - dt.timedelta(days=1)
    def previous_year(day):
        year = day.year - 1
        return day.replace(year=year, day=min(day.day, calendar.monthrange(year, day.month)[1]))

    start = previous_year(today)
    previous_end = start - dt.timedelta(days=1)
    previous_start = previous_year(start)
    records, all_papers = [], {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as executor:
        jobs = [executor.submit(collect_topic, topic, start, end, previous_start, previous_end) for topic in TOPICS]
        for job in jobs:
            topic, papers = job.result()
            records.append(topic)
            for paper in papers:
                if paper['id'] in all_papers:
                    old = all_papers[paper['id']]
                    old['topicIds'] = sorted(set(old['topicIds'] + paper['topicIds']))
                    old['fields'] = sorted(set(old['fields'] + paper['fields']))
                else:
                    all_papers[paper['id']] = paper
    output = {
        'schemaVersion': 1, 'asOf': str(today), 'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(),
        'source': 'OpenAlex', 'period': {'start': str(start), 'end': str(end), 'previousStart': str(previous_start), 'previousEnd': str(previous_end)},
        'methodology': 'Exact-phrase title searches in OpenAlex, type:article, excluding flagged retractions. Topics overlap. Paper selection: up to four most cited matching articles per topic in the current window. Citation counts are a snapshot. Growth measures indexed publication activity, not scientific progress. Recent periods are subject to indexing lag.',
        'topics': records, 'papers': list(all_papers.values()),
    }
    destination = ROOT / 'public' / 'data' / 'snapshot.json'
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.tmp')
    temporary.write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(destination)
    print(f'Saved {len(records)} topics and {len(all_papers)} unique papers.', flush=True)


if __name__ == '__main__':
    main()
