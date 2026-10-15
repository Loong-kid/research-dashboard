"""Longevity topic adapter sharing Europe PMC's validated collection primitives."""
import argparse
from concurrent.futures import ThreadPoolExecutor
import datetime as dt
import json
from pathlib import Path
import urllib.request
import refresh_neuroscience as epmc

ROOT = Path(__file__).resolve().parents[1]
CONFIG = json.loads((ROOT / 'config/longevity.json').read_text(encoding='utf-8'))
DEST = ROOT / 'public/data/longevity.json'


def apply_taxonomy(snapshot):
    """Update the reading hierarchy without changing collected facts or dates."""
    expected = {topic['id']: topic for topic in CONFIG['topics']}
    observed = {topic['id']: topic for topic in snapshot.get('topics', [])}
    if snapshot.get('field') != 'longevity' or expected.keys() != observed.keys() or any(
        observed[id].get('query') != topic['query'] for id, topic in expected.items()
    ):
        raise ValueError('Topic queries differ; collect a new snapshot before updating the taxonomy.')
    return {**snapshot, 'name': CONFIG['name'], 'description': CONFIG['description'],
            'defaultTopic': CONFIG['defaultTopic'], 'groups': CONFIG['groups'],
            'subgroups': CONFIG['subgroups'], 'taxonomyVersion': 'longevity-hierarchy-v1',
            'topics': [{**observed[id], **topic} for id, topic in expected.items()],
            'methodology': snapshot['methodology'].replace('Four overlapping reading categories', 'Three overlapping approaches, with epigenetic reprogramming nested under cellular rejuvenation')}


def restore():
    try:
        with urllib.request.urlopen('https://loong-kid.github.io/research-dashboard/data/longevity.json', timeout=20) as response:
            value = json.load(response)
        expected = {topic['id']: topic['query'] for topic in CONFIG['topics']}
        if value.get('field') != 'longevity' or {topic['id']: topic['query'] for topic in value.get('topics', [])} != expected:
            return
        old = json.loads(DEST.read_text(encoding='utf-8')) if DEST.exists() else {}
        if value.get('asOf', '') > old.get('asOf', ''):
            DEST.write_text(json.dumps(apply_taxonomy(value), ensure_ascii=False, indent=2), encoding='utf-8')
    except Exception:
        print('Using the checked-in longevity snapshot.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--as-of')
    parser.add_argument('--restore-only', action='store_true')
    parser.add_argument('--metadata-only', action='store_true', help='Apply current hierarchy to an unchanged-query snapshot; preserve all observations and collection dates.')
    args = parser.parse_args()
    if args.metadata_only:
        snapshot = json.loads(DEST.read_text(encoding='utf-8'))
        DEST.write_text(json.dumps(apply_taxonomy(snapshot), ensure_ascii=False, indent=2), encoding='utf-8')
        print('Updated longevity hierarchy; collected facts and timestamps are unchanged.')
        return
    if args.restore_only:
        restore()
        return
    today = dt.date.fromisoformat(args.as_of) if args.as_of else dt.datetime.now(dt.timezone(dt.timedelta(hours=9))).date()
    epmc.CACHE = ROOT / '.cache/europepmc' / str(today)
    topics, papers = [], {}
    with ThreadPoolExecutor(max_workers=3) as pool:
        for topic, items in pool.map(lambda topic: epmc.collect_topic(topic, today), CONFIG['topics']):
            topic['field'] = 'longevity'
            topics.append(topic)
            for paper in items:
                paper['fields'] = ['longevity']
                if paper['id'] not in papers:
                    papers[paper['id']] = paper
                else:
                    old = papers[paper['id']]
                    old['topicIds'] = sorted(set(old['topicIds'] + paper['topicIds']))
                    old['lanes'] = sorted(set(old['lanes'] + paper['lanes']))
                    for topic_id, lanes in paper['topicLanes'].items():
                        old['topicLanes'][topic_id] = sorted(set(old['topicLanes'].get(topic_id, []) + lanes))
    start = epmc.shift_year(today)
    output = {'schemaVersion': 2, 'field': 'longevity', 'name': CONFIG['name'], 'description': CONFIG['description'], 'defaultTopic': CONFIG['defaultTopic'],
              'asOf': str(today), 'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'source': 'Europe PMC / PubMed',
              'period': {'start': str(start), 'end': str(today-dt.timedelta(days=1)), 'previousStart': str(epmc.shift_year(start)), 'previousEnd': str(start-dt.timedelta(days=1)), 'recentStart': str(today-dt.timedelta(days=30))},
              'groups': CONFIG['groups'], 'topics': topics, 'papers': list(papers.values()), 'queryVersion': 'longevity-v3',
              'methodology': 'Four overlapping reading categories, not a claim of immortality. PubMed title-synonym queries. Counts include reviews; latest/impact exclude reviews and retracted records. Monthly: 12 complete calendar months. Latest:20/topic/30 days, impact:10/topic/12 months, review:5/topic/12 months. Deduplicate PubMed IDs; overlap allowed. MeSH Humans may include human cells, not clinical evidence. Company profiles/events are manually sourced and dated separately from automatic papers and trial-registry metadata.'}
    temporary = DEST.with_suffix('.tmp')
    temporary.write_text(json.dumps(apply_taxonomy(output), ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(DEST)
    print(f'Longevity snapshot saved: {len(topics)} topics, {len(papers)} papers.')


if __name__ == '__main__':
    main()
