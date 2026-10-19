import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { invoke, isTauri } from '@tauri-apps/api/core';
import { downloadOutputFile } from './output-download';
import type { Output } from './danfe';

vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn(), isTauri: vi.fn() }));

const file: Output = {
  id: 'label', number: '000001', company: 'Empresa', key: '', format: 'PDF',
  layout: 'etiqueta', layoutLabel: 'DANFE Etiqueta', time: '12:00', size: '3 KB',
  path: 'C:\\DANFE\\.LAYOUTS\\etiqueta\\Nota - DANFE Etiqueta.pdf',
  url: '/arquivos/.LAYOUTS/etiqueta/nota.pdf'
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => vi.restoreAllMocks());

describe('Download dos PDFs', () => {
  it('uses the native Downloads command with the hidden source file', async () => {
    vi.mocked(isTauri).mockReturnValue(true);
    vi.mocked(invoke).mockResolvedValue('C:\\Downloads\\Nota - DANFE Etiqueta.pdf');
    await expect(downloadOutputFile(file)).resolves.toBe('C:\\Downloads\\Nota - DANFE Etiqueta.pdf');
    expect(invoke).toHaveBeenCalledWith('save_output_download', { path: file.path });
  });

  it('requests a browser attachment with the original filename', async () => {
    vi.mocked(isTauri).mockReturnValue(false);
    let clickedUrl = '';
    let clickedName = '';
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      clickedUrl = this.href;
      clickedName = this.download;
    });
    await expect(downloadOutputFile(file)).resolves.toBeNull();
    expect(clickedUrl).toContain('/arquivos/.LAYOUTS/etiqueta/nota.pdf?download=1');
    expect(clickedName).toBe('Nota - DANFE Etiqueta.pdf');
    expect(invoke).not.toHaveBeenCalled();
    expect(document.querySelector('a[download]')).toBeNull();
  });
});
