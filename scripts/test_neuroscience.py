"""Contracts that guard against silently misleading live scholarly feeds."""
import datetime as dt
import json
from pathlib import Path
import unittest
from refresh_neuroscience import month_windows, paper_record, clean

ROOT = Path(__file__).resolve().parents[1]


class SnapshotContract(unittest.TestCase):
    def test_source_lanes_dates_and_deduplication(self):
        data = json.loads((ROOT / 'public/data/neuroscience.json').read_text(encoding='utf-8'))
        papers = data['papers']
        self.assertEqual(len(papers), len({paper['id'] for paper in papers}))
        for paper in papers:
            self.assertTrue(paper['id'].startswith('EPMC-MED-'))
            if any(lane in paper['lanes'] for lane in ('impact', 'latest')):
                self.assertEqual(paper['type'], 'article')
            if 'review' in paper['lanes']:
                self.assertEqual(paper['type'], 'review')
            if 'latest' in paper['lanes']:
                self.assertLessEqual(data['period']['recentStart'], paper['date'])
            if any(lane in paper['lanes'] for lane in ('impact', 'latest', 'review')):
                self.assertLessEqual(data['period']['start'], paper['date'])
                self.assertLessEqual(paper['date'], data['period']['end'])
            self.assertFalse(paper['retracted'])
            self.assertTrue(paper['sourceUrl'].startswith('https://europepmc.org/article/MED/'))
        for topic in data['topics']:
            self.assertEqual(len(topic['monthly']), 12)
            self.assertTrue(all(point['count'] >= 0 for point in topic['monthly']))
            if topic['previousCount'] < 20:
                self.assertIsNone(topic['growth'])
        groups = {group['id'] for group in data['groups']}
        self.assertEqual(len(groups), 6)
        self.assertTrue(all(topic['group'] in groups for topic in data['topics']))
        notes = json.loads((ROOT / 'public/data/neuroscience-notes.json').read_text(encoding='utf-8'))
        self.assertTrue(set(notes).issubset({paper['id'] for paper in papers}))

    def test_unknown_metadata_does_not_become_a_human_trial(self):
        record = paper_record({'id': '123', 'source': 'MED', 'title': 'Mouse study', 'abstractText': 'human relevance'}, 't', 'latest')
        self.assertEqual(record['studySignals'], [])
        self.assertFalse(record['oa'])
        self.assertIsNone(record['fwci'])
        human = paper_record({'id': '456', 'source': 'MED', 'title': 'Study', 'meshHeadingList': {'meshHeading': [{'descriptorName': 'Humans'}, {'descriptorName': 'Animals'}]}}, 't', 'impact')
        self.assertEqual({signal['id'] for signal in human['studySignals']}, {'human', 'animal'})

    def test_review_label_and_encoded_markup_are_preserved_correctly(self):
        record = paper_record({'id': '123', 'source': 'MED', 'title': 'A systematic review and meta-analysis', 'pubTypeList': {'pubType': ['Journal Article']}}, 't', 'review')
        self.assertEqual(record['type'], 'review')
        self.assertEqual(clean('In &lt;i&gt;Drosophila&lt;/i&gt; &amp; mice'), 'In Drosophila & mice')

    def test_complete_calendar_months_cover_year_and_leap_day(self):
        windows = month_windows(dt.date(2024, 3, 15))
        self.assertEqual(windows[-1], (dt.date(2024, 2, 1), dt.date(2024, 2, 29)))
        self.assertEqual(windows[0][0], dt.date(2023, 3, 1))
        for (_, previous_end), (next_start, _) in zip(windows, windows[1:]):
            self.assertEqual(previous_end + dt.timedelta(days=1), next_start)


if __name__ == '__main__':
    unittest.main()
