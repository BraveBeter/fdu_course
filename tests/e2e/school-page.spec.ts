import { test, expect } from '@playwright/test';
import { readIdentity, readSelectedCourses } from '../../connector/school-page';
const term = '2026-2027学年 第一学期';
function schoolPage(count: number, delayed = false) {
  const headers = [
    '学年学期',
    '课程代码',
    '课程名称|班级',
    '学时',
    '学分',
    '任课教师',
    '开课院系',
    '课程类别',
    '上课时间地点',
    '选课备注',
    '选课时间',
    '考试形式',
    '考试时间',
    '操作',
  ];
  const rows = Array.from({ length: count }, (_, index) => {
    const code = `TEST${String(index).padStart(5, '0')}`;
    return [
      term,
      code,
      `合成测试课程${index}2026202701${code}.01`,
      '54',
      '3',
      '合成教师',
      '测试院系',
      '专业选修课',
      '1~16周 星期一 3~5节 TEST101 合成教师',
      '',
      '',
      '',
      '',
      '',
    ];
  });
  const previous = delayed
    ? '<div id="previous"><table><tr><th>课程代码</th><th>课程名称|班级</th></tr></table><p>共99条数据，分5页显示，每页显示20条数据。</p><a href="#old-next">»</a></div>'
    : '';
  return `<!doctype html><html lang="zh-CN"><body><p>99990000001 - 测试同学 退出</p><a href="#selected">已选课程</a>${previous}<div id="yxkcGrid" ${delayed ? 'style="display:none"' : ''}><table><thead><tr>${headers.map((header) => `<th>${header}</th>`).join('')}</tr></thead><tbody></tbody></table><p>共${count}条数据，分${Math.max(1, Math.ceil(count / 20))}页显示，每页显示20条数据。</p><a href="#next" title="Go下一页">»</a></div><script>const rows=${JSON.stringify(rows)};let page=0;function render(){document.querySelector('#yxkcGrid tbody').innerHTML=rows.slice(page*20,(page+1)*20).map(row=>'<tr>'+row.map(cell=>'<td>'+cell+'</td>').join('')+'</tr>').join('')}render();document.querySelector('a[title]').onclick=event=>{event.preventDefault();page++;render()};document.querySelector('a[href="#selected"]').onclick=event=>{event.preventDefault();setTimeout(()=>{document.querySelector('#yxkcGrid').style.display='block';const previous=document.querySelector('#previous');if(previous)previous.style.display='none'},120)};</script></body></html>`;
}
test('切换课表时等待已选课程可见，忽略旧表格及其分页', async ({ page }) => {
  await page.setContent(schoolPage(21, true));
  const snapshot = await readSelectedCourses(page, term);
  expect(snapshot.complete).toBe(true);
  expect(snapshot.total).toBe(21);
  expect(snapshot.courses).toHaveLength(21);
});
test('学校 DOM 适配器遍历超过 20 条的分页并取得已认证身份', async ({ page }) => {
  await page.setContent(schoolPage(21));
  expect(await readIdentity(page)).toBe('99990000001');
  const snapshot = await readSelectedCourses(page, term);
  expect(snapshot.complete).toBe(true);
  expect(snapshot.courses).toHaveLength(21);
  expect(new Set(snapshot.courses.map((course) => course.section)).size).toBe(21);
});
test('学校空课表与结构变化有明确区分', async ({ page }) => {
  await page.setContent(schoolPage(0));
  const empty = await readSelectedCourses(page, term);
  expect(empty.complete).toBe(true);
  expect(empty.courses).toHaveLength(0);
  await page.setContent(schoolPage(1).replace('<th>课程类别</th>', '<th>未知列</th>'));
  await expect(readSelectedCourses(page, term)).rejects.toThrow('课表缺少必要字段');
});

test('取消连接器任务会关闭独立浏览器', async () => {
  const { runInBrowser } = await import('../../connector/browser-session');
  const controller = new AbortController();
  let connected: () => boolean = () => true;
  await expect(
    runInBrowser(controller.signal, async (browser) => {
      connected = () => browser.isConnected();
      const page = await browser.newPage();
      const timer = setTimeout(() => controller.abort(), 30);
      try {
        await page.locator('#never-present').waitFor({ timeout: 5000 });
      } finally {
        clearTimeout(timer);
      }
    }),
  ).rejects.toThrow();
  expect(connected()).toBe(false);
});
