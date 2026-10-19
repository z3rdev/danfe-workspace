import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OutputsPage } from '@/components/danfe/outputs';
import { useDanfe } from '@/components/danfe/store';
import type { Output, OutputLayout } from '@/lib/danfe';

vi.mock('@/components/danfe/store', () => ({ useDanfe: vi.fn() }));

const main: Output = {
  id: 'original-PDF', number: '000001', company: 'Empresa Alfa', key: '1'.repeat(44),
  format: 'PDF', layout: 'danfe', layoutLabel: 'DANFE', time: '10:00', size: '12 KB',
  url: '/arquivos/PDF/original.pdf', path: 'C:\\DANFE\\PDF\\original.pdf',
};
const other: Output = { ...main, id: 'other-PDF', company: 'Empresa Beta', key: '2'.repeat(44) };
const variantDefinitions: Array<{ layout: Exclude<OutputLayout, 'danfe'>; layoutLabel: string }> = [
  { layout: 'simplificado', layoutLabel: 'DANFE Simplificado' },
  { layout: 'etiqueta', layoutLabel: 'DANFE Etiqueta' },
  { layout: 'varejo', layoutLabel: 'DANFE Cupom Varejo' },
];
const variants: Output[] = variantDefinitions.map(({ layout, layoutLabel }) => ({
  ...main, id: `${layout}-PDF`, layout, layoutLabel,
  url: `/arquivos/PDF/${layout}.pdf`, path: `C:\\DANFE\\PDF\\${layout}.pdf`,
}));
const refreshOutputs = vi.fn().mockResolvedValue(true);
const openOutputFile = vi.fn().mockResolvedValue(undefined);
const downloadOutputFile = vi.fn().mockResolvedValue('C:\\Downloads\\layout.pdf');
const generateOutputLayout = vi.fn().mockResolvedValue({ layoutLabel: 'DANFE Cupom Varejo' });

function setOutputs(outputs: Output[]) {
  vi.mocked(useDanfe).mockReturnValue({
    outputs, outputFolder: 'C:\\DANFE', serviceOnline: true,
    refreshOutputs, openOutputFile, downloadOutputFile, generateOutputLayout,
  } as unknown as ReturnType<typeof useDanfe>);
}

function openLayouts(company = main.company) {
  const row = screen.getByText(`${main.number} - ${company}.pdf`).closest('tr')!;
  fireEvent.click(within(row).getByRole('button', { name: 'Layouts do DANFE' }));
  return screen.getByRole('menu', { name: 'Layouts do DANFE' });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Os layouts chegam antes do original na listagem do backend.
  setOutputs([...variants, main, other, { ...main, id: 'xml', format: 'XML' }]);
});
afterEach(cleanup);

describe('Layouts dentro do DANFE principal', () => {
  it('shows one row per original and downloads or opens saved layouts without generating them again', async () => {
    render(<OutputsPage />);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(3);
    expect(screen.getByText('1–2 de 2 PDFs')).toBeInTheDocument();
    expect(screen.getByText('2 PDFs salvos')).toBeInTheDocument();
    expect(screen.getByText('3 layouts gerados')).toBeInTheDocument();
    expect(screen.queryByText('DANFE Etiqueta')).not.toBeInTheDocument();

    // Mesmo numero de nota, mas outra chave: os layouts pertencem somente a Alfa.
    const otherMenu = openLayouts(other.company);
    expect(within(otherMenu).queryByText('Layouts gerados')).not.toBeInTheDocument();
    expect(within(otherMenu).getAllByRole('menuitem')).toHaveLength(3);
    fireEvent.keyDown(document, { key: 'Escape' });

    const menu = openLayouts();
    expect(within(menu).getAllByRole('menuitem')).toHaveLength(3);
    expect(within(menu).queryByText('Gerar outro layout')).not.toBeInTheDocument();
    fireEvent.click(within(menu).getByRole('button', { name: 'Baixar DANFE Etiqueta' }));
    await waitFor(() => expect(downloadOutputFile).toHaveBeenCalledWith(variants[1]));
    expect(openOutputFile).not.toHaveBeenCalled();
    fireEvent.click(within(menu).getByRole('menuitem', { name: 'Visualizar DANFE Simplificado' }));
    const dialog = screen.getByRole('dialog', { name: 'Visualizador de PDF' });
    expect(within(dialog).getByTitle(`PDF ${main.number}`)).toHaveAttribute('src', variants[0]!.url);
    expect(generateOutputLayout).not.toHaveBeenCalled();
  });

  it('finds the parent when searching a layout and keeps layouts nested in the grid', () => {
    render(<OutputsPage />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar arquivos PDF' }), { target: { value: 'etiqueta' } });
    expect(screen.getByText('1–1 de 1 PDF')).toBeInTheDocument();
    expect(screen.getByText(`${main.number} - ${main.company}.pdf`)).toBeInTheDocument();
    expect(screen.queryByText(`${other.number} - ${other.company}.pdf`)).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle('Visualizar grade'));
    expect(screen.getAllByRole('button', { name: 'Visualizar' })).toHaveLength(1);
    expect(screen.getByText('3 layouts gerados')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Layouts do DANFE' }));
    expect(screen.getByRole('menuitem', { name: 'Visualizar DANFE Etiqueta' })).toBeInTheDocument();
  });

  it('offers generation only for missing layouts and nests the result after refresh', async () => {
    setOutputs([main, variants[0]!]);
    const { rerender } = render(<OutputsPage />);
    openLayouts();
    expect(screen.getByRole('menuitem', { name: 'Visualizar DANFE Simplificado' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('menuitem', { name: 'Gerar DANFE Cupom Varejo' }));
    await waitFor(() => expect(refreshOutputs).toHaveBeenCalledOnce());
    expect(generateOutputLayout).toHaveBeenCalledWith(main.key, 'varejo');

    setOutputs([variants[2]!, main, variants[0]!]);
    rerender(<OutputsPage />);
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
    expect(screen.getByText('2 layouts gerados')).toBeInTheDocument();
    openLayouts();
    expect(screen.getByRole('menuitem', { name: 'Visualizar DANFE Cupom Varejo' })).toBeInTheDocument();
    expect(screen.queryByRole('menuitem', { name: 'Gerar DANFE Cupom Varejo' })).not.toBeInTheDocument();
  });

  it('keeps a saved layout accessible if its original PDF has been removed', () => {
    setOutputs([variants[0]!]);
    render(<OutputsPage />);
    expect(screen.getByText('1–1 de 1 PDF')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Visualizar PDF' }));
    expect(screen.getByTitle(`PDF ${main.number}`)).toHaveAttribute('src', variants[0]!.url);
  });
});
