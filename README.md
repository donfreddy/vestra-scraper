# Vestra

**Vestra** — module interne d'extraction et d'enrichissement de **leads B2B** (Google Maps,
annuaires) en **Node.js / TypeScript**, sans dépendre d'une API tierce payante. Conçu pour
être réutilisé dans d'autres projets (SDK) ou lancé en ligne de commande (CLI `vestra`).

Issu du cadrage décrit dans [`gemini.md`](./gemini.md). Périmètre actuel :

- **Collecte** : scraper Google Maps (Playwright) + pipeline (validation, téléphone E.164,
  villes, dédoublonnage) + exporters JSON / CSV / Excel + CLI.
- **Enrichissement** (option `--enrich`) : site web (e-mails, téléphones, réseaux sociaux,
  raison sociale, contacts décideurs), vérification d'e-mail (MX + SMTP), avis Google
  (résumé + sentiment via l'API Claude), détection de chaîne.

Pas encore fait (interfaces prêtes) : captcha-solving, persistance PostgreSQL/Prisma,
firmographie (CA / effectif), trafic web.

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
vestra extract -q "Hôtel" -l "Kribi, Cameroun" -n 50 -f csv -o ./out/kribi.csv
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
| `-e, --enrich` | `website`, `email`, `reviews` (virgule) ou `all` | *(aucun)* |
| `--log-level` | `debug` \| `info` \| `warn` \| `error` \| `silent` | `info` |

> Google plafonne une recherche à ~120 résultats par zone. Pour couvrir une grande
> ville, lancer plusieurs requêtes ciblées (quartiers, communes) vers le même fichier :
> le pipeline dédoublonne automatiquement.

### Enrichissement

```bash
vestra extract -q "Hôtel" -l "Douala, Cameroun" --enrich website,email -o ./out/douala.xlsx
vestra extract -q "Hôtel" -l "Kribi, Cameroun"  --enrich all           -o ./out/kribi.xlsx
```

| Enricher | Source | Ajoute | Dépendance |
| --- | --- | --- | --- |
| `website` | site web du lead (HTTP) | `emails`, `phones`, `socials` (LinkedIn/FB/IG/WhatsApp), `legalName`, `contacts` décideurs (heuristique) | — |
| `email` | MX + handshake SMTP | `emailStatus` (`valid`/`invalid`/`risky`/`unknown`), `emailCatchAll` | port 25 sortant ouvert (sinon `unknown`) |
| `reviews` | avis Google Maps (Playwright) | `reviews.summary`, `reviews.sentiment`, `reviews.highlights` | `ANTHROPIC_API_KEY` (sinon extraits bruts) |

La détection de **chaîne** (`chain.isChain` / `chain.name`) tourne automatiquement dès
qu'un enricher est actif : enseignes connues + même marque repérée dans ≥ 2 villes.

> Avec `--enrich`, les résultats sont d'abord tous collectés puis enrichis (pas de
> streaming) : prévois plus de temps sur les gros volumes.

## Utilisation — SDK

```ts
import { ScraperEngine } from 'vestra';

const engine = new ScraperEngine({ logLevel: 'info' });
const { leads, stats, export: out } = await engine.run({
  query: 'Hôtel',
  location: 'Douala, Cameroun',
  output: './out/douala.xlsx',
  limit: 100,
  enrich: 'website,email', // optionnel
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
│   ├── pipeline/merge.ts       # applyPatch : fusion des patchs d'enrichers
│   └── exporters/             # JSON / CSV (;+BOM) / Excel (2 onglets), en streaming
├── scrapers/
│   └── google-maps/
│       ├── gmaps.scraper.ts   # stratégie Playwright (scroll + fiches)
│       └── gmaps.parser.ts    # DOM brut → RawLead (pur, testé)
├── enrichers/
│   ├── website.enricher.ts   # e-mails, tél, socials, raison sociale, contacts
│   ├── email-verifier.ts     # MX + handshake SMTP + catch-all
│   ├── reviews.enricher.ts   # avis GMaps → résumé/sentiment (API Claude)
│   ├── review-summary.ts     # appel API Anthropic + parsing (pur, testé)
│   ├── extract.ts            # parsing HTML → e-mails/tél/socials/contacts (pur, testé)
│   └── chain.ts              # détection multi-sites (pur, testé)
├── engine.ts                  # orchestrateur : scraper → pipeline → enrich → exporter
├── index.ts                   # surface publique du SDK
└── cli.ts                     # Commander
```

**Patterns** : `Strategy` pour les scrapers (`IScraper`) et les enrichers (`IEnricher`),
`Decorator` réseau dans le driver (rate-limit / proxy / retry transparents),
`Repository/Exporter` pour la sortie (`ILeadExporter`).

### Ajouter une source

1. `src/scrapers/<source>/<source>.scraper.ts` implémentant `IScraper` (générateur async de `RawLead`).
2. Un parser pur à côté (`<source>.parser.ts`) — c'est lui qu'on teste.
3. Le brancher dans `ScraperEngine.buildScraper`.

Rien d'autre à toucher : validation, normalisation, dédup et export sont mutualisés.

### Ajouter un enricher

1. `src/enrichers/<nom>.enricher.ts` implémentant `IEnricher` (`supports` + `enrich` → `LeadPatch`).
   `enrich` ne doit **jamais** lever : renvoyer `{}` et logger en cas d'échec.
2. Le déclarer dans `ENRICHER_NAMES` + `createEnricher` (`src/enrichers/index.ts`).
3. Étendre `LeadPatch` / le schéma `B2BLead` si de nouveaux champs sont produits.

`applyPatch` fusionne le résultat sans écraser les valeurs déjà présentes.

## Configuration (`.env`)

Voir [`.env.example`](./.env.example). Points clés :

- `RATE_MAX_REQUESTS` / `RATE_INTERVAL_MS` — politesse réseau (défaut 5 req/s).
- `BROWSER_CONCURRENCY` — pages Playwright en parallèle (défaut 1).
- `PROXIES` — liste `http://user:pass@host:port` séparée par des virgules (rotation auto).
- `HEADLESS=false` — utile pour déboguer les sélecteurs Google Maps.
- `SMTP_CHECK=false` — si le port 25 sortant est bloqué (e-mails alors en `unknown`).
- `ANTHROPIC_API_KEY` — active le résumé/sentiment des avis.

## Tests

```bash
yarn test        # vitest — 38 tests sur les modules purs
yarn typecheck
```

## Limites connues

- **Sélecteurs Google Maps** : susceptibles de casser quand Google modifie son DOM.
  La `catégorie` d'établissement n'est pas toujours captée — nom / ville / adresse /
  téléphone / site / note sont fiables.
- **Contacts décideurs** : l'enricher `website` les repère par heuristique (« Nom —
  Directeur » sur les pages équipe/contact) — bon rappel sur les grands hôtels, faible
  sur les petits sites. Pas de scraping LinkedIn (CGU + auth requise).
- **Vérif e-mail** : ~85–90 % de fiabilité ; certains serveurs rejettent le probing
  (→ `unknown`) ou acceptent tout (`risky` / catch-all).
- Firmographie (CA, effectif), NAICS/SIC, trafic web : **non disponibles** sans base
  tierce payante — champs `legalName` / `employeeRange` présents mais non alimentés.
- Pas de résolution de captcha : fiche ignorée avec un warning. Réduire
  `RATE_MAX_REQUESTS` et/ou utiliser des proxies résidentiels.
