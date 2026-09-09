import { extname } from 'node:path';
import type { ExportFormat, ILeadExporter } from '../types/exporter.interface.js';
import { JsonExporter } from './json.exporter.js';
import { CsvExporter } from './csv.exporter.js';
import { ExcelExporter } from './excel.exporter.js';

export { JsonExporter } from './json.exporter.js';
export { CsvExporter } from './csv.exporter.js';
export { ExcelExporter } from './excel.exporter.js';
export { flattenLead, LEAD_COLUMNS } from './flatten.js';

const EXT_TO_FORMAT: Record<string, ExportFormat> = {
  '.json': 'json',
  '.csv': 'csv',
  '.xlsx': 'excel',
};

/** Déduit le format depuis l'extension du fichier de sortie, sinon `fallback`. */
export function resolveFormat(outputPath: string, explicit?: string): ExportFormat {
  if (explicit === 'json' || explicit === 'csv' || explicit === 'excel') return explicit;
  const fromExt = EXT_TO_FORMAT[extname(outputPath).toLowerCase()];
  if (fromExt) return fromExt;
  return 'excel';
}

export function createExporter(format: ExportFormat, outputPath: string): ILeadExporter {
  switch (format) {
    case 'json':
      return new JsonExporter(outputPath);
    case 'csv':
      return new CsvExporter(outputPath);
    case 'excel':
      return new ExcelExporter(outputPath);
    default: {
      const exhaustive: never = format;
      throw new Error(`Format d'export inconnu: ${String(exhaustive)}`);
    }
  }
}
