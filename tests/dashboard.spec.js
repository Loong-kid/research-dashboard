import { test, expect } from '@playwright/test';

test('research map filters real data and opens the selected topic papers', async ({ page }) => {
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('학문');
  await expect(page.locator('.map-point')).toHaveCount(12);
  await page.getByRole('button', { name: '물리학', exact: true }).first().click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('물리학');
  await expect(page.locator('.map-point')).toHaveCount(3);
  await page.locator('.map-point').first().click();
  await expect(page.locator('.topic-focus h3')).toHaveText('양자 오류정정');
  await page.getByRole('button', { name: '이 주제의 논문 읽기' }).click();
  await expect(page.getByRole('tab', { name: '논문 탐색' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.paper-row')).toHaveCount(4);
  expect(errors).toEqual([]);
});

test('library and reading notes survive reload; dialogs support Escape', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.paper-row').first()).toBeVisible();
  const title = await page.locator('.paper-title').first().textContent();
  await page.locator('.save-button').first().click();
  await page.getByRole('tab', { name: /내 서재/ }).click();
  await expect(page.locator('.paper-row')).toHaveCount(1);
  await page.reload();
  await page.getByRole('tab', { name: /내 서재/ }).click();
  await expect(page.locator('.paper-title')).toHaveText(title);
  await page.locator('.paper-title').click();
  await expect(page.getByRole('dialog', { name: '논문 상세' })).toBeVisible();
  await page.getByRole('textbox', { name: /나의 읽기 메모/ }).fill('실험 조건을 다시 확인하기');
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('.paper-title').click();
  await expect(page.getByRole('textbox', { name: /나의 읽기 메모/ })).toHaveValue('실험 조건을 다시 확인하기');
  await expect(page.getByRole('link', { name: '출판사 원문' })).toHaveAttribute('href', /^https?:\/\//);
  await page.getByRole('button', { name: '닫기', exact: true }).click();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: '서재 내보내기' }).click();
  expect((await downloadPromise).suggestedFilename()).toBe('research-atlas-library.md');
  await page.locator('.save-button').click();
  await expect(page.getByRole('heading', { name: '궁금한 논문부터 한 편.' })).toBeVisible();
});

test('search, journal and open access filters give clear results and empty states', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('tab', { name: '논문 탐색' }).click();
  await page.getByRole('checkbox', { name: 'Nature 계열' }).check();
  const journals = await page.locator('.journal-name').allTextContents();
  expect(journals.length).toBeGreaterThan(0);
  expect(journals.every(name => name.startsWith('Nature'))).toBeTruthy();
  await page.getByRole('checkbox', { name: '공개 원문', exact: true }).check();
  expect(await page.locator('.paper-row .open-label').count()).toBe(await page.locator('.paper-row').count());
  await page.getByRole('textbox', { name: '논문·연구 주제 검색' }).fill('no-such-paper-8b5a5');
  await expect(page.getByRole('heading', { name: '조건에 맞는 논문이 없어.' })).toBeVisible();
  await page.getByRole('button', { name: '필터 초기화' }).click();
  await expect(page.locator('.paper-row').first()).toBeVisible();
  await page.getByRole('button', { name: '연구 모멘텀 해석 방법' }).count().then(async count => {
    if (!count) await page.getByRole('tab', { name: '리서치 맵' }).click();
  });
  await page.getByRole('button', { name: '연구 모멘텀 해석 방법' }).click();
  await expect(page.getByRole('heading', { name: '숫자를 읽는 방법' })).toBeVisible();
  await expect(page.locator('.query-list a')).toHaveCount(12);
});

for (const width of [320, 375, 414, 768, 1440]) {
  test(`dashboard and reading panel fit ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('./');
    await expect(page.locator('.map-panel')).toBeVisible();
    await page.screenshot({ path: `.cache/preview-${width}.png`, fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();
    if (width < 801) {
      await page.getByRole('button', { name: '분야 메뉴 열기' }).click();
      await page.getByRole('button', { name: '화학·재료', exact: true }).first().click();
      await expect(page.locator('.map-point')).toHaveCount(3);
    }
    await page.locator('.paper-title').first().click();
    await expect(page.getByRole('dialog', { name: '논문 상세' })).toBeVisible();
    expect(await page.getByRole('dialog').evaluate(element => element.scrollWidth <= element.clientWidth)).toBeTruthy();
  });
}
