import { chromium } from '@playwright/test';
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
): Promise<SchoolResult> {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ acceptDownloads: false });
    const page = await context.newPage();
    page.setDefaultTimeout(15000);
    await page.goto(schoolEntry, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForURL((url) => url.origin === 'https://id.fudan.edu.cn', { timeout: 15000 });
    const accountTab = page.getByText('账号登录', { exact: true });
    if (await accountTab.isVisible()) await accountTab.click();
    await page
      .getByPlaceholder(/用户名|学号|手机号\/邮箱/)
      .first()
      .fill(username);
    // Never fill credentials into a redirected or unexpected origin.
    if (new URL(page.url()).origin !== 'https://id.fudan.edu.cn')
      throw new SchoolQueryError('认证地址发生变化，已停止登录');
    await page.locator('input[type="password"]').first().fill(password);
    await page.getByRole('button', { name: /^(登录|登 录|立即登录)$/ }).click();
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
  } finally {
    await browser.close();
  }
}
