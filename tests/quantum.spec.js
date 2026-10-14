import { test, expect } from '@playwright/test';

test('focus navigation describes topic counts and quantum has six areas and fourteen topics', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('button', { name: '뇌과학', exact: true })).toContainText('12개 주제');
  await page.getByRole('button', { name: '양자컴퓨터', exact: true }).click();
  await expect(page).toHaveURL(/#quantum-computing$/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('양자');
  await expect(page.locator('.neuro-area')).toHaveCount(6);
  await expect(page.locator('.neuro-topic')).toHaveCount(14);
  await expect(page.getByRole('button', { name: '양자컴퓨터', exact: true })).toContainText('14개 주제');
  await expect(page.locator('.neuro-focus h2')).toHaveText('양자 오류정정');
  await page.getByRole('button', { name: '큐비트 하드웨어', exact: true }).click();
  await expect(page.locator('.neuro-topic')).toHaveCount(4);
  await page.locator('.neuro-topic').filter({ hasText: '중성원자 큐비트' }).click();
  await expect(page.locator('.neuro-focus h2')).toHaveText('중성원자 큐비트');
  await expect(page.locator('.neuro-bar-column')).toHaveCount(12);
  await page.getByRole('button', { name: '뇌과학', exact: true }).click();
  await expect(page.locator('.neuro-topic')).toHaveCount(12);
  expect(errors).toEqual([]);
});

test('preprints stay distinct from journal feeds and search has an honest empty state', async ({ page }) => {
  await page.goto('./#quantum-computing');
  await page.getByRole('tab', { name: '프리프린트' }).click();
  await expect(page.locator('.paper-title').first()).toBeVisible();
  const labels = await page.locator('.neuro-paper-signals').allTextContents();
  expect(labels.length).toBeGreaterThan(0);
  expect(labels.every(label => label.includes('프리프린트') && label.includes('심사 여부 미확인'))).toBeTruthy();
  await page.locator('.paper-title').first().click();
  await expect(page.locator('.neuro-detail-signals')).toContainText('프리프린트');
  await page.keyboard.press('Escape');
  await page.getByRole('tab', { name: '최신 연구' }).click();
  const journalLabels = await page.locator('.neuro-paper-signals').allTextContents();
  expect(journalLabels.length).toBeGreaterThan(0);
  expect(journalLabels.every(label => label.includes('저널 연구') && !label.includes('프리프린트'))).toBeTruthy();
  await page.getByRole('textbox', { name: '논문·연구 주제 검색' }).fill('nothing-matches-0b0af');
  await expect(page.getByRole('heading', { name: '조건에 맞는 논문이 없어.' })).toBeVisible();
  await page.getByRole('button', { name: '필터 초기화' }).click();
  await expect(page.locator('.paper-title').first()).toBeVisible();
});

test('Korean notes, library filtering and quantum methodology survive field changes', async ({ page }) => {
  await page.goto('./#quantum-computing');
  await page.getByRole('tab', { name: '읽기 가이드' }).click();
  await expect(page.locator('.neuro-guide-grid article')).toHaveCount(14);
  await page.locator('.neuro-curated button').filter({ hasText: '동적 표면 코드' }).click();
  await expect(page.locator('.neuro-reading-note')).toContainText('2.15');
  await expect(page.getByRole('link', { name: '해설 근거: 저자 초록' })).toHaveAttribute('href', /^https:\/\/openalex.org\//);
  await page.getByRole('button', { name: '내 서재에 저장', exact: true }).click();
  await page.getByRole('textbox', { name: /나의 읽기 메모/ }).fill('코드 거리와 억제 계수 비교하기');
  await page.keyboard.press('Escape');
  await page.locator('.heading-library').click();
  await page.getByRole('combobox').first().selectOption('quantum-computing');
  await expect(page.locator('.paper-title')).toHaveCount(1);
  await page.locator('.paper-title').click();
  await expect(page.getByRole('textbox', { name: /나의 읽기 메모/ })).toHaveValue('코드 거리와 억제 계수 비교하기');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '양자컴퓨터', exact: true }).click();
  await page.getByRole('button', { name: '수집 범위와 해석' }).click();
  await expect(page.getByRole('heading', { name: '양자컴퓨터 숫자를 읽는 방법' })).toBeVisible();
  await expect(page.locator('.query-list a')).toHaveCount(14);
});

for (const width of [320, 375, 414, 768, 1440]) {
  test(`quantum topic chart and preprint detail fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('./#quantum-computing');
    await expect(page.locator('.neuro-focus')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    await page.screenshot({ path: `.cache/quantum-${width}.png`, fullPage: true });
    await page.getByRole('tab', { name: '프리프린트' }).click();
    await page.locator('.paper-title').first().click();
    await expect(page.getByRole('dialog', { name: '논문 상세' })).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy();
  });
}
