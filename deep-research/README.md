# hotel-deep-research

Outil **séparé** de vestra. Il ne scrappe pas : il prend une **liste de noms d'hôtels**,
lance une **recherche web d'investigation via Gemini** (avec Google Search) pour retrouver
ce que le scraping ne donne pas — **propriétaire / promoteur, direction, quartier, BP,
géolocalisation, email** — puis pousse le tout dans **Notion** (une base, filtrable par ville).

> ⚠️ Les champs *propriétaire* et *direction* sont les plus sujets à hallucination. Chaque
> ligne porte une **confiance gouvernance** (0–1) et un **statut** (`Auto` / `À vérifier`).
> Traite « À vérifier » comme des pistes, pas comme des faits — un appel téléphonique
> reste nécessaire pour les petits établissements.

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

Après avoir créé l'intégration Notion : ouvre ta base → menu `•••` → **Connections** →
ajoute l'intégration (sinon l'API renvoie 404).

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

## Durée / quota

~1 requête Gemini par hôtel + pause `REQUEST_INTERVAL_MS` (défaut 4,5 s, sous la limite
free tier). ~100 hôtels ≈ 8–10 min. `discover` consomme 1 requête par ville.

## Limites

- **Gouvernance non publique** : pour un hôtel de quartier sans presse ni site, `owner`
  et `management` seront `null` → statut `À vérifier`.
- **Gemini ne combine pas** Google Search et sortie JSON stricte : on demande le JSON
  dans le texte et on le parse défensivement (Zod). Rare cas de réponse non parsable →
  l'hôtel est compté en échec et repris au prochain run.
- Le `Slug` déduplique par ville : deux hôtels réellement homonymes dans la même ville
  se collent — arrive quasi jamais, renomme l'un dans la liste d'entrée si besoin.
