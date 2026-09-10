import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import type { GoogleGenAI } from '@google/genai';
import type { AppConfig } from './config.js';
import { discoverHotels } from './gemini.js';
import type { InputFile } from './types.js';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface CityRef {
  city: string;
  country: string;
}

/** "Douala:Cameroun" -> { city, country }. Pays par défaut : Cameroun. */
export function parseCityRef(spec: string): CityRef {
  const [city, country] = spec.split(':').map((x) => x.trim());
  if (!city) throw new Error(`ville invalide: "${spec}"`);
  return { city, country: country || 'Cameroun' };
}

export async function runDiscovery(
  ai: GoogleGenAI,
  config: AppConfig,
  cities: CityRef[],
  outputPath: string,
): Promise<InputFile> {
  const result: InputFile = {};
  for (let i = 0; i < cities.length; i += 1) {
    const { city, country } = cities[i]!;
    console.error(chalk.gray(`[${i + 1}/${cities.length}] recherche des hôtels à ${city} (${country})…`));
    const { hotels } = await discoverHotels(ai, city, country, {
      model: config.geminiModel,
      maxRetries: config.maxRetries,
      search: config.geminiSearch,
    });
    result[city] = { country, hotels };
    console.error(chalk.green(`   ${hotels.length} hôtels trouvés`));
    if (i < cities.length - 1) await sleep(config.requestIntervalMs);
  }

  const path = resolve(process.cwd(), outputPath);
  writeFileSync(path, JSON.stringify(result, null, 2), 'utf-8');
  console.error(chalk.green(`\n  ✓ liste écrite : ${path}`));
  return result;
}
