import { runInBrowser } from './browser-session.js';
import { readIdentity, readSelectedCourses, schoolEntry, SchoolQueryError } from './school-page.js';
import type { CourseSnapshot } from '../shared/course.js';

export interface SchoolResult {
  studentNo: string;
  snapshot?: CourseSnapshot;
  queryError?: string;
}

export async function loginAndQuery(
  username: string,
  password: string,
  term: string,
  signal: AbortSignal = AbortSignal.timeout(80000),
): Promise<SchoolResult> {
  return runInBrowser(signal, async (browser) => {
    const context = await browser.newContext({ acceptDownloads: false, locale: 'zh-CN' });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(schoolEntry, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForURL((url) => url.origin === 'https://id.fudan.edu.cn', { timeout: 15000 });
    const accountTab = page.getByText('账号登录', { exact: true });
    if (await accountTab.isVisible()) await accountTab.click();
    const usernameField = page.getByPlaceholder('用户名（本人学工号）', { exact: true });
    const submit = page.getByRole('button', { name: '登录', exact: true });
    await submit.waitFor({ state: 'visible' });
    // Never fill credentials into a redirected or unexpected origin.
    if (new URL(page.url()).origin !== 'https://id.fudan.edu.cn')
      throw new SchoolQueryError('认证地址发生变化，已停止登录');
    await usernameField.fill(username);
    await page.locator('input[type="password"]').first().fill(password);
    password = '';
    await submit.click();
    try {
      await page.waitForURL(
        (url) => ['yjsxk.fudan.sh.cn', 'yjsxk.fudan.edu.cn'].includes(url.hostname),
        { timeout: 20000 },
      );
    } catch {
      throw new SchoolQueryError(
        '学校未完成认证：请检查账号密码，或在学校完成验证码/二次认证后重试',
      );
    }
    const studentNo = await readIdentity(page);
    if (studentNo !== username) throw new SchoolQueryError('学校返回的身份与账号不一致');
    try {
      return { studentNo, snapshot: await readSelectedCourses(page, term) };
    } catch {
      return {
        studentNo,
        queryError: '身份已验证，但课表读取失败。已有登记保持不变，请稍后重试。',
      };
    }
  });
}
