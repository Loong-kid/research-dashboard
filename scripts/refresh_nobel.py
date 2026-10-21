"""Refresh official Nobel award records; attach the separately sourced bibliography."""
import argparse
import datetime as dt
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/data/nobel.json'
CURATED = ROOT / 'config/nobel-papers.json'
API = 'https://api.nobelprize.org/2.1/nobelPrizes?limit=1000'
CATEGORIES = {'Physics': 'physics', 'Chemistry': 'chemistry', 'Physiology or Medicine': 'medicine'}


def build(api, curated, as_of):
    selected = [prize for prize in api['nobelPrizes'] if prize['category']['en'] in CATEGORIES and int(prize['awardYear']) <= int(as_of[:4])]
    prizes = []
    for raw in selected:
        category = CATEGORIES[raw['category']['en']]
        year = int(raw['awardYear'])
        id = f'{category}-{year}'
        source = f'https://www.nobelprize.org/prizes/{category}/{year}/summary/'
        people = [{'id': p['id'], 'name': p.get('knownName', p.get('fullName', {}))['en'], 'portion': p['portion'],
                   'motivation': p['motivation']['en'], 'sourceUrl': f"https://www.nobelprize.org/laureate/{p['id']}"} for p in raw.get('laureates', [])]
        prizes.append({'id': id, 'category': category, 'year': year, 'awarded': bool(people), 'laureates': people,
                       'topMotivation': raw.get('topMotivation', {}).get('en'), 'sourceUrl': source,
                       'motivationKo': curated.get('summaries', {}).get(id), 'paperIds': [],
                       'backgroundUrl': curated.get('backgrounds', {}).get(id)})
    indexed = {prize['id']: prize for prize in prizes}
    papers = []
    for record in curated['papers']:
        connections = []
        for connection in record['connections']:
            if connection['prizeId'] not in indexed:
                raise ValueError(f"Unknown prize: {connection['prizeId']}")
            prize = indexed[connection['prizeId']]
            people = {p['id']: p['name'] for p in prize['laureates']}
            if not set(connection['laureateIds']) <= people.keys():
                raise ValueError(f"Unknown laureate in {record['id']}")
            if record['year'] > prize['year'] and record.get('role') != 'retrospective':
                raise ValueError(f"Later publication must be identified as retrospective: {record['id']}")
            if not connection['evidence'] or any(not e['url'].startswith('https://') for e in connection['evidence']):
                raise ValueError('Missing evidence')
            connections.append({**connection, 'year': prize['year'], 'category': prize['category'],
                                'laureateNames': [people[id] for id in connection['laureateIds']]})
            prize['paperIds'].append(record['id'])
        fields = list(dict.fromkeys(c['category'] for c in connections))
        source = record.get('metadataUrl') or record['connections'][0]['evidence'][0]['url']
        doi = 'https://doi.org/' + record['doi'] if record.get('doi') else None
        papers.append({'id': record['id'], 'title': record['title'], 'date': str(record['year']), 'datePrecision': 'year',
                       'journal': record.get('journal'), 'authors': record.get('authors', []), 'doi': doi,
                       'oa': bool(record.get('oaUrl')), 'oaUrl': record.get('oaUrl'), 'abstract': record.get('abstract'),
                       'citations': None, 'fwci': None, 'fields': fields + ['nobel'], 'topicIds': [], 'source': 'Nobel bibliography',
                       'sourceUrl': source, 'role': record.get('role', 'research'), 'nobelConnections': connections})
    if len({p['id'] for p in papers}) != len(papers):
        raise ValueError('Duplicate paper IDs')
    years = sorted({p['year'] for p in prizes}, reverse=True)
    expected = {(year, category) for year in years for category in CATEGORIES.values()}
    if {(p['year'], p['category']) for p in prizes} != expected:
        raise ValueError('Official award index is incomplete; retain the previous snapshot')
    return {'schemaVersion': 1, 'asOf': as_of, 'source': 'NobelPrize.org', 'sourceUrl': API,
            'curatedAt': curated['reviewedAt'], 'years': years, 'prizes': sorted(prizes, key=lambda p: (-p['year'], p['category'])),
            'papers': papers, 'stats': {'awarded': sum(p['awarded'] for p in prizes), 'linkedPrizes': sum(bool(p['paperIds']) for p in prizes),
                                      'freePapers': sum(bool(p['oaUrl']) for p in papers)}}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--as-of')
    parser.add_argument('--api-file', type=Path, help='Build from an already downloaded official API response')
    args = parser.parse_args()
    today = args.as_of or str(dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date())
    if args.api_file:
        api = json.loads(args.api_file.read_text(encoding='utf-8'))
    else:
        request = urllib.request.Request(API, headers={'User-Agent': 'ResearchAtlas/0.1 (Nobel award index)'})
        with urllib.request.urlopen(request, timeout=30) as response:
            api = json.load(response)
    if api.get('meta', {}).get('count', 0) > len(api.get('nobelPrizes', [])):
        raise ValueError('API pagination required; do not publish a partial response')
    curated = json.loads(CURATED.read_text(encoding='utf-8'))
    result = build(api, curated, today)
    result['fetchedAt'] = dt.datetime.now(dt.timezone.utc).isoformat()
    temporary = DEST.with_suffix('.tmp')
    temporary.write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(DEST)
    print(f"Nobel: {len(result['years'])} years, {result['stats']['awarded']} awards, {result['stats']['linkedPrizes']} linked awards, {len(result['papers'])} papers")


if __name__ == '__main__':
    main()
