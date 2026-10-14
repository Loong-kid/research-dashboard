import json
from pathlib import Path
import unittest
from unittest.mock import patch
import datetime as dt
import refresh_quantum

ROOT = Path(__file__).resolve().parents[1]


class QuantumContract(unittest.TestCase):
    def test_public_snapshot_separates_publication_types_and_topic_membership(self):
        data = json.loads((ROOT / 'public/data/quantum-computing.json').read_text(encoding='utf-8'))
        self.assertEqual(len(data['groups']), 6)
        self.assertEqual(len(data['topics']), 14)
        self.assertEqual(len(data['papers']), len({p['id'] for p in data['papers']}))
        for paper in data['papers']:
            self.assertFalse(paper['retracted'])
            if 'preprint' in paper['lanes']:
                self.assertEqual(paper['type'], 'preprint')
                self.assertFalse(set(paper['lanes']) & {'impact', 'latest', 'review'})
                self.assertLessEqual(data['period']['recentStart'], paper['date'])
            if 'review' in paper['lanes']:
                self.assertEqual(paper['type'], 'review')
            if set(paper['lanes']) & {'latest', 'impact'}:
                self.assertEqual(paper['type'], 'article')
            self.assertLessEqual(paper['date'], data['period']['end'])
        for topic in data['topics']:
            self.assertEqual(len(topic['monthly']), 12)
            if topic['previousCount'] < 20:
                self.assertIsNone(topic['growth'])
            for lane, cap in [('latest', 20), ('impact', 10), ('review', 5), ('preprint', 20)]:
                members = [p for p in data['papers'] if lane in p['topicLanes'].get(topic['id'], [])]
                self.assertLessEqual(len(members), cap)

    def test_preprints_never_inflate_journal_counts_or_monthly_history(self):
        topic = {'id': 'test', 'query': 'quantum', 'name': 'test'}
        works = [{'id': f'https://openalex.org/W{i}', 'type': typ, 'title': title, 'publication_date': date, 'cited_by_count': 0} for i, typ, title, date in [(1, 'article', 'A quantum experiment', '2026-09-20'), (2, 'article', 'Quantum survey', '2026-01-10'), (3, 'article', 'Old quantum work', '2025-09-20')]]
        preprint = {'id': 'https://openalex.org/W4', 'type': 'preprint', 'title': 'Quantum preprint', 'publication_date': '2026-10-01'}
        def response(title, first, last, **options):
            if options.get('kind') == 'preprint':
                return {'meta': {'count': 100}, 'results': [preprint]}
            return {'meta': {'count': 3}, 'results': works}
        with patch.object(refresh_quantum, 'query', side_effect=response):
            stats, papers = refresh_quantum.collect(topic, dt.date(2026, 10, 14))
        self.assertEqual(stats['count'], 2)
        self.assertEqual(stats['previousCount'], 1)
        self.assertEqual(stats['preprintCount'], 100)
        self.assertEqual(sum(point['count'] for point in stats['monthly']), 2)
        self.assertEqual(next(p for p in papers if p['id'] == 'W2')['type'], 'review')


if __name__ == '__main__':
    unittest.main()
