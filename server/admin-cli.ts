import { createInterface } from 'node:readline/promises';
import { Writable } from 'node:stream';
import { stdin, stdout } from 'node:process';
import { ZodError } from 'zod';
import { readConfig } from './config.js';
import { openDatabase, migrate } from './database/database.js';
import {
  createAdmin,
  resetAdminPassword,
  disableAdmin,
  adminUsername,
  adminPassword,
} from './admin-accounts.js';
import { AppError } from './errors.js';

async function main() {
  const command = process.argv[2];
  if (!['create', 'reset-password', 'disable'].includes(command ?? '') || process.argv.length > 3)
    throw new AppError(
      400,
      '用法：admin:create / admin:reset-password / admin:disable；请勿把密码放在命令参数中',
    );
  if (!stdin.isTTY || !stdout.isTTY) throw new AppError(400, '请在交互式终端运行，密码会隐藏输入');
  let muted = false;
  const output = new Writable({
    write(chunk, _encoding, callback) {
      if (!muted) stdout.write(chunk);
      callback();
    },
  });
  const readline = createInterface({ input: stdin, output, terminal: true });
  const controller = new AbortController();
  readline.on('SIGINT', () => controller.abort());
  const ask = async (prompt: string, secret = false) => {
    stdout.write(prompt);
    muted = secret;
    try {
      return await readline.question('', { signal: controller.signal });
    } finally {
      muted = false;
      if (secret) stdout.write('\n');
    }
  };
  let password = '';
  try {
    console.log('本地 PGlite 请先停止开发服务；PostgreSQL 可在线管理账号。');
    const username = adminUsername.parse(
      await ask('管理员用户名（3–64 位，字母开头，可含数字 . _ -）：'),
    );
    const nickname = command === 'create' ? await ask('显示名称：') : '';
    if (command !== 'disable') {
      password = adminPassword.parse(await ask('密码（至少 15 个字符）：', true));
      if (password !== (await ask('再次输入密码：', true)))
        throw new AppError(400, '两次密码不一致，未修改账号');
    } else if ((await ask('输入 DISABLE 确认停用该管理员：')) !== 'DISABLE') {
      throw new AppError(400, '已取消，未修改账号');
    }
    const db = await openDatabase(readConfig().DATABASE_URL);
    try {
      await migrate(db);
      if (command === 'create') await createAdmin(db, username, password, nickname);
      else if (command === 'reset-password') await resetAdminPassword(db, username, password);
      else await disableAdmin(db, username);
      console.log(
        command === 'create'
          ? '管理员已创建，可从网页“管理员登录”进入。'
          : command === 'reset-password'
            ? '密码已重置，旧会话已失效；停用状态不会改变。'
            : '管理员已停用，旧会话已失效。',
      );
    } finally {
      await db.close();
    }
  } finally {
    password = '';
    readline.close();
  }
}
try {
  await main();
} catch (error) {
  console.error(
    error instanceof ZodError
      ? '输入格式不正确，用户名须为 3–64 位，密码至少 15 个字符，显示名称 1–24 字。'
      : error instanceof AppError
        ? error.message
        : error instanceof Error && error.name === 'AbortError'
          ? '已取消。'
          : '账号操作失败，请检查数据库连接和服务状态。',
  );
  process.exitCode = 1;
}
