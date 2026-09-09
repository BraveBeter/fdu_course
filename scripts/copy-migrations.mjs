import { mkdir, copyFile, readdir } from 'node:fs/promises';
await mkdir('dist/server/server/database', { recursive: true });
for (const file of await readdir('server/database')) {
  if (file.endsWith('.sql'))
    await copyFile(`server/database/${file}`, `dist/server/server/database/${file}`);
}
