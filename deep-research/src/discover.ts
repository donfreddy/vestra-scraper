import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import chalk from 'chalk';
import type { GoogleGenAI } from '@google/genai';
import type { AppConfig } from './config.js';
import { discoverHotelsFromContext, discoverHotelsGrounded } from './gemini.js';
import { buildCityContext } from './websearch.js';
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

async function discoverOne(ai: GoogleGenAI, city: string, country: string, config: AppConfig): Promise<string[]> {
  const opts = { model: config.geminiModel, maxRetries: config.maxRetries };

  if (config.searchProvider === 'google') {
    return (await discoverHotelsGrounded(ai, city, country, opts)).hotels;
  }
  if (config.searchProvider === 'duckduckgo') {
    const context = await buildCityContext(city, country, Math.max(config.searchMaxResults, 10));
    return (await discoverHotelsFromContext(ai, city, country, context, opts)).hotels;
  }
  return (await discoverHotelsFromContext(ai, city, country, { text: '', sources: [] }, opts)).hotels;
}

export async function runDiscovery(
  ai: GoogleGenAI,
  config: AppConfig,
  cities: CityRef[],
  outputPath: string,
): Promise<InputFile> {
  if (config.searchProvider !== 'google') {
    console.error(
      chalk.gray(
        '  Note : pour une liste vraiment exhaustive, `vestra extract` (Google Maps) reste plus fiable ' +
          'que la découverte par recherche web/mémoire — utilise ceci comme point de départ à relire.\n',
      ),
    );
  }

  const result: InputFile = {};
  for (let i = 0; i < cities.length; i += 1) {
    const { city, country } = cities[i]!;
    console.error(chalk.gray(`[${i + 1}/${cities.length}] recherche des hôtels à ${city} (${country})…`));
    const hotels = await discoverOne(ai, city, country, config);
    result[city] = { country, hotels };
    console.error(chalk.green(`   ${hotels.length} hôtels trouvés`));
    if (i < cities.length - 1) await sleep(config.requestIntervalMs);
  }

  const path = resolve(process.cwd(), outputPath);
  writeFileSync(path, JSON.stringify(result, null, 2), 'utf-8');
  console.error(chalk.green(`\n  ✓ liste écrite : ${path}`));
  return result;
}
