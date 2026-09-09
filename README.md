# Vestra

**Vestra** is an internal module for extracting and enriching **B2B leads** (Google Maps,
directories) in **Node.js / TypeScript**, without depending on a paid third-party API. Designed to
be reused in other projects (SDK) or run from the command line (`vestra` CLI).

Derived from the scoping described in [`gemini.md`](./gemini.md). Current scope:

- **Collection**: Google Maps scraper (Playwright) + pipeline (validation, E.164 phone,
  cities, deduplication) + JSON / CSV / Excel exporters + CLI.
- **Enrichment** (`--enrich` option): website (emails, phones, social networks,
  legal name, decision-maker contacts), email verification (MX + SMTP), Google reviews
  (summary + sentiment via the Claude API), chain detection.

Not yet done (interfaces ready): captcha solving, PostgreSQL/Prisma persistence,
firmographics (revenue / headcount), web traffic.

## Installation

```bash
corepack enable
yarn install
yarn playwright install chromium   # headless browser (also run in postinstall)
cp .env.example .env               # adjust if needed
```

Node >= 20 required.

## Usage (CLI)

```bash
# Development (direct TypeScript)
yarn cli extract -q "Hotel" -l "Douala, Cameroon" -o ./out/hotels_douala.xlsx

# After build / global link
yarn build && npm link
vestra extract -q "Hotel" -l "Kribi, Cameroon" -n 50 -f csv -o ./out/kribi.csv
```

| Option | Description | Default |
| --- | --- | --- |
| `-q, --query` | Business term (`"Hotel"`, `"Clinic"`...) | *required* |
| `-l, --location` | Target area (`"Douala, Cameroon"`) | *required* |
| `-s, --source` | `gmaps` \| `google-maps` | `gmaps` |
| `-o, --output` | Output file, format comes from the extension | `./out/leads.xlsx` |
| `-f, --format` | Force `excel` \| `csv` \| `json` | *(inferred)* |
| `-c, --country` | ISO-2 country for phone normalization | `CM` |
| `-n, --limit` | Max number of records (`0` = unlimited) | `0` |
| `-e, --enrich` | `website`, `email`, `reviews` (comma-separated) or `all` | *(none)* |
| `--log-level` | `debug` \| `info` \| `warn` \| `error` \| `silent` | `info` |

> Google caps a search at ~120 results per area. To cover a large city, run several
> targeted queries (neighborhoods, districts) against the same output file: the
> pipeline deduplicates automatically.

### Enrichment

```bash
vestra extract -q "Hotel" -l "Douala, Cameroon" --enrich website,email -o ./out/douala.xlsx
vestra extract -q "Hotel" -l "Kribi, Cameroon"  --enrich all           -o ./out/kribi.xlsx
```

| Enricher | Source | Adds | Dependency |
| --- | --- | --- | --- |
| `website` | lead website (HTTP) | `emails`, `phones`, `socials` (LinkedIn/FB/IG/WhatsApp), `legalName`, decision-maker `contacts` (heuristic) | none |
| `email` | MX + SMTP handshake | `emailStatus` (`valid`/`invalid`/`risky`/`unknown`), `emailCatchAll` | outbound port 25 open (otherwise `unknown`) |
| `reviews` | Google Maps reviews (Playwright) | `reviews.summary`, `reviews.sentiment`, `reviews.highlights` | `ANTHROPIC_API_KEY` (otherwise raw excerpts) |

**Chain** detection (`chain.isChain` / `chain.name`) runs automatically as soon as an
enricher is active: known brands plus the same brand spotted in >= 2 cities.

> With `--enrich`, results are first all collected then enriched (no streaming):
> plan extra time on large volumes.

## Usage (SDK)

```ts
import { ScraperEngine } from 'vestra';

const engine = new ScraperEngine({ logLevel: 'info' });
const { leads, stats, export: out } = await engine.run({
  query: 'Hotel',
  location: 'Douala, Cameroon',
  output: './out/douala.xlsx',
  limit: 100,
  enrich: 'website,email', // optional
});

console.log(`${stats.accepted} leads -> ${out.location}`);
```

The building blocks are also exported individually: `normalizePhone`, `normalizeCity`,
`Deduplicator`, `LeadPipeline`, `HttpDriver`, `BrowserDriver`, `createExporter`, etc.

## Architecture

```text
src/
├── core/
│   ├── config.ts              # .env -> AppConfig (validated with zod)
│   ├── logger.ts              # minimal logger (stderr)
│   ├── types/                 # B2BLead, IScraper, ILeadExporter (contracts)
│   ├── driver/
│   │   ├── http.driver.ts     # got + rate-limit + proxies + retry (HTML directories)
│   │   └── browser.driver.ts  # Playwright/Chromium + proxies + concurrency
│   ├── network/
│   │   ├── proxy-manager.ts   # Round-Robin rotation
│   │   ├── rate-limiter.ts    # sliding window (p-queue)
│   │   └── retry.ts           # exponential backoff + jitter (p-retry)
│   ├── pipeline/
│   │   ├── phone-normalizer.ts # E.164 via libphonenumber-js
│   │   ├── city-normalizer.ts  # "Dla"/"DOUALA" -> "Douala"
│   │   ├── deduplicator.ts     # name+city, phone, website domain
│   │   └── pipeline.ts         # validate -> normalize -> deduplicate (streaming)
│   ├── pipeline/merge.ts       # applyPatch: merges enricher patches
│   └── exporters/             # JSON / CSV (;+BOM) / Excel (2 tabs), streaming
├── scrapers/
│   └── google-maps/
│       ├── gmaps.scraper.ts   # Playwright strategy (scroll + place sheets)
│       └── gmaps.parser.ts    # raw DOM -> RawLead (pure, tested)
├── enrichers/
│   ├── website.enricher.ts   # emails, phones, socials, legal name, contacts
│   ├── email-verifier.ts     # MX + SMTP handshake + catch-all
│   ├── reviews.enricher.ts   # GMaps reviews -> summary/sentiment (Claude API)
│   ├── review-summary.ts     # Anthropic API call + parsing (pure, tested)
│   ├── extract.ts            # HTML parsing -> emails/phones/socials/contacts (pure, tested)
│   └── chain.ts              # multi-site detection (pure, tested)
├── engine.ts                  # orchestrator: scraper -> pipeline -> enrich -> export
├── index.ts                   # public SDK surface
└── cli.ts                     # Commander
```

**Patterns**: `Strategy` for scrapers (`IScraper`) and enrichers (`IEnricher`),
`Decorator` for network in the driver (transparent rate-limit / proxy / retry),
`Repository/Exporter` for output (`ILeadExporter`).

### Adding a source

1. `src/scrapers/<source>/<source>.scraper.ts` implementing `IScraper` (async generator of `RawLead`).
2. A pure parser next to it (`<source>.parser.ts`): that is the one we test.
3. Wire it in `ScraperEngine.buildScraper`.

Nothing else to touch: validation, normalization, dedup and export are shared.

### Adding an enricher

1. `src/enrichers/<name>.enricher.ts` implementing `IEnricher` (`supports` + `enrich` -> `LeadPatch`).
   `enrich` must **never** throw: return `{}` and log in case of failure.
2. Declare it in `ENRICHER_NAMES` + `createEnricher` (`src/enrichers/index.ts`).
3. Extend `LeadPatch` / the `B2BLead` schema if new fields are produced.

`applyPatch` merges the result without overwriting values that are already present.

## Configuration (`.env`)

See [`.env.example`](./.env.example). Key points:

- `RATE_MAX_REQUESTS` / `RATE_INTERVAL_MS`: network politeness (default 5 req/s).
- `BROWSER_CONCURRENCY`: parallel Playwright pages (default 1).
- `PROXIES`: comma-separated list of `http://user:pass@host:port` entries (auto rotation).
- `HEADLESS=false`: useful for debugging Google Maps selectors.
- `SMTP_CHECK=false`: if outbound port 25 is blocked (emails then become `unknown`).
- `ANTHROPIC_API_KEY`: enables review summary/sentiment.

## Tests

```bash
yarn test        # vitest: 38 tests on the pure modules
yarn typecheck
```

## Known limitations

- **Google Maps selectors**: prone to breaking when Google changes its DOM.
  The establishment `category` is not always captured: name / city / address /
  phone / website / rating are reliable.
- **Decision-maker contacts**: the `website` enricher spots them by heuristic
  ("Name / Director" on team/contact pages): good recall on large hotels, low
  recall on small sites. No LinkedIn scraping (ToS + auth required).
- **Email verification**: ~85-90% reliability; some servers reject the probing
  (-> `unknown`) or accept everything (`risky` / catch-all).
- Firmographics (revenue, headcount), NAICS/SIC, web traffic: **not available**
  without a paid third-party database: `legalName` / `employeeRange` fields exist
  but are not populated.
- No captcha solving: record skipped with a warning. Lower
  `RATE_MAX_REQUESTS` and/or use residential proxies.
