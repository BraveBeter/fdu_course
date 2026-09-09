# 自有服务器部署

## 前置条件

准备支持 Docker Compose 的 Linux 服务器、解析到服务器的域名，以及可访问复旦选课系统的出站网络。学校凭据认证必须经过 `https://id.fudan.edu.cn`；不关闭 TLS 校验。云服务器访问学校的可行性需要在目标服务器实测。

应用、数据库和连接器在私有 Docker 网络通信，只有 Caddy 对外开放 80/443。连接器限 2 个并发浏览器任务，内存上限 2 GB；机器容量需按实际并发测试调整。

## 配置与启动

克隆仓库，在服务器创建权限为 600 的 `.env`，配置以下键。使用随机十六进制字符串，避免数据库密码中的 URL 保留字符影响连接串；不要把此文件提交 Git。

| 键                  | 配置                                                           |
| ------------------- | -------------------------------------------------------------- |
| `SITE_DOMAIN`       | 对外域名，不包含协议或路径                                     |
| `POSTGRES_PASSWORD` | 新生成的随机数据库密码                                         |
| `IDENTITY_SECRET`   | 新生成的至少 32 字符密钥；长期保留，改变会影响学校身份映射     |
| `CONNECTOR_SECRET`  | 独立生成的至少 32 字符连接器密钥                               |
| `ADMIN_UIS_IDS`     | 可选的 UIS 管理员学号，独立管理员账号不需要配置                |
| `CURRENT_TERM`      | 学校页面中的学期名称，例如 `2026-2027学年 第一学期`            |
| `UIS_ENABLED`       | 首先设 `false`；完成目标服务器真实认证、身份和课表核对后再开放 |

每个随机密钥可分别运行 `openssl rand -hex 32` 生成。只在自己的服务器配置文件中使用。

```sh
docker compose config --quiet
docker compose up -d --build --wait
docker compose ps
```

Caddy 自动获取证书。应用启动时使用事务执行尚未应用的迁移。`/api/health` 检查 API 与数据库；连接器健康检查确认服务进程可用，不能替代学校认证联调。

生产环境不提供演示登录入口；配置层拒绝开启演示模式、开发身份密钥、PGlite 或非 HTTPS 公网地址。

## 独立管理员账号

管理员无需学号。应用启动后，在交互式终端创建账号：

```sh
docker compose exec app node dist/server/server/admin-cli.js create
```

输入用户名、显示名称和至少 15 个字符的密码，密码不回显。通过网站右上角“管理员登录”或 `/admin` 登录；无需开启 UIS，也无需运行学校连接器来认证管理员。没有默认管理员密码或公开注册接口。

重置密码或停用账号：

```sh
docker compose exec app node dist/server/server/admin-cli.js reset-password
docker compose exec app node dist/server/server/admin-cli.js disable
```

重置和停用立即撤销旧会话；重置不会恢复停用账号。PostgreSQL 可在应用运行时执行这些命令，本地 PGlite 必须先停止开发服务。禁止通过命令行参数传入密码。数据库备份现包含管理员密码派生结果，需要按凭据数据保管。

## 备份和恢复

`backup` 服务每天将 PostgreSQL 自定义格式备份写入宿主 `backups/`。写入成功后才重命名为 `.dump`，失败不会留下看似完整的备份。该目录不会进入 Git。需要定期将备份及安全保存的身份密钥复制到独立存储；当前实现不自动删除历史备份，按磁盘容量制定保留策略。

手动备份：

```sh
npm run db:backup
```

恢复应先在一个新建的空数据库中演练，避免覆盖生产数据：

```sh
docker compose exec db createdb -U fdu_course fdu_course_restore
docker compose exec -T db pg_restore -U fdu_course -d fdu_course_restore \
  --exit-on-error --no-owner --no-acl < backups/选定的备份.dump
```

核对用户、教学班、登记关系、反馈数量及抽样记录后，在维护窗口切换应用连接。备份中包含用户与课程关系，应限制读取权限。

本地部署验证使用 `compose.test.yaml`，端口只绑定本机：PostgreSQL 55432，应用 18081。`scripts/test-backup.sh` 专门针对该测试 Compose，通过合成标记记录验证备份恢复，不操作生产数据库。

## 运行与更新

- 检查容器健康、磁盘使用、最近成功备份和学校查询成功率。应用只输出脱敏的请求失败事件，不记录学校密码、Cookie、认证票据或请求体。
- 首次试用至少核对两个账号、同一教学班的重复导入、分页、单双周、取消登记和审核权限。
- 学校查询失败不清空已有课程；保持用户最近确认的数据。UIS 临时不可用时，已有本站会话仍可使用。
- 更新前备份，拉取已通过 CI 的提交，重新构建并启动。数据库结构变化需审查迁移与回滚方案，不直接回滚到不兼容旧代码。
- 独立管理员通过上述终端命令管理；UIS 管理员白名单仍由服务器配置管理，修改后需要对应用户重新认证以刷新角色。

## 当前验证边界

本机已验证正式应用镜像、真实 PostgreSQL 业务测试及独立数据库备份恢复。尚未给出目标云服务器与域名，因此不能声称公网部署已完成。学校真实账号登录结果见最新阶段记录。
