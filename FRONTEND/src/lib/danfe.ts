export type ItemStatus = 'pending' | 'processing' | 'done' | 'error' | 'invalid';
export type Invoice = {
  id: string;
  number: string;
  company: string;
  key: string;
  status: ItemStatus;
  selected: boolean;
  errorCode?: string;
  errorMessage?: string;
};
export type OutputLayout = 'danfe' | 'simplificado' | 'etiqueta' | 'varejo';
export type Output = { id: string; number: string; company: string; key: string; format: 'PDF' | 'XML' | 'JSON'; layout?: OutputLayout; layoutLabel?: string; time: string; size: string; url?: string | undefined; path?: string | undefined };
export type OutputGroup = Output & { layouts: Output[] };

export function countPrimaryPdfs(outputs: readonly Output[]): number {
  return outputs.filter(file => file.format === 'PDF' && (file.layout || 'danfe') === 'danfe').length;
}

export function groupOutputPdfs(outputs: Output[]): OutputGroup[] {
  const pdfs = outputs.filter(file => file.format === 'PDF');
  const groups: OutputGroup[] = pdfs
    .filter(file => (file.layout || 'danfe') === 'danfe')
    .map(file => ({ ...file, layouts: [] }));
  const parentsByKey = new Map<string, OutputGroup>();

  for (const group of groups) {
    if (group.key && !parentsByKey.has(group.key)) parentsByKey.set(group.key, group);
  }

  for (const file of pdfs) {
    if ((file.layout || 'danfe') === 'danfe') continue;
    const parent = file.key ? parentsByKey.get(file.key) : undefined;
    if (parent) {
      parent.layouts.push(file);
    } else {
      // Preserva o acesso ao arquivo se o DANFE principal foi removido.
      groups.push({ ...file, layouts: [] });
    }
  }

  return groups;
}

export type LogEntry = { id: string; time: string; level: 'INFO' | 'WARN' | 'ERROR'; message: string };
export const outputFolder = 'C:\\Users\\João\\Documents\\DANFE\\Saídas';
export const companies = ['REDE HG COMBUSTÍVEIS LTDA', 'AUTO POSTO JATIENSE LTDA', 'DISTRIBUIDORA SANTA LUZIA LTDA', 'POSTO NOVA ESPERANÇA LTDA', 'TRANSPORTADORA VIA SUL LTDA', 'COMERCIAL SÃO LUCAS LTDA'];
export function makeKey(index: number) { return `352610123456780001955500100${String(233423 + index).padStart(9, '0')}1234567${index % 10}`; }
export function validKey(key: string) { return /^\d{44}$/.test(key.replace(/\s/g, '')); }
export function formatKey(key: string) { return key.replace(/\s/g, '').match(/.{1,4}/g)?.join(' ') ?? ''; }
export function parseInvoices(text: string): Invoice[] {
  return text.split(/\r?\n/).filter(line => line.trim()).filter(line => !/^(chave|nota|n[uú]mero)\b/i.test(line.trim())).map((line, index) => {
    const cells = line.split(/[\t;]/).map(cell => cell.trim());
    const key = cells.find(cell => /^\d{44}$/.test(cell.replace(/\s/g, '')))?.replace(/\s/g, '') ?? line.match(/\b\d{44}\b/)?.[0] ?? '';
    const number = cells.find(cell => /^\d{1,9}$/.test(cell)) ?? (key ? key.slice(25, 34) : String(index + 1));
    const company = cells.find(cell => /[a-zÀ-ÿ]{3}/i.test(cell) && !/^(true|false)$/i.test(cell)) ?? 'Empresa não informada';
    return { id: `import-${index}`, number, company, key, status: validKey(key) ? 'pending' : 'invalid', selected: !cells.some(cell => /^false$/i.test(cell)) };
  });
}
export const demoInvoices: Invoice[] = Array.from({ length: 12 }, (_, i) => ({ id: `demo-${i}`, number: String(233423 - i).padStart(9, '0'), company: companies[i % companies.length] ?? 'Empresa de demonstração', key: makeKey(i), status: i < 8 ? 'done' : 'pending', selected: true }));
export function makeOutputs(item: Invoice): Output[] {
  return (['PDF', 'XML'] as const).map(format => ({ id: `${item.id}-${format}`, number: item.number, company: item.company, key: item.key, format, time: new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }), size: format === 'PDF' ? '42,8 KB' : '8,2 KB' }));
}
export const initialOutputs = demoInvoices.filter(item => item.status === 'done').flatMap(makeOutputs);
