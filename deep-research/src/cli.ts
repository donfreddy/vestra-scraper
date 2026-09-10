#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { Command, Option } from 'commander';
import chalk from 'chalk';
import { loadConfig, requireGemini, requireNotion } from './config.js';
import { createGemini } from './gemini.js';
import { inputFileSchema, flattenInput, type HotelTask } from './types.js';
import { RecordStore } from './store.js';
import { NotionSink } from './notion.js';
import { runEnrichment } from './pipeline.js';
import { parseCityRef, runDiscovery } from './discover.js';

const program = new Command();
program
  .name('research')
  .description("Enrichissement d'hôtels par recherche web LLM (Gemini) + synchro Notion")
  .version('0.1.0');

const collect = (v: string, prev: string[] = []) => [...prev, v];

program
  .command('discover')
  .description('Génère une liste de noms d’hôtels par ville (via Gemini + Google Search)')
  .requiredOption('-c, --city <ville[:pays]>', 'Ville cible, répétable (ex: "Douala:Cameroun")', collect)
  .option('-o, --output <fichier>', 'Fichier de liste à générer', './hotels.json')
  .action(async (opts) => {
    const config = loadConfig();
    const ai = createGemini(requireGemini(config));
    const cities = (opts.city as string[]).map(parseCityRef);
    await runDiscovery(ai, config, cities, opts.output);
  });

program
  .command('enrich')
  .description('Enrichit chaque hôtel du fichier d’entrée et (option) pousse vers Notion')
  .requiredOption('-i, --input <fichier>', 'Fichier JSON { "Ville": { country, hotels: [...] } }')
  .option('-o, --output <fichier>', 'Sauvegarde locale JSON (reprise sur crash)', './out/hotels.json')
  .option('--notion', 'Pousser aussi les résultats dans Notion')
  .option('--force', 'Ré-enrichir même les hôtels déjà présents dans la sauvegarde')
  .addOption(new Option('--limit <n>', 'Ne traiter que les n premiers hôtels').argParser(Number))
  .action(async (opts) => {
    const config = loadConfig();
    const ai = createGemini(requireGemini(config));

    const raw = JSON.parse(readFileSync(resolve(process.cwd(), opts.input), 'utf-8'));
    const input = inputFileSchema.parse(raw);
    let tasks: HotelTask[] = flattenInput(input);
    if (opts.limit && Number.isFinite(opts.limit)) tasks = tasks.slice(0, opts.limit);

    if (tasks.length === 0) {
      console.error(chalk.red('  Aucun hôtel dans le fichier d’entrée.'));
      process.exitCode = 1;
      return;
    }

    const store = new RecordStore(opts.output);
    store.load();

    let notion: NotionSink | undefined;
    if (opts.notion) {
      const { apiKey, databaseId } = requireNotion(config);
      notion = new NotionSink(apiKey, databaseId);
      await notion.verifySchema();
      console.error(chalk.gray('  Notion : base accessible, schéma OK'));
    }

    const controller = new AbortController();
    const onSigint = () => controller.abort();
    process.on('SIGINT', onSigint);

    console.error(
      chalk.bold.cyan(`\n  research enrich — ${tasks.length} hôtels`) +
        chalk.gray(`  (${config.geminiModel}${notion ? ', → Notion' : ', local'})`),
    );
    if (!config.geminiSearch) {
      console.error(
        chalk.yellow('  ⚠ GEMINI_SEARCH=false : réponses issues des connaissances du modèle, sans sources web (moins fiable)'),
      );
    }
    console.error('');

    try {
      const s = await runEnrichment(ai, config, {
        tasks,
        store,
        ...(notion ? { notion } : {}),
        force: Boolean(opts.force),
        signal: controller.signal,
      });
      console.error(
        chalk.green(`\n  ✓ ${s.enriched} enrichis`) +
          chalk.gray(
            ` · ${s.skipped} déjà faits · ${s.failed} échecs · ${s.needsReview} à vérifier` +
              (notion ? ` · Notion +${s.notionCreated}/~${s.notionUpdated}` : ''),
          ),
      );
      console.error(chalk.gray(`    sauvegarde : ${store.path}\n`));
    } catch (error) {
      console.error(chalk.red(`\n  ✗ ${(error as Error).message}\n`));
      process.exitCode = 1;
    } finally {
      process.off('SIGINT', onSigint);
    }
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(chalk.red((error as Error).message));
  process.exit(1);
});
