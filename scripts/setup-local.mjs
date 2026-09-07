import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const secret = () => randomBytes(32).toString('hex');
try {
  await writeFile(
    '.env',
    `NODE_ENV=development\nHOST=127.0.0.1\nPORT=3001\nPUBLIC_ORIGIN=http://127.0.0.1:5173\nDATABASE_URL=pglite:.local/db\nIDENTITY_SECRET=${secret()}\nCONNECTOR_SECRET=${secret()}\nCONNECTOR_URL=http://127.0.0.1:3002\nCONNECTOR_HOST=127.0.0.1\nCURRENT_TERM=2026-2027学年 第一学期\nADMIN_UIS_IDS=\nUIS_ENABLED=false\nDEMO_MODE=false\n`,
    { flag: 'wx', mode: 0o600 },
  );
  console.log('Local configuration created; UIS remains disabled until an explicit local test.');
} catch (error) {
  if (error.code === 'EEXIST') console.log('Existing .env preserved.');
  else throw error;
}
