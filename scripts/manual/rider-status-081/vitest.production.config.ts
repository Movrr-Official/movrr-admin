import { defineConfig } from 'vitest/config';
import path from 'node:path';
const root=path.resolve(__dirname,'../../..');
export default defineConfig({
 root,
 test:{environment:'node',include:['scripts/manual/rider-status-081/production-read.acceptance.test.ts'],reporters:['verbose']},
 resolve:{alias:{'@':root}},
});
