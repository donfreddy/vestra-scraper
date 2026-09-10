import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { stringify, type Stringifier } from 'csv-stringify';
import type { VestraLead } from '../types/lead.entity.js';
import type { ExporterResult, ILeadExporter } from '../types/exporter.interface.js';
import { LEAD_COLUMNS, flattenLead } from './flatten.js';

/** CSV export (`;` separator, UTF-8 BOM for French Excel). */
export class CsvExporter implements ILeadExporter {
  readonly name = 'csv';
  private fileStream: WriteStream | undefined;
  private stringifier: Stringifier | undefined;
  private count = 0;
  private readonly path: string;

  constructor(outputPath: string) {
    this.path = resolve(process.cwd(), outputPath);
  }

  async open(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    this.fileStream = createWriteStream(this.path, { encoding: 'utf-8' });
    this.fileStream.write('﻿');
    this.stringifier = stringify({
      header: true,
      delimiter: ';',
      columns: LEAD_COLUMNS.map(([key, header]) => ({ key, header })),
    });
    this.stringifier.pipe(this.fileStream);
  }

  async write(lead: VestraLead): Promise<void> {
    if (!this.stringifier) throw new Error('CsvExporter: open() not called');
    this.stringifier.write(flattenLead(lead));
    this.count += 1;
  }

  async close(): Promise<ExporterResult> {
    if (!this.stringifier || !this.fileStream) throw new Error('CsvExporter: open() not called');
    const done = new Promise<void>((res, rej) => {
      this.fileStream!.on('error', rej);
      this.fileStream!.on('finish', () => res());
    });
    this.stringifier.end();
    await done;
    return { target: this.name, count: this.count, location: this.path };
  }
}
