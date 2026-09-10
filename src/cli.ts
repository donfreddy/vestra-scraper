#!/usr/bin/env node
import { Command, Option } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import { ScraperEngine, type SourceName } from './engine.js';
import type { ExportFormat } from './core/types/exporter.interface.js';
import type { LogLevel } from './core/logger.js';

const program = new Command();

program
  .name('vestra')
  .description('Vestra. B2B lead extraction and enrichment (Google Maps, directories)')
  .version('0.1.0');

program
  .command('extract')
  .description("Runs an extraction session and exports the result")
  .requiredOption('-q, --query <term>', 'Business term, e.g. "Hotel"')
  .requiredOption('-l, --location <area>', 'Target area, e.g. "Douala, Cameroon"')
  .addOption(
    new Option('-s, --source <source>', 'Collection source')
      .choices(['gmaps', 'google-maps'])
      .default('gmaps'),
  )
  .option('-o, --output <file>', 'Output file (.xlsx | .csv | .json)', './out/leads.xlsx')
  .addOption(new Option('-f, --format <format>', 'Force the export format').choices(['excel', 'csv', 'json']))
  .option('-c, --country <iso2>', 'ISO-2 country for phone normalization', 'CM')
  .option('-n, --limit <n>', 'Max number of records (0 = unlimited)', '0')
  .option(
    '-e, --enrich <list>',
    'Enrichment: "website", "email", "reviews", comma-separated, or "all"',
  )
  .option('--fresh', 'Ignore any existing checkpoint and restart from scratch')
  .addOption(
    new Option('--log-level <level>', 'Verbosity')
      .choices(['debug', 'info', 'warn', 'error', 'silent'])
      .default('info'),
  )
  .action(async (opts) => {
    const startedAt = Date.now();
    console.error(chalk.bold.cyan('\n  vestra extraction\n'));

    const engine = new ScraperEngine({ logLevel: opts.logLevel as LogLevel });
    const controller = new AbortController();
    const onSigint = () => {
      console.error(chalk.yellow('\n  interruption, shutting down cleanly...'));
      controller.abort();
    };
    process.on('SIGINT', onSigint);

    const spinner = ora({ text: `Collecting: "${opts.query}" @ "${opts.location}"`, stream: process.stderr });
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
        ...(opts.enrich ? { enrich: opts.enrich as string } : {}),
        ...(opts.fresh ? { fresh: true } : {}),
        signal: controller.signal,
      });

      spinner.stop();
      const s = result.stats;
      console.error(
        chalk.green(`\n  ✓ ${result.leads.length} leads exported`) + chalk.gray(` (${result.export.location})`),
      );
      console.error(
        chalk.gray(
          `    received ${s.received} · duplicates ${s.duplicates} · invalid ${s.invalid} · ${(
            (Date.now() - startedAt) /
            1000
          ).toFixed(1)}s`,
        ),
      );
      if (result.resumed > 0) {
        console.error(chalk.gray(`    (incl. ${result.resumed} restored from an interrupted run)`));
      }
      if (result.enrichment) {
        const e = result.enrichment;
        console.error(
          chalk.gray(
            `    enriched ${e.leadsEnriched}/${result.leads.length} via ${e.enrichers.join('+')} · chains ${e.chainsDetected}`,
          ),
        );
      }
      console.error('');
    } catch (error) {
      spinner.stop();
      console.error(chalk.red(`\n  ✗ Failed: ${(error as Error).message}\n`));
      process.exitCode = 1;
    } finally {
      process.off('SIGINT', onSigint);
    }
  });

program.parseAsync(process.argv).catch((error) => {
  console.error(chalk.red((error as Error).message));
  process.exit(1);
});
