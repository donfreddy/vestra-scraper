# hotel-deep-research

Outil **séparé** de vestra. Il ne scrappe pas : il prend une **liste de noms d'hôtels**,
fait une **recherche web** (DuckDuckGo, gratuite) puis demande à **Gemini** d'en extraire
ce que le scraping ne donne pas — **propriétaire / promoteur, direction, quartier, BP,
géolocalisation, email, site web** — et pousse le tout dans **Notion** (une base,
filtrable par ville).

> ⚠️ Les champs *propriétaire* et *direction* sont les plus sujets à hallucination. Le
> prompt interdit à Gemini de compléter avec ses connaissances générales — il doit se
> baser uniquement sur les pages trouvées. Chaque ligne porte quand même une **confiance
> gouvernance** (0–1) et un **statut** (`Auto` / `À vérifier`). Traite « À vérifier »
> comme des pistes, pas comme des faits.

## Comment ça marche (par défaut, 100 % gratuit)

```text
nom d'hôtel → recherche DuckDuckGo → extraits + pages → Gemini (JSON structuré) → Notion
```

Pas de clé de recherche, pas de facturation Google : DuckDuckGo est interrogé directement
(point d'entrée HTML public), et le contexte trouvé est injecté dans le prompt Gemini —
qui répond en JSON strict (`responseSchema`) au lieu de deviner de mémoire.

## Installation

```bash
cd deep-research
corepack enable
yarn install
cp .env.example .env      # puis remplir les clés
```

Node ≥ 20. Projet **indépendant** de vestra : son propre `yarn.lock` / `node_modules`,
lancé séparément.

## Clés requises (`.env`)

| Variable | Où l'obtenir | Payant ? |
| --- | --- | --- |
| `GEMINI_API_KEY` | [aistudio.google.com](https://aistudio.google.com) → *Get API key* | Non (free tier : 15 req/min, 1500/j) |
| `NOTION_API_KEY` | [notion.so/my-integrations](https://www.notion.so/my-integrations) → *New integration* | Non |
| `NOTION_DATABASE_ID` | 32 caractères dans l'URL de la base, entre le dernier `/` et le `?` | — |

Aucune clé n'est requise pour la recherche web (DuckDuckGo). Après avoir créé
l'intégration Notion : ouvre ta base → menu `•••` → **Connections** → ajoute
l'intégration (sinon l'API renvoie 404).

## Schéma de la base Notion (à créer, casse exacte)

| Propriété | Type |
| --- | --- |
| `Nom de l'Hôtel` | Title |
| `Ville` | Select |
| `Catégorie` | Text |
| `Téléphone` | Phone |
| `Propriétaire / Promoteur` | Text |
| `Direction / Gouvernance` | Text |
| `Confiance gouvernance` | Number |
| `Quartier` | Text |
| `Géolocalisation` | Text |
| `Adresse / BP` | Text |
| `Email / Contact` | Email |
| `Site web` | URL |
| `Sources` | Text |
| `Statut` | Select |
| `Slug` | Text |

`research enrich --notion` vérifie ce schéma au démarrage et refuse si une propriété manque.

## Utilisation

### 1. (Optionnel) Générer la liste des hôtels par ville

```bash
yarn cli discover -c "Douala:Cameroun" -c "Yaoundé:Cameroun" -c "Abidjan:Côte d'Ivoire" -o hotels.json
```

> Pour une liste vraiment exhaustive, **`vestra extract`** (scraping Google Maps) reste
> plus fiable que `discover` — utilise `discover` comme point de départ à relire, pas
> comme source de vérité.

Ou pars du fichier envoyé par ton boss, au format [`hotels.example.json`](./hotels.example.json) :

```json
{ "Douala": { "country": "Cameroun", "hotels": ["Akwa Palace", "..."] } }
```

### 2. Enrichir + pousser vers Notion

```bash
# essai à blanc, 3 hôtels, sans toucher Notion
yarn cli enrich -i hotels.json --limit 3

# run complet vers Notion
yarn cli enrich -i hotels.json --notion
```

| Option | Rôle |
| --- | --- |
| `-i, --input` | fichier de liste (requis) |
| `-o, --output` | sauvegarde locale JSON (défaut `./out/hotels.json`) |
| `--notion` | pousser aussi dans Notion (sinon local seulement) |
| `--force` | ré-enrichir même ce qui est déjà en sauvegarde |
| `--limit <n>` | ne traiter que les n premiers |

**Reprise sur crash** : chaque hôtel est écrit dans `out/hotels.json` immédiatement.
Relance la même commande → les hôtels déjà faits sont sautés. `--force` pour tout refaire.

**Idempotence Notion** : chaque hôtel a un `Slug` déterministe (`ville-nomcanonique`).
`enrich --notion` fait un *upsert* (query par Slug → update ou create), donc relancer ne
crée pas de doublons.

## `SEARCH_PROVIDER` (`.env`)

| Valeur | Coût | Comment |
| --- | --- | --- |
| `duckduckgo` (défaut) | **Gratuit** | Recherche DuckDuckGo + pages → contexte → Gemini structuré |
| `google` | ~35 $/1000 requêtes | Google Search grounding natif de Gemini — sources potentiellement plus complètes, mais quasi jamais couvert par le tier gratuit |
| `none` | Gratuit | Aucune recherche — Gemini répond seul. Fallback de secours : tout est marqué `À vérifier`, confiance plafonnée. |

`SEARCH_MAX_RESULTS` (défaut 6) et `SEARCH_FETCH_PAGES` (défaut 2) réglent la profondeur
de la recherche DuckDuckGo par hôtel.

Quelle que soit l'option, **si aucune source n'est trouvée pour un hôtel donné**, son
statut passe automatiquement en `À vérifier` (pas de confiance sans preuve).

## Durée / quota

~1 recherche DuckDuckGo + 1 requête Gemini par hôtel, + pause `REQUEST_INTERVAL_MS`
(défaut 4,5 s, sous la limite free tier Gemini de 15 req/min). ~100 hôtels ≈ 10–15 min.

## Limites

- **Couverture DuckDuckGo** : moins exhaustif que l'index Google sur certaines sources
  locales africaines. Pour les gros volumes où la qualité prime, `SEARCH_PROVIDER=google`
  (payant) reste l'option la plus complète.
- **Gouvernance non publique** : pour un hôtel de quartier sans presse ni site, `owner`
  et `management` resteront `null` → statut `À vérifier`. C'est le comportement voulu :
  mieux vaut `null` qu'un nom inventé.
- Le `Slug` déduplique par ville : deux hôtels réellement homonymes dans la même ville
  se collent — arrive quasi jamais, renomme l'un dans la liste d'entrée si besoin.
- DuckDuckGo peut throttle en cas de gros volume — le code retente 2 fois puis dégrade
  en contexte vide (l'hôtel est quand même traité, juste sans web).
