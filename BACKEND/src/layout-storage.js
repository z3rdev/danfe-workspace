import { constants } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';

const suffixes = {
  simplificado: 'DANFE Simplificado',
  etiqueta: 'DANFE Etiqueta',
  varejo: 'DANFE Cupom Varejo'
};

export function additionalLayoutDirs(root) {
  return Object.fromEntries(Object.keys(suffixes).map(layout => [layout, path.join(root, '.LAYOUTS', layout)]));
}

export function originalPdfName(fileName, layout) {
  const suffix = suffixes[layout];
  return suffix ? fileName.replace(new RegExp(` - ${suffix}(?: \\(\\d+\\))?\\.pdf$`, 'i'), '.pdf') : fileName;
}

export async function listOutputPdfs(root) {
  const folders = { danfe: path.join(root, 'PDF'), ...additionalLayoutDirs(root) };
  const groups = await Promise.all(Object.entries(folders).map(async ([layout, directory]) => {
    const entries = await fs.readdir(directory, { withFileTypes: true }).catch(error => {
      if (error.code === 'ENOENT') return [];
      throw error;
    });
    return entries.filter(entry => entry.isFile() && /\.pdf$/i.test(entry.name))
      .map(entry => ({ name: entry.name, filePath: path.join(directory, entry.name), layout }));
  }));
  return groups.flat();
}

export async function migrateLayoutPdfs(root, processedEntries = []) {
  const folders = additionalLayoutDirs(root);
  await Promise.all(Object.values(folders).map(directory => fs.mkdir(directory, { recursive: true })));
  const files = (await listOutputPdfs(root)).filter(file => file.layout === 'danfe');
  const moved = [];

  for (const file of files) {
    // Um DANFE principal registrado nunca e classificado apenas pelo nome.
    if (processedEntries.some(entry => entry.arquivo === file.name)) continue;
    const loggedLayout = processedEntries.flatMap(entry => Object.entries(entry.layoutFiles || {}))
      .find(([, saved]) => saved.arquivo === file.name || (saved.caminho && path.resolve(saved.caminho) === path.resolve(file.filePath)));
    const layout = loggedLayout?.[0] || Object.keys(suffixes).find(type => originalPdfName(file.name, type) !== file.name);
    if (!folders[layout]) continue;

    const stat = await fs.stat(file.filePath);
    const stem = path.basename(file.name, path.extname(file.name));
    let target;
    for (let index = 0; ; index += 1) {
      target = path.join(folders[layout], `${stem}${index ? ` (${index})` : ''}.pdf`);
      try {
        // Copia exclusiva antes de remover a origem: nao substitui outro PDF.
        await fs.copyFile(file.filePath, target, constants.COPYFILE_EXCL);
        break;
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
    await fs.utimes(target, stat.atime, stat.mtime);
    await fs.unlink(file.filePath);
    moved.push({ layout, source: file.filePath, target, oldName: file.name, name: path.basename(target) });
  }
  return moved;
}
