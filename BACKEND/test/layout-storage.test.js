import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { additionalLayoutDirs, listOutputPdfs, migrateLayoutPdfs, originalPdfName } from '../src/layout-storage.js';

async function workspace(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'danfe-layout-test-'));
  assert.ok(path.resolve(root).startsWith(path.resolve(os.tmpdir()) + path.sep));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.mkdir(path.join(root, 'PDF'));
  return root;
}

test('moves extra PDFs to hidden layout folders and preserves the original and PDF contents', async t => {
  const root = await workspace(t);
  const original = '000001 - Empresa.pdf';
  const variants = {
    simplificado: '000001 - Empresa - DANFE Simplificado.pdf',
    etiqueta: '000001 - Empresa - DANFE Etiqueta.pdf',
    varejo: '000001 - Empresa - DANFE Cupom Varejo.pdf'
  };
  await fs.writeFile(path.join(root, 'PDF', original), '%PDF-original');
  for (const [type, name] of Object.entries(variants)) {
    await fs.writeFile(path.join(root, 'PDF', name), `%PDF-${type}`);
  }
  const moved = await migrateLayoutPdfs(root, [{ arquivo: original }]);
  assert.equal(moved.length, 3);
  assert.deepEqual(await fs.readdir(path.join(root, 'PDF')), [original]);
  assert.equal(await fs.readFile(path.join(root, 'PDF', original), 'utf8'), '%PDF-original');
  for (const [type, name] of Object.entries(variants)) {
    assert.equal(await fs.readFile(path.join(additionalLayoutDirs(root)[type], name), 'utf8'), `%PDF-${type}`);
  }
  assert.equal((await listOutputPdfs(root)).length, 4);
  assert.equal((await migrateLayoutPdfs(root, [{ arquivo: original }])).length, 0);
});

test('preserves an existing destination and allocates a new name for the migrated PDF', async t => {
  const root = await workspace(t);
  const name = '000001 - Empresa - DANFE Etiqueta.pdf';
  const folder = additionalLayoutDirs(root).etiqueta;
  await fs.mkdir(folder, { recursive: true });
  await fs.writeFile(path.join(folder, name), '%PDF-anterior');
  await fs.writeFile(path.join(root, 'PDF', name), '%PDF-novo');
  const [move] = await migrateLayoutPdfs(root);
  assert.equal(await fs.readFile(path.join(folder, name), 'utf8'), '%PDF-anterior');
  assert.equal(await fs.readFile(move.target, 'utf8'), '%PDF-novo');
  assert.equal(move.name, '000001 - Empresa - DANFE Etiqueta (1).pdf');
  assert.equal(originalPdfName(move.name, 'etiqueta'), '000001 - Empresa.pdf');
});

test('uses history for custom layout names and does not move an original just because its name matches', async t => {
  const root = await workspace(t);
  const original = '000001 - DANFE Etiqueta.pdf';
  await fs.writeFile(path.join(root, 'PDF', original), '%PDF-original');
  await fs.writeFile(path.join(root, 'PDF', 'personalizado.pdf'), '%PDF-layout');
  const moved = await migrateLayoutPdfs(root, [{
    arquivo: original,
    layoutFiles: { varejo: { arquivo: 'personalizado.pdf' } }
  }]);
  assert.equal(moved.length, 1);
  assert.equal(moved[0].layout, 'varejo');
  assert.deepEqual(await fs.readdir(path.join(root, 'PDF')), [original]);
});
