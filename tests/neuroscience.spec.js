import { test, expect } from '@playwright/test';

test('neuroscience is the default and a topic reveals monthly history and its recent research', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('뇌');
  await expect(page.locator('.neuro-area')).toHaveCount(6);
  await expect(page.locator('.neuro-topic')).toHaveCount(12);
  await page.locator('.neuro-topic').filter({ hasText: '기억·학습' }).click();
  await expect(page.locator('.neuro-focus h2')).toHaveText('기억·학습');
  await expect(page.locator('.neuro-bar-column')).toHaveCount(12);
  await page.getByText('월별 수치 보기', { exact: true }).click();
  await expect(page.locator('.neuro-chart-table tbody tr')).toHaveCount(12);
  await page.getByRole('button', { name: '이 주제의 최신 연구' }).click();
  await expect(page.getByRole('tab', { name: '최신 연구' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByLabel('뇌과학 주제')).toHaveValue('neuro-memory');
  await expect(page.locator('.paper-title').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('area, feed and study filters select corresponding real records', async ({ page }) => {
  await page.goto('./#neuroscience');
  await page.getByRole('button', { name: '뇌공학', exact: true }).click();
  await expect(page.locator('.neuro-area')).toHaveCount(1);
  await expect(page.locator('.neuro-topic')).toHaveCount(2);
  await page.getByRole('tab', { name: '입문 리뷰' }).click();
  await expect(page.locator('.neuro-paper-signals').first()).toContainText('리뷰·메타분석');
  await page.getByRole('tab', { name: '인용 상위' }).click();
  await page.getByLabel('연구 대상', { exact: true }).selectOption('human');
  const signals = await page.locator('.neuro-paper-signals').allTextContents();
  expect(signals.length).toBeGreaterThan(0);
  expect(signals.every(text => text.includes('원 연구') && text.includes('사람'))).toBeTruthy();
  await page.getByRole('checkbox', { name: 'Nature 계열' }).check();
  await expect(page.locator('.journal-name').first()).toContainText(/Nature/i);
  await page.getByRole('textbox', { name: '논문·연구 주제 검색' }).fill('no-record-8a43f');
  await expect(page.getByRole('heading', { name: '조건에 맞는 논문이 없어.' })).toBeVisible();
  await page.getByRole('button', { name: '필터 초기화' }).click();
  await expect(page.locator('.paper-title').first()).toBeVisible();
});

test('curated Korean notes cite the abstract and saving preserves paper, reading note and export', async ({ page }) => {
  await page.goto('./#neuroscience');
  await page.getByRole('tab', { name: '읽기 가이드' }).click();
  await page.locator('.neuro-curated button').filter({ hasText: '65,536' }).click();
  await expect(page.getByRole('dialog', { name: '논문 상세' })).toBeVisible();
  await expect(page.locator('.neuro-reading-note')).toContainText('1,024');
  await expect(page.locator('.neuro-reading-note')).toContainText('동물 실험');
  await expect(page.getByRole('link', { name: '해설 근거: 저자 초록' })).toHaveAttribute('href', /europepmc.org\/article\/MED\//);
  await page.getByRole('button', { name: '내 서재에 저장', exact: true }).click();
  await page.getByRole('textbox', { name: /나의 읽기 메모/ }).fill('동물 모델과 사람의 성능을 구분하기');
  await page.keyboard.press('Escape');
  await page.locator('.heading-library').click();
  await expect(page.locator('.paper-title')).toHaveCount(1);
  await page.reload();
  await page.getByRole('tab', { name: /내 서재/ }).click();
  await page.locator('.paper-title').click();
  await expect(page.getByRole('textbox', { name: /나의 읽기 메모/ })).toHaveValue('동물 모델과 사람의 성능을 구분하기');
  await expect(page.locator('.neuro-reading-note')).toBeVisible();
  await page.keyboard.press('Escape');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: '서재 내보내기' }).click();
  expect((await download).suggestedFilename()).toBe('research-atlas-library.md');
});

test('Nature editorial links keep commentaries separate and methodology exposes reproducible queries', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('tab', { name: 'Nature 편집 해설' }).click();
  await expect(page.locator('.neuro-editorial-note')).toContainText('편집 해설');
  const links = await page.locator('.neuro-editorial-list h3 a').evaluateAll(nodes => nodes.map(node => node.href));
  expect(links.length).toBeGreaterThan(0);
  expect(links.every(url => url.startsWith('https://www.nature.com/articles/'))).toBeTruthy();
  await page.getByRole('button', { name: '수집 범위와 해석' }).click();
  await expect(page.getByRole('heading', { name: '뇌과학 숫자를 읽는 방법' })).toBeVisible();
  await expect(page.locator('.query-list a')).toHaveCount(12);
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: '읽기 가이드' }).click();
  await expect(page.locator('.neuro-guide-grid article')).toHaveCount(12);
  await page.getByRole('button', { name: '뇌질환', exact: true }).click();
  await expect(page.locator('.neuro-guide-grid article')).toHaveCount(2);
});

for (const width of [320, 375, 414, 768, 1440]) {
  test(`neuroscience exploration and abstract fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('./#neuroscience');
    await expect(page.locator('.neuro-focus')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `.cache/neuro-${width}.png`, fullPage: true });
    await page.getByRole('tab', { name: '최신 연구' }).click();
    await page.locator('.paper-title').first().click();
    await expect(page.getByRole('dialog', { name: '논문 상세' })).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy();
    await page.keyboard.press('Escape');
    if (width < 801) {
      await page.getByRole('button', { name: '분야 메뉴 열기' }).click();
      await page.getByRole('button', { name: '뇌과학', exact: true }).click();
      await expect(page.locator('.sidebar-scrim')).toHaveCount(0);
    }
  });
}
