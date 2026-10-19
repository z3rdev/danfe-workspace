import { invoke, isTauri } from '@tauri-apps/api/core';
import type { Output } from './danfe';

export async function downloadOutputFile(file: Output): Promise<string | null> {
  if (isTauri()) {
    if (!file.path) throw new Error('O arquivo não está disponível para baixar.');
    return invoke<string>('save_output_download', { path: file.path });
  }
  if (!file.url) throw new Error('O arquivo não está disponível para baixar.');
  const url = new URL(file.url, window.location.href);
  url.searchParams.set('download', '1');
  const link = document.createElement('a');
  link.href = url.toString();
  link.download = file.path?.split(/[\\/]/).pop() || `${file.number} - ${file.layoutLabel || 'DANFE'}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  return null;
}
