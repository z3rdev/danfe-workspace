import { describe, expect, it } from 'vitest';
import { makeKey, parseInvoices, validKey, makeOutputs, demoInvoices } from './danfe';
describe('DANFE rules', () => {
  it('accepts only a key with 44 digits', () => {
    expect(validKey('1'.repeat(44))).toBe(true);
    expect(validKey('1'.repeat(43))).toBe(false);
    expect(validKey('1'.repeat(45))).toBe(false);
    expect(validKey('a'.repeat(44))).toBe(false);
    expect(makeKey(0)).toHaveLength(44);
  });
  it('reads TXT and TSV rows and rejects invalid keys', () => {
    const rows = parseInvoices(`123\tEMPRESA TESTE\t${'1'.repeat(44)}\tTrue\n124\tOUTRA EMPRESA\t123\tFalse`);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ number: '123', company: 'EMPRESA TESTE', status: 'pending', selected: true });
    expect(rows[1]).toMatchObject({ status: 'invalid', selected: false });
  });
  it('generates both PDF and XML entries for an invoice', () => {
    const row = demoInvoices[0];
    if (!row) throw new Error('Missing demo row');
    expect(makeOutputs(row).map(file => file.format)).toEqual(['PDF', 'XML']);
  });
});