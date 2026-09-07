import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist/server/server/database', { recursive: true });
await copyFile('server/database/001_initial.sql', 'dist/server/server/database/001_initial.sql');
