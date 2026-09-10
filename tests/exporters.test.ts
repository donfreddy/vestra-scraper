import { describe, it, expect, afterAll } from 'vitest';
import { readFile, rm, mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import ExcelJS from 'exceljs';
import { createExporter, resolveFormat } from '../src/index.js';
import { normalizeLead } from '../src/index.js';
import type { VestraLead } from '../src/index.js';

const leads: VestraLead[] = [
  normalizeLead({
    source: 'google-maps',
    companyName: 'Hôtel Akwa Palace',
    city: 'Douala',
    phoneRaw: '+237 233 42 26 01',
    websiteUrl: 'https://akwa-palace.com',
    googleRating: 4.1,
    contacts: [{ fullName: 'Jean Kamga', titleRaw: 'Directeur Général', emailDirect: 'jean@akwa-palace.com' }],
  }),
  normalizeLead({ source: 'google-maps', companyName: 'Résidence La Falaise', city: 'Yaoundé' }),
];

let dir = '';

afterAll(async () => {
  if (dir) await rm(dir, { recursive: true, force: true });
});

describe('resolveFormat', () => {
  it('infers the format from the extension', () => {
    expect(resolveFormat('a/b.csv')).toBe('csv');
    expect(resolveFormat('a/b.json')).toBe('json');
    expect(resolveFormat('a/b.xlsx')).toBe('excel');
    expect(resolveFormat('a/b.txt', 'json')).toBe('json');
  });
});

describe('exporters', () => {
  it('JsonExporter writes a valid JSON array', async () => {
    dir ||= await mkdtemp(join(tmpdir(), 'scraper-'));
    const path = join(dir, 'out.json');
    const exp = createExporter('json', path);
    await exp.open();
    for (const l of leads) await exp.write(l);
    const res = await exp.close();

    expect(res.count).toBe(2);
    const parsed = JSON.parse(await readFile(path, 'utf-8')) as VestraLead[];
    expect(parsed).toHaveLength(2);
    expect(parsed[0]!.companyName).toBe('Hôtel Akwa Palace');
  });

  it('CsvExporter writes a header + rows with the ; separator', async () => {
    dir ||= await mkdtemp(join(tmpdir(), 'scraper-'));
    const path = join(dir, 'out.csv');
    const exp = createExporter('csv', path);
    await exp.open();
    for (const l of leads) await exp.write(l);
    await exp.close();

    const content = await readFile(path, 'utf-8');
    expect(content).toContain('Establishment name;');
    expect(content).toContain('Hôtel Akwa Palace;');
    expect(content.trim().split('\n')).toHaveLength(3);
  });

  it('ExcelExporter produces 2 tabs with the right rows', async () => {
    dir ||= await mkdtemp(join(tmpdir(), 'scraper-'));
    const path = join(dir, 'out.xlsx');
    const exp = createExporter('excel', path);
    await exp.open();
    for (const l of leads) await exp.write(l);
    await exp.close();

    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(path);
    const etab = wb.getWorksheet('Establishments');
    const dec = wb.getWorksheet('Contacts');
    expect(etab?.actualRowCount).toBe(3); // header + 2
    expect(dec?.actualRowCount).toBe(2); // header + 1 contact
  });
});
