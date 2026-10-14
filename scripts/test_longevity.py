import json
from pathlib import Path
import unittest
from unittest.mock import patch
import refresh_longevity_trials as registry

ROOT = Path(__file__).resolve().parents[1]
def read(name):
    return json.loads((ROOT / 'public/data' / name).read_text(encoding='utf-8'))

class LongevityContract(unittest.TestCase):
    def test_snapshot_scope_and_reading_lanes(self):
        data = read('longevity.json')
        config = json.loads((ROOT / 'config/longevity.json').read_text(encoding='utf-8'))
        self.assertEqual(len(data['groups']), 4)
        self.assertEqual(len(data['topics']), 14)
        self.assertEqual({t['id']: t['query'] for t in data['topics']}, {t['id']: t['query'] for t in config['topics']})
        self.assertEqual(len(data['papers']), len({p['id'] for p in data['papers']}))
        ids = {t['id'] for t in data['topics']}
        for paper in data['papers']:
            self.assertEqual(paper['fields'], ['longevity'])
            self.assertTrue(set(paper['topicIds']) <= ids)
            self.assertLessEqual(paper['date'], data['period']['end'])
            self.assertFalse(paper['retracted'])
            self.assertEqual(set(paper['topicIds']), set(paper['topicLanes']))
            for lanes in paper['topicLanes'].values():
                if 'review' in lanes:
                    self.assertEqual(paper['type'], 'review')
                if set(lanes) & {'impact', 'latest'}:
                    self.assertNotEqual(paper['type'], 'review')
                if 'latest' in lanes:
                    self.assertLessEqual(data['period']['recentStart'], paper['date'])
        for topic in data['topics']:
            self.assertEqual(len(topic['monthly']), 12)
            self.assertEqual(len({m['month'] for m in topic['monthly']}), 12)
            self.assertTrue(all(m['count'] >= 0 for m in topic['monthly']))
            if topic['previousCount'] < 20:
                self.assertIsNone(topic['growth'])
            for lane, cap in [('latest', 20), ('impact', 10), ('review', 5)]:
                self.assertLessEqual(sum(lane in p['topicLanes'].get(topic['id'], []) for p in data['papers']), cap)

    def test_company_events_keep_date_source_and_registry_plans_separate(self):
        companies, trials = read('longevity-companies.json'), read('longevity-trials.json')
        company_ids = {c['id'] for c in companies['companies']}
        group_ids = {g['id'] for g in read('longevity.json')['groups']}
        for company in companies['companies']:
            self.assertTrue(set(company['groupIds']) <= group_ids)
            for program in company['programs']:
                for nct in program['nctIds']:
                    self.assertEqual(trials['trials'][nct]['sourceUrl'], 'https://clinicaltrials.gov/study/' + nct)
        for event in companies['events']:
            self.assertIn(event['companyId'], company_ids)
            self.assertLessEqual(event['date'], companies['curatedAsOf'])
            self.assertTrue(event['sourceUrl'].startswith('https://'))
            self.assertTrue(event['limitation'])
        er = next(e for e in companies['events'] if e['companyId'] == 'lifebio')
        self.assertEqual(er['participants'], 3)
        self.assertIn(trials['trials']['NCT07290244']['enrollment']['type'], ['ESTIMATED', 'ACTUAL'])
        self.assertGreaterEqual(trials['trials']['NCT07290244']['enrollment']['count'], 0)

    def test_failed_registry_refresh_preserves_observation_and_fetched_date(self):
        previous = read('longevity-trials.json')['trials']['NCT07290244']
        original = json.loads(json.dumps(previous))
        with patch.object(registry.urllib.request, 'urlopen', side_effect=TimeoutError()):
            retained = registry.refresh_trial(previous['id'], previous, '2026-10-15T00:00:00Z')
            unavailable = registry.refresh_trial('NCT00000000', None, '2026-10-15T00:00:00Z')
        self.assertEqual(previous, original)
        self.assertEqual(retained['fetchedAt'], previous['fetchedAt'])
        self.assertEqual(retained['lastUpdate'], previous['lastUpdate'])
        self.assertEqual(retained['refreshStatus'], 'retained')
        self.assertEqual(unavailable['refreshStatus'], 'unavailable')
        self.assertNotIn('enrollment', unavailable)

    def test_missing_registry_results_and_design_remain_unknown(self):
        result = registry.record({'protocolSection': {'identificationModule': {'nctId': 'NCT00000000', 'briefTitle': 'Fixture'}, 'statusModule': {}}})
        self.assertIsNone(result['hasPostedResults'])
        self.assertIsNone(result['enrollment'])
        self.assertIsNone(result['allocation'])

    def test_registry_enrollment_is_preserved_as_estimate_not_result_count(self):
        result = registry.record({'hasResults': False, 'protocolSection': {'identificationModule': {'nctId': 'NCT00000000', 'briefTitle': 'Fixture'}, 'statusModule': {}, 'designModule': {'enrollmentInfo': {'count': 18, 'type': 'ESTIMATED'}}}})
        self.assertEqual(result['enrollment'], {'count': 18, 'type': 'ESTIMATED'})
        self.assertFalse(result['hasPostedResults'])

if __name__ == '__main__':
    unittest.main()
