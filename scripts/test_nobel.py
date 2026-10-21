import copy
import json
from pathlib import Path
import unittest
from fractions import Fraction
from refresh_nobel import build

ROOT=Path(__file__).resolve().parents[1]
def read(path):return json.loads((ROOT/path).read_text(encoding='utf-8'))

class NobelArchiveContract(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data=read('public/data/nobel.json')
        cls.curated=read('config/nobel-papers.json')
        cls.prizes={p['id']:p for p in cls.data['prizes']}
        cls.papers={p['id']:p for p in cls.data['papers']}

    def test_every_year_and_category_including_non_awarded_and_deferred_prizes(self):
        years=self.data['years']
        self.assertEqual(years,list(range(max(years),1900,-1)))
        self.assertEqual({(p['year'],p['category']) for p in self.data['prizes']},{(year,c) for year in years for c in ['physics','chemistry','medicine']})
        self.assertFalse(self.prizes['physics-1916']['awarded'])
        self.assertEqual(self.prizes['physics-1921']['laureates'][0]['name'],'Albert Einstein')
        self.assertEqual(self.prizes['medicine-2012']['year'],2012)
        for prize in self.prizes.values():
            self.assertEqual(prize['awarded'],bool(prize['laureates']))
            if prize['laureates']:
                self.assertEqual(sum(Fraction(p['portion']) for p in prize['laureates']),1)
            self.assertTrue(prize['sourceUrl'].startswith('https://www.nobelprize.org/'))

    def test_each_paper_has_provenance_a_valid_laureate_and_honest_publication_year(self):
        self.assertEqual(len(self.papers),len(self.data['papers']))
        for paper in self.papers.values():
            self.assertIn('nobel',paper['fields'])
            self.assertIsNone(paper['citations'])
            self.assertEqual(paper['oa'],bool(paper['oaUrl']))
            if paper['oaUrl']:self.assertTrue(paper['oaUrl'].startswith(('https://','http://')))
            for c in paper['nobelConnections']:
                prize=self.prizes[c['prizeId']]
                self.assertIn(paper['id'],prize['paperIds'])
                self.assertTrue(set(c['laureateIds'])<={p['id'] for p in prize['laureates']})
                self.assertTrue(c['evidence'])
                for source in c['evidence']:
                    self.assertIn(source['kind'],['official','dataset'])
                    self.assertTrue(source['url'].startswith('https://'))
                    if source['kind']=='official':self.assertIn('nobelprize.org/',source['url'])
                    if source.get('page'):self.assertGreater(source['page'],0)
                self.assertLessEqual(int(paper['date']),prize['year'])
        self.assertEqual(self.data['stats']['linkedPrizes'],sum(bool(p['paperIds']) for p in self.prizes.values()))

    def test_yamanaka_and_gurdon_originals_and_corrected_digitization_dates(self):
        papers=[self.papers[id] for id in self.prizes['medicine-2012']['paperIds']]
        mouse=next(p for p in papers if p['doi']=='https://doi.org/10.1016/j.cell.2006.07.024')
        self.assertEqual(mouse['date'],'2006')
        self.assertTrue(mouse['oaUrl'])
        self.assertIn('Shinya Yamanaka',str(mouse['nobelConnections']))
        self.assertTrue(any(e['kind']=='official' for c in mouse['nobelConnections'] for e in c['evidence']))
        self.assertTrue(any(p['doi']=='https://doi.org/10.1016/j.cell.2007.11.019' for p in papers))
        bohr=next(p for p in self.papers.values() if p['doi']=='https://doi.org/10.1080/14786441308634993')
        self.assertEqual(bohr['date'],'1913')
        self.assertTrue(self.curated['excludedRecords'])

    def test_recent_awards_cover_each_laureate_with_official_evidence(self):
        for prize in self.prizes.values():
            if not 2017 <= prize['year'] <= int(self.curated['reviewedAt'][:4]) or not prize['awarded']:continue
            connections=[c for id in prize['paperIds'] for c in self.papers[id]['nobelConnections'] if c['prizeId']==prize['id']]
            self.assertEqual({id for c in connections for id in c['laureateIds']},{p['id'] for p in prize['laureates']},prize['id'])
            self.assertTrue(all(any(e['kind']=='official' for e in c['evidence']) for c in connections))

    def test_published_bibliography_matches_reviewed_source(self):
        self.assertEqual(set(self.papers), {p['id'] for p in self.curated['papers']})
        for record in self.curated['papers']:
            paper = self.papers[record['id']]
            self.assertEqual(paper['doi'], 'https://doi.org/' + record['doi'] if record.get('doi') else None)
            self.assertEqual(paper['oaUrl'], record.get('oaUrl'))
            self.assertEqual(paper['title'], record['title'])

    def test_missing_or_future_connections_cannot_publish(self):
        # A minimal official API fixture exercises validation without network access.
        api={'nobelPrizes':[{'awardYear':'2012','category':{'en':category},'laureates':[{'id':'1','knownName':{'en':'Fixture'},'portion':'1','motivation':{'en':'for a discovery'}}]} for category in ['Physics','Chemistry','Physiology or Medicine']]}
        curated={'reviewedAt':'2026-10-21','papers':[{'id':'fixture','title':'Fixture work','year':2011,'connections':[{'prizeId':'medicine-2012','laureateIds':['1'],'evidence':[{'kind':'official','url':'https://www.nobelprize.org/fixture','label':'Fixture'}]}]}]}
        self.assertEqual(len(build(api,curated,'2026-10-21')['papers']),1)
        bad=copy.deepcopy(curated);bad['papers'][0]['connections'][0]['laureateIds']=['wrong-id']
        with self.assertRaises(ValueError):build(api,bad,'2026-10-21')
        bad=copy.deepcopy(curated);bad['papers'][0]['year']=2020
        with self.assertRaises(ValueError):build(api,bad,'2026-10-21')
        incomplete=copy.deepcopy(api);incomplete['nobelPrizes'].pop()
        with self.assertRaises(ValueError):build(incomplete,curated,'2026-10-21')

if __name__=='__main__':unittest.main()
