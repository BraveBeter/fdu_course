# 复旦研究生共享课表

同学通过 UIS 验证身份并确认导入自己的已选课程，逐步形成共享课程库。提供周课表、重叠课程展开、个人课表、组合筛选、本站登记人数、同班昵称，以及管理员审核的考勤颜色。

**状态：已完成本地真实 UIS 身份验证、课程读取和导入展示；目标服务器联调尚未完成，生产默认关闭 UIS。** 本站不是学校官方选课系统，不执行学校选课、退课或提交导师操作。

## 本地运行

使用 Node.js 24 LTS 和 npm：

```sh
npm ci
npm run setup:local
npm run dev
```

打开 `http://127.0.0.1:5173/`。本地默认使用 `.local/db` 中的 PGlite（PostgreSQL 引擎），无需先启动 Docker。`.env` 和本地数据均不会提交 Git。

若只想体验完整流程，停止上述服务后运行：

```sh
npm run dev:demo
```

演示使用独立的内存数据库、合成课程和演示账号，页面明确标注；支持体验同学登记、管理员审核。生产环境拒绝演示模式。

## UIS 本地联调

```sh
npx playwright install chromium
npm run dev:uis
```

该命令同时启动网页、API 和学校连接器，并开启本次运行的登录表单。先停止已有的 `npm run dev`，避免端口占用。普通 `npm run dev` 读取 `.env` 中的 `UIS_ENABLED`；若其值为 `false`，登录表单会显示“暂未开放”。

在本站登录表单中输入 UIS 账号密码。密码仅用于当次转交学校认证，不保存。学校会话在本次采集结束时关闭；本站另外发放 7 天会话。不要在终端命令、代码、聊天或 Git 中填写学校密码。

`node scripts/probe-school.mjs` 只检查全新、未登录的学校公开表单，不提交凭据。已确认当前学校定制表单的用户名占位符为“用户名（本人学工号）”，按钮为“登录”。连接器等待定制表单加载完成，避免操作初始占位界面。

目前遇到验证码或二次认证会明确失败，不绕过挑战；须在真实账号与目标服务器通过全链路验证后才开启生产 `UIS_ENABLED=true`。手工在原浏览器登录成功不等于连接器已获认证。

## 修复已保存的空时间安排

更新解析器后，可在源码开发环境运行 `npm run db:repair-schedules`，从已保存的学校原文重建缺失的时间安排，无需重新登录学校。本地使用 PGlite 时，须先停止开发服务，执行后再运行 `npm run dev:uis`。

此命令只补全原本为空、现在可以成功解析的安排，不改动学校原文、考勤或登记关系；重复执行不会重复计数。仍无法解析的记录会保留，并在输出的 `unresolved` 数量中报告。

## 测试

```sh
npm run check        # 类型、单元/数据库/API 测试、正式构建
npm run test:e2e     # Chromium 桌面、手机、完整业务流程、学校页面 DOM 适配
npm run format:check
```

端到端测试会自动启动隔离服务（网页 5174、API 3003），使用内存数据库和合成数据；不会登录学校。

设置 `TEST_DATABASE_URL` 后，相同数据库测试会运行在真实 PostgreSQL 上，每项测试创建独立临时 schema，结束后清理。只能指定测试数据库。GitHub Actions 自动运行真实 PostgreSQL、构建和浏览器测试。

## 技术与目录

- React、TypeScript、Vite、Tailwind、Radix/shadcn 风格基础组件；自行实现学校节次布局。
- Fastify 提供同域 API；PostgreSQL 参数化 SQL 与版本迁移管理共享数据。
- 独立 Playwright 连接器负责学校认证和只读查询，限制并发、隔离浏览器上下文。
- `shared/`：周次解析、数据类型、筛选与冲突布局。
- `server/`：会话、业务用例、数据库及 HTTP 接口。
- `connector/`：学校网站适配。
- `src/`：网页界面。
- `tests/`：单元、数据库、API 与端到端测试。

完整产品规则见 [开发计划](DEVELOPMENT_PLAN.md)，实际交付结果见 [阶段记录](docs/STAGES.md)，服务器部署见 [部署指南](docs/DEPLOYMENT.md)。
