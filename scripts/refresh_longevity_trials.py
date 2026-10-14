"""Public ClinicalTrials.gov metadata; registry plans are not sponsor result counts."""
import datetime as dt
import json
from pathlib import Path
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'public/data/longevity-trials.json'
COMPANIES = ROOT / 'public/data/longevity-companies.json'


def record(data):
    protocol = data['protocolSection']
    identity, status = protocol['identificationModule'], protocol['statusModule']
    design = protocol.get('designModule', {})
    return {'id': identity['nctId'], 'title': identity['briefTitle'], 'sponsor': protocol.get('sponsorCollaboratorsModule', {}).get('leadSponsor', {}).get('name'),
            'status': status.get('overallStatus'), 'statusVerifiedDate': status.get('statusVerifiedDate'),
            'lastUpdate': status.get('lastUpdatePostDateStruct', {}).get('date'), 'phases': design.get('phases', []),
            'studyType': design.get('studyType'), 'allocation': design.get('designInfo', {}).get('allocation'),
            'masking': design.get('designInfo', {}).get('maskingInfo', {}).get('masking'),
            'enrollment': design.get('enrollmentInfo'), 'primaryCompletion': status.get('primaryCompletionDateStruct'),
            'hasPostedResults': data.get('hasResults'), 'conditions': protocol.get('conditionsModule', {}).get('conditions', []),
            'primaryOutcomes': protocol.get('outcomesModule', {}).get('primaryOutcomes', []),
            'sourceUrl': 'https://clinicaltrials.gov/study/' + identity['nctId'], 'fetchedAt': dt.datetime.now(dt.timezone.utc).isoformat(), 'refreshStatus': 'refreshed'}


def refresh_trial(nct, previous, attempted):
    try:
        with urllib.request.urlopen('https://clinicaltrials.gov/api/v2/studies/' + nct, timeout=25) as response:
            value = record(json.load(response))
        if value['id'] != nct:
            raise ValueError('Registry ID mismatch')
        return value
    except Exception:
        retained = dict(previous or {'id': nct, 'sourceUrl': 'https://clinicaltrials.gov/study/' + nct})
        retained['refreshStatus'] = 'retained' if retained.get('fetchedAt') else 'unavailable'
        retained['lastAttemptAt'] = attempted
        return retained


def main():
    existing = json.loads(DEST.read_text(encoding='utf-8')) if DEST.exists() else {'trials': {}}
    try:
        with urllib.request.urlopen('https://loong-kid.github.io/research-dashboard/data/longevity-trials.json', timeout=15) as response:
            deployed = json.load(response)
        for key, value in deployed.get('trials', {}).items():
            if deployed.get('schemaVersion') == 1 and value.get('id') == key and value.get('sourceUrl') == 'https://clinicaltrials.gov/study/' + key and value.get('fetchedAt', '') > existing['trials'].get(key, {}).get('fetchedAt', ''):
                existing['trials'][key] = value
    except Exception:
        pass
    companies = json.loads(COMPANIES.read_text(encoding='utf-8'))
    ids = sorted({nct for company in companies['companies'] for program in company['programs'] for nct in program['nctIds']})
    attempted = dt.datetime.now(dt.timezone.utc).isoformat()
    for nct in ids:
        existing['trials'][nct] = refresh_trial(nct, existing['trials'].get(nct), attempted)
    existing.update({'schemaVersion': 1, 'attemptedAt': attempted, 'source': 'ClinicalTrials.gov'})
    temporary = DEST.with_suffix('.tmp')
    temporary.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding='utf-8')
    temporary.replace(DEST)
    print(f'ClinicalTrials.gov: {sum(t.get("refreshStatus") == "refreshed" for t in existing["trials"].values())}/{len(ids)} records refreshed.')


if __name__ == '__main__':
    main()
