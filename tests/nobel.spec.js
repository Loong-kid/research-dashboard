import { test, expect } from '@playwright/test';

test('all three Nobel categories have year navigation from 1901 and include unawarded years', async ({ page }) => {
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('./#nobel');
  await expect(page.getByRole('button',{name:'노벨상',exact:true})).toBeVisible();
  const data=await (await page.request.get('./data/nobel.json')).json();
  await expect(page.getByRole('combobox',{name:'노벨상 수상 연도'}).locator('option')).toHaveCount(data.years.length);
  await expect(page.locator('.nobel-award-year')).toHaveText(String(data.years[0]));
  for(const name of ['물리학상','화학상','생리의학상']) {
    await page.getByRole('button',{name,exact:true}).click();
    await expect(page.locator('.nobel-laureates article').first()).toBeVisible();
    await expect(page.locator('.nobel-paper').first()).toBeVisible();
  }
  await page.getByRole('button',{name:'물리학상',exact:true}).click();
  await page.getByRole('combobox',{name:'노벨상 수상 연도'}).selectOption('1916');
  await expect(page.locator('.nobel-no-award')).toContainText('수여되지 않았어');
  await expect(page.locator('.nobel-paper')).toHaveCount(0);
  await page.getByRole('combobox',{name:'노벨상 수상 연도'}).selectOption('1921');
  await expect(page.locator('.nobel-laureates')).toContainText('Albert Einstein');
  await expect(page.locator('.nobel-award-year')).toHaveText('1921');
  expect(errors).toEqual([]);
});

test('2012 reprogramming sources distinguish Gurdon and Yamanaka and preserve year links', async ({ page }) => {
  await page.goto('./#nobel?category=medicine&year=2012');
  await expect(page.locator('.nobel-laureates article')).toHaveCount(2);
  await expect(page.locator('.nobel-paper')).toHaveCount(4);
  const data=await (await page.request.get('./data/nobel.json')).json();
  const prize=data.prizes.find(p=>p.id==='medicine-2012');
  const yamanaka=prize.laureates.find(p=>p.name==='Shinya Yamanaka');
  await page.getByRole('combobox',{name:'연결된 수상자'}).selectOption(yamanaka.id);
  await expect(page.locator('.nobel-paper')).toHaveCount(2);
  const paper=page.locator('.nobel-paper').filter({has:page.getByRole('button',{name:/mouse embryonic and adult fibroblast cultures/i})});
  await expect(paper.getByRole('link',{name:'출판사 원문',exact:true})).toHaveAttribute('href','https://doi.org/10.1016/j.cell.2006.07.024');
  await expect(paper.getByRole('link',{name:'무료 원문 읽기',exact:true})).toBeVisible();
  await paper.locator('summary').click();
  await expect(paper.locator('.nobel-paper-evidence')).toContainText('노벨상 공식 과학적 배경');
  await page.reload();
  await expect(page.locator('.nobel-award-year')).toHaveText('2012');
  await expect(page.getByRole('button',{name:'생리의학상',exact:true})).toHaveAttribute('aria-pressed','true');
});

test('Nobel papers share reading notes and bookmarks without inventing citation counts', async ({ page }) => {
  await page.goto('./#nobel?category=medicine&year=2012');
  await page.locator('.nobel-paper-title').filter({hasText:/mouse embryonic and adult fibroblast cultures/i}).click();
  await expect(page.locator('.nobel-detail-context')).toContainText('2012년 노벨 생리의학상');
  await expect(page.locator('.detail-publication')).not.toContainText('인용 0회');
  await page.getByRole('button',{name:'내 서재에 저장',exact:true}).click();
  await page.getByRole('textbox',{name:/나의 읽기 메모/}).fill('완전 재프로그래밍의 원전 · 2006년');
  await page.keyboard.press('Escape');
  await page.locator('.heading-library').click();
  await page.getByRole('combobox').first().selectOption('nobel');
  await expect(page.locator('.paper-title')).toHaveCount(1);
  await page.locator('.paper-title').click();
  await expect(page.getByRole('textbox',{name:/나의 읽기 메모/})).toHaveValue('완전 재프로그래밍의 원전 · 2006년');
  await page.locator('.nobel-detail-context > div > a').first().click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.nobel-award-year')).toHaveText('2012');
  await page.locator('.nobel-paper-title').first().click();
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('search, honest gaps and source methodology work without the OpenAlex snapshot', async ({ page }) => {
  await page.route('**/data/snapshot.json',route=>route.fulfill({status:503,body:'Unavailable'}));
  await page.goto('./#nobel');
  await expect(page.locator('.nobel-award')).toBeVisible();
  await page.getByRole('textbox',{name:'논문·연구 주제 검색'}).fill('Yamanaka');
  await expect(page.locator('.nobel-award-year')).toHaveText('2012');
  await page.getByRole('textbox',{name:'논문·연구 주제 검색'}).fill('no-match-92361');
  await expect(page.getByRole('heading',{name:'조건에 맞는 수상 기록이 없어.'})).toBeVisible();
  await page.getByRole('button',{name:'검색 초기화',exact:true}).click();
  await page.getByRole('combobox',{name:'노벨상 수상 연도'}).selectOption('1901');
  await expect(page.locator('.nobel-unlinked')).toContainText('확인된 기여 논문 연결이 아직 없어');
  await expect(page.locator('.nobel-unlinked a')).toBeVisible();
  await page.getByRole('button',{name:'논문 선정 근거와 수집 범위',exact:true}).click();
  await expect(page.getByRole('heading',{name:'수상에서 원전까지 읽는 방법'})).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('공식 노벨상 위원회가 지정한 논문 목록도 아니야');
});

for(const width of [320,375,768,1440]) {
  test(`Nobel laureates, sources and reading dialog fit ${width}px`,async({page})=>{
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    await page.setViewportSize({width,height:1000});
    await page.goto('./#nobel?category=medicine&year=2012');
    await expect(page.locator('.nobel-paper')).toHaveCount(4);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await page.screenshot({path:`.cache/nobel-map-${width}.png`,fullPage:true,animations:'disabled'});
    await page.locator('.nobel-paper-title').first().click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBeTruthy();
    await page.screenshot({path:`.cache/nobel-reader-${width}.png`,fullPage:true,animations:'disabled'});
    expect(errors).toEqual([]);
  });
}
