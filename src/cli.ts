#!/usr/bin/env node
import { Command, Option } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { ScraperEngine, type SourceName } from './engine.js';
import type { ExportFormat } from './core/types/exporter.interface.js';
import type { LogLevel } from './core/logger.js';

const program = new Command();

program
  .name('b2b-scraper')
  .description("Extraction de leads B2B (Google Maps, annuaires) — sans API tierce payante")
  .version('0.1.0');

program
  .command('extract')
  .description("Lance une session d'extraction et exporte le résultat")
  .requiredOption('-q, --query <terme>', 'Terme métier, ex: "Hôtel"')
  .requiredOption('-l, --location <zone>', 'Zone cible, ex: "Douala, Cameroun"')
  .addOption(
    new Option('-s, --source <source>', 'Source de collecte')
      .choices(['gmaps', 'google-maps'])
      .default('gmaps'),
  )
  .option('-o, --output <fichier>', 'Fichier de sortie (.xlsx | .csv | .json)', './out/leads.xlsx')
  .addOption(new Option('-f, --format <format>', "Force le format d'export").choices(['excel', 'csv', 'json']))
  .option('-c, --country <iso2>', 'Pays ISO-2 pour la normalisation des téléphones', 'CM')
  .option('-n, --limit <n>', 'Nombre max de fiches (0 = illimité)', '0')
  .addOption(
    new Option('--log-level <niveau>', 'Verbosité')
      .choices(['debug', 'info', 'warn', 'error', 'silent'])
      .default('info'),
  )
  .action(async (opts) => {
    const startedAt = Date.now();
    console.error(chalk.bold.cyan('\n  b2b-scraper — extraction\n'));

    const engine = new ScraperEngine({ logLevel: opts.logLevel as LogLevel });
    const controller = new AbortController();
    const onSigint = () => {
      console.error(chalk.yellow('\n  interruption — fin propre en cours...'));
      controller.abort();
    };
    process.on('SIGINT', onSigint);

    const spinner = ora({ text: `Collecte : "${opts.query}" @ "${opts.location}"`, stream: process.stderr });
    if (opts.logLevel === 'info') spinner.start();

    try {
      const result = await engine.run({
        query: opts.query,
        location: opts.location,
        source: opts.source as SourceName,
        output: opts.output,
        format: opts.format as ExportFormat | undefined,
        country: opts.country,
        limit: Number.parseInt(opts.limit, 10) || 0,
        signal: controller.signal,
      });

      spinner.stop();
      const s = result.stats;
      console.error(chalk.green(`\n  ✓ ${s.accepted} leads exportés`) + chalk.gray(` (${result.export.location})`));
      console.error(
        chalk.gray(
          `    reçus ${s.received} · doublons ${s.duplicates} · invalides ${s.invalid} · ${(
            (Date.now() - startedAt) /
            1000
          ).toFixed(1)}s\n`,
        ),
      );
    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`\n  ✗ Échec : ${(error as Error).message}\n`));
      process.exitCode = 1;
    } finally {
      process.off('SIGINT', onSigint);
    }
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(chalk.red((error as Error).message));
  process.exit(1);
});
