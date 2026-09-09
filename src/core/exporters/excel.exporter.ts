import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import ExcelJS from 'exceljs';
import type { B2BLead } from '../types/lead.entity.js';
import type { ExporterResult, ILeadExporter } from '../types/exporter.interface.js';
import { LEAD_COLUMNS, flattenLead } from './flatten.js';

const CONTACT_COLUMNS = [
  ['companyName', 'Company'],
  ['city', 'City'],
  ['fullName', 'Contact name'],
  ['role', 'Role'],
  ['titleRaw', 'Exact title'],
  ['emailDirect', 'Direct email'],
  ['phoneDirect', 'Direct phone'],
  ['linkedinUrl', 'LinkedIn'],
  ['confidence', 'Confidence'],
  ['leadId', 'Company ID'],
] as const;

/**
 * Streaming Excel export: an "Establishments" tab (one row per lead) and
 * a "Contacts" tab (one row per contact).
 */
export class ExcelExporter implements ILeadExporter {
  readonly name = 'excel';
  private workbook: ExcelJS.stream.xlsx.WorkbookWriter | undefined;
  private leadSheet: ExcelJS.Worksheet | undefined;
  private contactSheet: ExcelJS.Worksheet | undefined;
  private count = 0;
  private readonly path: string;

  constructor(outputPath: string) {
    this.path = resolve(process.cwd(), outputPath);
  }

  async open(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    this.workbook = new ExcelJS.stream.xlsx.WorkbookWriter({
      filename: this.path,
      useStyles: true,
      useSharedStrings: true,
    });

    this.leadSheet = this.workbook.addWorksheet('Establishments', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    this.leadSheet.columns = LEAD_COLUMNS.map(([key, header]) => ({ key, header, width: 24 }));
    this.leadSheet.getRow(1).font = { bold: true };

    this.contactSheet = this.workbook.addWorksheet('Contacts', {
      views: [{ state: 'frozen', ySplit: 1 }],
    });
    this.contactSheet.columns = CONTACT_COLUMNS.map(([key, header]) => ({ key, header, width: 24 }));
    this.contactSheet.getRow(1).font = { bold: true };
  }

  async write(lead: B2BLead): Promise<void> {
    if (!this.leadSheet || !this.contactSheet) throw new Error('ExcelExporter: open() not called');
    this.leadSheet.addRow(flattenLead(lead)).commit();
    for (const c of lead.contacts) {
      this.contactSheet
        .addRow({
          companyName: lead.companyName,
          city: lead.city,
          fullName: c.fullName,
          role: c.role,
          titleRaw: c.titleRaw ?? '',
          emailDirect: c.emailDirect ?? '',
          phoneDirect: c.phoneDirect ?? '',
          linkedinUrl: c.linkedinUrl ?? '',
          confidence: c.confidence ?? '',
          leadId: lead.id,
        })
        .commit();
    }
    this.count += 1;
  }

  async close(): Promise<ExporterResult> {
    if (!this.workbook || !this.leadSheet || !this.contactSheet) {
      throw new Error('ExcelExporter: open() not called');
    }
    this.leadSheet.commit();
    this.contactSheet.commit();
    await this.workbook.commit();
    return { target: this.name, count: this.count, location: this.path };
  }
}
