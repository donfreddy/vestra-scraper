# @meragix/b2b-scraper

Module interne d'extraction de **leads B2B** (Google Maps, annuaires) en **Node.js / TypeScript**,
sans dépendre d'une API tierce payante. Conçu pour être réutilisé dans d'autres projets
(SDK) ou lancé en ligne de commande (CLI).

Issu du cadrage décrit dans [`gemini.md`](./gemini.md) — périmètre de ce premier build :
**cœur robuste** (scraper Google Maps + pipeline + exporters + CLI). Le captcha-solving et
la persistance PostgreSQL/Prisma ne sont pas encore implémentés mais l'architecture les prévoit.

## Installation

```bash
corepack enable
yarn install
yarn playwright install chromium   # navigateur headless (lancé aussi en postinstall)
cp .env.example .env               # ajuster si besoin
```

Node ≥ 20 requis.

## Utilisation — CLI

```bash
# Développement (TypeScript direct)
yarn cli extract -q "Hôtel" -l "Douala, Cameroun" -o ./out/hotels_douala.xlsx

# Après build / lien global
yarn build && npm link
b2b-scraper extract -q "Hôtel" -l "Kribi, Cameroun" -n 50 -f csv -o ./out/kribi.csv
```

| Option | Description | Défaut |
| --- | --- | --- |
| `-q, --query` | Terme métier (`"Hôtel"`, `"Clinique"`…) | *requis* |
| `-l, --location` | Zone cible (`"Douala, Cameroun"`) | *requis* |
| `-s, --source` | `gmaps` \| `google-maps` | `gmaps` |
| `-o, --output` | Fichier de sortie — le format vient de l'extension | `./out/leads.xlsx` |
| `-f, --format` | Force `excel` \| `csv` \| `json` | *(déduit)* |
| `-c, --country` | Pays ISO-2 pour normaliser les téléphones | `CM` |
| `-n, --limit` | Nombre max de fiches (`0` = illimité) | `0` |
| `--log-level` | `debug` \| `info` \| `warn` \| `error` \| `silent` | `info` |

> Google plafonne une recherche à ~120 résultats par zone. Pour couvrir une grande
> ville, lancer plusieurs requêtes ciblées (quartiers, communes) vers le même fichier :
> le pipeline dédoublonne automatiquement.

## Utilisation — SDK

```ts
import { ScraperEngine } from '@meragix/b2b-scraper';

const engine = new ScraperEngine({ logLevel: 'info' });
const { leads, stats, export: out } = await engine.run({
  query: 'Hôtel',
  location: 'Douala, Cameroun',
  output: './out/douala.xlsx',
  limit: 100,
});

console.log(`${stats.accepted} leads → ${out.location}`);
```

Les briques sont aussi exportées individuellement : `normalizePhone`, `normalizeCity`,
`Deduplicator`, `LeadPipeline`, `HttpDriver`, `BrowserDriver`, `createExporter`, etc.

## Architecture

```text
src/
├── core/
│   ├── config.ts              # .env → AppConfig (validé par zod)
│   ├── logger.ts              # logger minimal (stderr)
│   ├── types/                 # B2BLead, IScraper, ILeadExporter (contrats)
│   ├── driver/
│   │   ├── http.driver.ts     # got + rate-limit + proxies + retry (annuaires HTML)
│   │   └── browser.driver.ts  # Playwright/Chromium + proxies + concurrence
│   ├── network/
│   │   ├── proxy-manager.ts   # rotation Round-Robin
│   │   ├── rate-limiter.ts    # fenêtre glissante (p-queue)
│   │   └── retry.ts           # backoff exponentiel + jitter (p-retry)
│   ├── pipeline/
│   │   ├── phone-normalizer.ts # E.164 via libphonenumber-js
│   │   ├── city-normalizer.ts  # "Dla"/"DOUALA" → "Douala"
│   │   ├── deduplicator.ts     # nom+ville, téléphone, domaine web
│   │   └── pipeline.ts         # valide → normalise → dédoublonne (streaming)
│   └── exporters/             # JSON / CSV (;+BOM) / Excel (2 onglets), en streaming
├── scrapers/
│   └── google-maps/
│       ├── gmaps.scraper.ts   # stratégie Playwright (scroll + fiches)
│       └── gmaps.parser.ts    # DOM brut → RawLead (pur, testé)
├── engine.ts                  # orchestrateur : driver → scraper → pipeline → exporter
├── index.ts                   # surface publique du SDK
└── cli.ts                     # Commander
```

**Patterns** : `Strategy` pour les scrapers (`IScraper`), `Decorator` réseau dans le
driver (rate-limit / proxy / retry transparents pour le scraper), `Repository/Exporter`
pour la sortie (`ILeadExporter`).

### Ajouter une source

1. `src/scrapers/<source>/<source>.scraper.ts` implémentant `IScraper` (générateur async de `RawLead`).
2. Un parser pur à côté (`<source>.parser.ts`) — c'est lui qu'on teste.
3. Le brancher dans `ScraperEngine.buildScraper`.

Rien d'autre à toucher : validation, normalisation, dédup et export sont mutualisés.

## Configuration (`.env`)

Voir [`.env.example`](./.env.example). Points clés :

- `RATE_MAX_REQUESTS` / `RATE_INTERVAL_MS` — politesse réseau (défaut 5 req/s).
- `BROWSER_CONCURRENCY` — pages Playwright en parallèle (défaut 1).
- `PROXIES` — liste `http://user:pass@host:port` séparée par des virgules (rotation auto).
- `HEADLESS=false` — utile pour déboguer les sélecteurs Google Maps.

## Tests

```bash
yarn test        # vitest (modules purs : normalizers, dedup, parser, pipeline, exporters)
yarn typecheck
```

## Limites connues

- **Sélecteurs Google Maps** : susceptibles de casser quand Google modifie son DOM.
  La `catégorie` d'établissement n'est pas toujours captée (selectors instables) —
  nom / ville / adresse / téléphone / site / note sont fiables.
- **Contacts nominatifs (directeur / GM)** : non collectés automatiquement pour l'instant
  (le modèle `LeadContact` et les colonnes Excel « Décideurs » sont prêts pour un futur
  enrichissement LinkedIn / Hunter-like).
- Pas de résolution de captcha : si Google sert un captcha, la fiche est ignorée avec un
  warning. Réduire `RATE_MAX_REQUESTS` et/ou utiliser des proxies résidentiels.
