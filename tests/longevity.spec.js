import { test, expect } from '@playwright/test';

test('longevity has the requested four fields, fourteen topics and real monthly history', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./#longevity');
  await expect(page.getByRole('button', { name: '불로장생', exact: true })).toContainText('14개 주제');
  await expect(page.locator('.neuro-area')).toHaveCount(4);
  await expect(page.locator('.neuro-topic')).toHaveCount(14);
  await expect(page.locator('.neuro-focus h2')).toHaveText('부분 재프로그래밍');
  await expect(page.locator('.neuro-bar-column')).toHaveCount(12);
  for (const [name, count] of [['세포 회춘', 3], ['후성유전 재프로그래밍', 4], ['노화세포 제거', 3], ['인공장기', 4]]) {
    await page.getByRole('button', { name, exact: true }).click();
    await expect(page.locator('.neuro-topic')).toHaveCount(count);
  }
  await page.getByRole('button', { name: '수집 범위와 해석' }).click();
  await expect(page.getByRole('heading', { name: '불로장생 연구를 읽는 방법' })).toBeVisible();
  await expect(page.locator('.query-list a')).toHaveCount(14);
  expect(errors).toEqual([]);
});

test('paper reading, source, bookmarks and notes work in the shared library', async ({ page }) => {
  await page.goto('./#longevity');
  await page.getByRole('tab', { name: '최신 연구' }).click();
  await expect(page.locator('.neuro-filter-caption')).toContainText('인간 유래 세포');
  await page.locator('.paper-title').first().click();
  await expect(page.getByRole('link', { name: 'Europe PMC에서 서지정보 확인' })).toHaveAttribute('href', /^https:\/\/europepmc.org/);
  await page.getByRole('button', { name: '내 서재에 저장', exact: true }).click();
  await page.getByRole('textbox', { name: /나의 읽기 메모/ }).fill('기능 회복과 시계 변화를 따로 확인');
  await page.keyboard.press('Escape');
  await page.locator('.heading-library').click();
  await page.getByRole('combobox').first().selectOption('longevity');
  await expect(page.locator('.paper-title')).toHaveCount(1);
  await page.locator('.paper-title').click();
  await expect(page.getByRole('textbox', { name: /나의 읽기 메모/ })).toHaveValue('기능 회복과 시계 변화를 따로 확인');
});

test('company research separates dated announcements from trial registry plans and persists watches', async ({ page }) => {
  await page.goto('./#longevity');
  await page.getByRole('tab', { name: '기업 연구' }).click();
  await expect(page.locator('.long-company')).toHaveCount(9);
  await expect(page.locator('.long-events article')).toHaveCount(7);
  await expect(page.locator('.long-company-note')).toContainText('수동 정리');
  const life = page.locator('.long-company').filter({ has: page.getByRole('heading', { name: 'Life Biosciences', exact: true }) });
  await life.locator('.long-trial > summary').click();
  const registry = await (await page.request.get('./data/longevity-trials.json')).json();
  await expect(life.locator('.long-trial')).toContainText(registry.trials.NCT07290244.enrollment.type === 'ESTIMATED' ? '모집 예정 인원' : '등록된 실제 인원');
  await expect(life.locator('.long-trial')).toContainText('회사 중간발표의 분석 인원과 별도');
  await expect(life.locator('.long-trial')).toContainText('등록 마지막 업데이트');
  await expect(page.locator('.long-events article').first()).toContainText('3명 / 56일');
  await page.getByRole('button', { name: 'Life Biosciences 관심 기업 등록', exact: true }).click();
  await page.getByRole('checkbox', { name: '관심 기업만' }).check();
  await expect(page.locator('.long-company')).toHaveCount(1);
  await page.reload();
  await page.getByRole('tab', { name: '기업 연구' }).click();
  await expect(page.getByRole('button', { name: 'Life Biosciences 관심 기업 해제', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '인공장기', exact: true }).click();
  await expect(page.locator('.long-company')).toHaveCount(2);
  await page.getByRole('textbox', { name: '논문·연구 주제 검색' }).fill('BiVACOR');
  await expect(page.locator('.long-company')).toHaveCount(1);
  await expect(page.getByRole('tab', { name: '기업 연구' })).toHaveAttribute('aria-selected', 'true');
});

test('a shared PubMed paper keeps both neuroscience and longevity connections in one saved record', async ({ page }) => {
  const longevity = await (await page.request.get('./data/longevity.json')).json();
  const neuro = await (await page.request.get('./data/neuroscience.json')).json();
  const shared = longevity.papers.find(paper => neuro.papers.some(other => other.id === paper.id));
  expect(shared).toBeTruthy();
  await page.goto('./#longevity');
  await page.evaluate(paper => localStorage.setItem('research-atlas-library', JSON.stringify([paper])), shared);
  await page.reload();
  await page.locator('.heading-library').click();
  for (const field of ['longevity', 'neuroscience']) {
    await page.getByRole('combobox').first().selectOption(field);
    await expect(page.locator('.paper-title')).toHaveCount(1);
  }
  await page.locator('.paper-title').click();
  await expect(page.locator('.neuro-reading-guide')).toBeVisible();
  await expect(page.locator('.detail-context')).toHaveCount(new Set([...shared.topicIds, ...neuro.papers.find(paper => paper.id === shared.id).topicIds]).size);
});

test('registry refresh failure keeps its observed date and an honest retained status', async ({ page }) => {
  await page.route('**/data/longevity-trials.json', async route => {
    const response = await route.fetch();
    const json = await response.json();
    json.trials.NCT07290244.refreshStatus = 'retained';
    json.trials.NCT07290244.lastAttemptAt = '2026-10-15T00:00:00Z';
    await route.fulfill({ response, json });
  });
  await page.goto('./#longevity');
  await page.getByRole('tab', { name: '기업 연구' }).click();
  const life = page.locator('.long-company').filter({ has: page.getByRole('heading', { name: 'Life Biosciences', exact: true }) });
  await life.locator('summary').first().click();
  await expect(life.getByRole('status')).toContainText('마지막 확인 정보');
  await expect(life.locator('.long-source-date')).toContainText('등록 마지막 업데이트');
});

test('guides and filtered feeds remain distinct with empty search recovery', async ({ page }) => {
  await page.goto('./#longevity');
  await page.getByRole('tab', { name: '읽기 가이드' }).click();
  await expect(page.locator('.neuro-guide-grid article')).toHaveCount(14);
  await page.getByRole('button', { name: '노화세포 제거', exact: true }).click();
  await expect(page.locator('.neuro-guide-grid article')).toHaveCount(3);
  await page.getByRole('tab', { name: '입문 리뷰' }).click();
  await expect(page.locator('.paper-title').first()).toBeVisible();
  const signals = await page.locator('.neuro-paper-signals').allTextContents();
  expect(signals.every(label => label.includes('리뷰·메타분석'))).toBeTruthy();
  await page.getByRole('textbox', { name: '논문·연구 주제 검색' }).fill('no-match-k5v719');
  await expect(page.getByRole('heading', { name: '조건에 맞는 논문이 없어.' })).toBeVisible();
  await page.getByRole('button', { name: '필터 초기화' }).click();
  await expect(page.locator('.paper-title').first()).toBeVisible();
});

for (const width of [320, 375, 414, 768, 1440]) {
  test(`longevity map and expanded registry fit ${width}px`, async ({ page }) => {
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('./#longevity');
    await expect(page.locator('.neuro-focus')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `.cache/longevity-map-${width}.png`, fullPage: true });
    await page.getByRole('tab', { name: '기업 연구' }).click();
    await page.locator('.long-trial summary').first().click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `.cache/longevity-companies-${width}.png`, fullPage: true });
    expect(errors).toEqual([]);
  });
}
