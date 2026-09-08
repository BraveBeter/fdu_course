import type { Page } from 'playwright';
import type { RawCourse, CourseSnapshot } from '../shared/course.js';
import { parseSnapshot } from '../shared/import-parser.js';

export const schoolEntry =
  'http://yjsxk.fudan.sh.cn/yjsxkapp/sys/xsxkappfudan/xsxkHome/gotoChooseCourse.do';
export class SchoolQueryError extends Error {}

export async function readIdentity(page: Page): Promise<string> {
  const body = await page.locator('body').innerText();
  const identity = /(?:^|\s)(\d{8,15})\s*-\s*[^\n]+?\s+退出/.exec(body)?.[1];
  if (!identity) throw new SchoolQueryError('无法验证学校身份，请重新登录');
  return identity;
}

export async function readSelectedCourses(page: Page, term: string): Promise<CourseSnapshot> {
  // The school retains hidden tables after tab switches; scope all reads and controls.
  const grid = page.locator('#yxkcGrid');
  const table = grid.locator('table:visible').filter({ hasText: '学年学期' });
  const paginationPattern = /共\s*(\d+)\s*条数据[，,]\s*分\s*(\d+)\s*页/;
  try {
    await page.getByRole('link', { name: '已选课程', exact: true }).click();
    await grid.waitFor({ state: 'visible', timeout: 15000 });
    await table.getByRole('columnheader', { name: '学年学期', exact: true }).waitFor();
    await grid.getByText(paginationPattern).waitFor({ state: 'visible', timeout: 15000 });
  } catch {
    throw new SchoolQueryError('已选课程表格或分页未加载完成，请稍后重新查询');
  }
  const rows: RawCourse[] = [];
  let expected = -1;
  let pages = 0;
  const pageSignatures = new Set<string>();
  for (;;) {
    const pagination = paginationPattern.exec(await grid.innerText());
    if (!pagination) throw new SchoolQueryError('无法确认课表分页，未同步任何登记');
    const total = Number(pagination[1]);
    const totalPages = Number(pagination[2]);
    if (expected !== -1 && expected !== total)
      throw new SchoolQueryError('读取期间课表发生变化，请重试');
    expected = total;
    if (totalPages > 50) throw new SchoolQueryError('课表页数异常，已停止查询');
    const tableRows = await table
      .locator('tr')
      .evaluateAll((elements) =>
        elements.map((row) =>
          Array.from(row.querySelectorAll('th,td')).map((cell) =>
            (cell as HTMLElement).innerText.trim(),
          ),
        ),
      );
    const header = tableRows.find((row) => row.includes('课程代码'));
    if (!header) throw new SchoolQueryError('课表列结构已变化');
    const fields = [
      '学年学期',
      '课程代码',
      '课程名称|班级',
      '学分',
      '任课教师',
      '开课院系',
      '课程类别',
      '上课时间地点',
    ];
    const indexes = fields.map((name) =>
      header.findIndex((cell) => cell.replace(/\s/g, '') === name),
    );
    if (indexes.some((index) => index < 0)) throw new SchoolQueryError('课表缺少必要字段');
    const pageRows = tableRows.filter(
      (row) => row !== header && row.length >= header.length && row[indexes[1]!],
    );
    const signature = pageRows.map((row) => row[indexes[2]!]).join('|');
    if (pageSignatures.has(signature)) throw new SchoolQueryError('分页未前进，已停止查询');
    pageSignatures.add(signature);
    for (const cells of pageRows) {
      const [rowTerm, code, nameAndSection, credits, teachers, department, category, schedule] =
        indexes.map((index) => cells[index]!);
      rows.push({
        term: rowTerm!.replace(/\s+/g, ' '),
        code: code!,
        nameAndSection: nameAndSection!.replace(/\n/g, ''),
        credits: credits!,
        teachers: teachers!,
        department: department!,
        category: category!,
        schedule: schedule!,
      });
    }
    pages++;
    if (pages >= totalPages || total === 0) break;
    await grid.getByRole('link', { name: '»', exact: true }).click();
    await page
      .waitForFunction(
        (previous) => {
          const tables = [...document.querySelectorAll('#yxkcGrid table')];
          const table = tables.find((item) => item.getClientRects().length > 0);
          const content = table?.textContent?.replace(/\s/g, '');
          return content && !previous.every((name) => content.includes(name));
        },
        pageRows.map((row) => row[indexes[2]!]!.replace(/\s/g, '')),
        { timeout: 10000 },
      )
      .catch(() => {
        throw new SchoolQueryError('已选课程分页未完成切换，请重新查询');
      });
  }
  return parseSnapshot(rows, expected, term);
}
