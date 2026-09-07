import { chromium } from 'playwright';
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ locale: 'zh-CN' });
  await page.goto(
    'http://yjsxk.fudan.sh.cn/yjsxkapp/sys/xsxkappfudan/xsxkHome/gotoChooseCourse.do',
    { waitUntil: 'domcontentloaded', timeout: 30000 },
  );
  await page
    .getByPlaceholder('用户名（本人学工号）', { exact: true })
    .waitFor({ state: 'visible', timeout: 20000 });

  console.log(
    JSON.stringify(
      {
        origin: new URL(page.url()).origin,
        body: await page.locator('body').innerText(),
        inputs: await page.locator('input:visible').evaluateAll((elements) =>
          elements.map((element) => ({
            type: element.getAttribute('type'),
            placeholder: element.getAttribute('placeholder'),
          })),
        ),
        buttons: await page.locator('button:visible').allTextContents(),
        actions: await page.getByText(/登\s*录/).evaluateAll((elements) =>
          elements
            .map((element) => ({
              tag: element.tagName,
              text: element.textContent?.trim(),
              className: element.className,
            }))
            .filter((item) => (item.text?.length ?? 0) < 50),
        ),
      },
      null,
      2,
    ),
  );
} catch {
  console.error('学校公开登录页探测失败；未提交任何账号密码。');
  process.exitCode = 1;
} finally {
  await browser.close();
}
