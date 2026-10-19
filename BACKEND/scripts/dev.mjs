import { fileURLToPath } from 'node:url';

// O servico instalado usa a porta 3000; o desenvolvimento usa o backend do projeto.
process.env.PORT = process.env.DANFE_DEV_PORT || '3001';
process.chdir(fileURLToPath(new URL('../', import.meta.url)));

await import('../src/server.js');
