import { createWriteStream, type WriteStream } from 'node:fs';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import type { VestraLead } from '../types/lead.entity.js';
import type { ExporterResult, ILeadExporter } from '../types/exporter.interface.js';

/** Writes an indented JSON array, streaming (no memory accumulation). */
export class JsonExporter implements ILeadExporter {
  readonly name = 'json';
  private stream: WriteStream | undefined;
  private count = 0;
  private readonly path: string;

  constructor(outputPath: string) {
    this.path = resolve(process.cwd(), outputPath);
  }

  async open(): Promise<void> {
    await mkdir(dirname(this.path), { recursive: true });
    this.stream = createWriteStream(this.path, { encoding: 'utf-8' });
    this.stream.write('[\n');
  }

  async write(lead: VestraLead): Promise<void> {
    if (!this.stream) throw new Error('JsonExporter: open() not called');
    const prefix = this.count === 0 ? '' : ',\n';
    this.stream.write(prefix + JSON.stringify(lead, null, 2).replace(/^/gm, '  '));
    this.count += 1;
  }

  async close(): Promise<ExporterResult> {
    if (!this.stream) throw new Error('JsonExporter: open() not called');
    const stream = this.stream;
    await new Promise<void>((res, rej) => {
      stream.on('error', rej);
      stream.on('finish', () => res());
      stream.end('\n]\n');
    });
    return { target: this.name, count: this.count, location: this.path };
  }
}
