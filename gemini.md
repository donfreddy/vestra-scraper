 Gemini
Bon, Gemini, il faut qu'on discute. En fait, je viens d'avoir un client là, vu que je suis en freelance et je viens d'avoir un client là. Je vais travailler sur son projet de SaaS de gestion des hôtels. Maintenant, ce qui se passe c'est que pour commencer, il m'a donné une première mission. La mission, c'est de pouvoir via le scraping, lister la liste des hôtels, des contacts, soit des directeurs, soit de l'hôtel et les différentes villes (Afrique mais Cameroun pour commencer) dans un fichier de lui envoyer. Dis-moi, on procède comment ? Par quoi il faut commencer ? Que ce soit sur Google Maps, LinkedIn et autres, tu me suggères quoi ?

Pour aborder ce projet avec la rigueur d'un Architecte Logiciel Senior, il faut séparer la stratégie d'acquisition de données de l'implémentation technique.

C'est un besoin classique de Lead Generation B2B / Cold Scraping. Tu dois poser le bon cadrage technique avec ton client, puis structurer le pipeline.
1. Questions de cadrage (À clarifier avec ton client)

Avant d'écrire un script Python avec Playwright, pose ces questions au client pour valider le périmètre :

    Profondeur des données : Quel est le niveau de précision requis pour les contacts ? (Ex: Téléphone standard de l'hôtel vs Email direct du Directeur / GM). Rappel : Trouver le contact nominatif d'un directeur via scraping direct sans enrichissement tierce partie est très difficile.

    Structure de livrable : Quel format exact attend-il ? (CSV, JSON, Google Sheet structuré avec dédoublonnage) ?

    Scale initial & récurrence : S'agit-il d'un extract ponctuel (one-shot de ~500 hôtels au Cameroun) ou d'un pipeline automatisé à faire tourner tous les mois sur toute l'Afrique ?

2. Architecture Globale du Pipeline (3 Étapes)

Ne cherche pas à tout scraper sur une seule plateforme. La meilleure approche est un Pipeline ETL (Extract - Transform - Enrich) à 3 niveaux :  
Thunderbit

[ Étape 1: EXTRACTION ] ──► [ Étape 2: PARSING & CLEANING ] ──► [ Étape 3: ENRICHISSEMENT ]
 Google Maps / Annuaires        Normalize Phones/Villes/Names        LinkedIn / Hunter.io / Dropcontact
 (Nom, Ville, Tel, Site web)                                         (Nom du GM, Email Pro nominatif)

Étape 1 : Scraping Google Maps & Annuaire Local (La Source Primaire)

    Cibles : Google Maps, TripAdvisor, et annuaires locaux/locaux spécialisés (ex: Jumia Travel archive, Yellow Pages Cameroun, Synergie-Hôtellerie).

    Données récupérées : Nom de l'établissement, Ville/Quartier, Téléphone standard, Site Web, Adresse physique, Note/Avis.

    Méthode : Scraping d'API non officieuses de Maps ou headless browser (Playwright / Puppeteer).

Étape 2 : Parsing, Normalisation & Déduplication

    Nettoyage des numéros de téléphone au format international (+237...).

    Extraction et parsing des domaines web (hotel-akwa-palace.com).

    Normalisation des noms de villes (ex: "Dla", "Douala", "DOUALA" -> Douala).

Étape 3 : Enrichissement LinkedIn & Contacts Directs (La Key Value)

    Si le client veut le Directeur / General Manager (GM), Google Maps ne suffit pas.

    Stratégie : À partir du domaine web ou du nom de l'hôtel, scraper/rechercher sur LinkedIn :

        Query de recherche : [Nom de l'hôtel] AND ("Directeur" OR "General Manager" OR "Gérant").

    Passer le nom + domaine sur une API d'enrichissement (Hunter.io, Dropcontact, Apollo) pour deviner l'email professionnel nominatif.

3. Stack Technique & Outillage Recommandés
Option A : Script Python Sur-Mesure (Si le client veut du custom/propriétaire)

    Scraping / Automation : Playwright (plus robuste que Selenium face aux détections bot) ou Scrapy pour le scraping HTTP massif.

    Parsing / Extraction : BeautifulSoup4 + Pydantic (pour valider le schéma de données).

    Anti-Bot & Proxies : Proxies résidentiels (BrightData, ScraperAPI) si scraping massif de Maps.

Option B : Combinaison No-Code / Hybrid (Recommandé pour un MVP rapide)

Pour livrer vite la 1ère version au client sans passer 3 jours à maintenir des sélecteurs CSS cassés :

    Google Maps Scraping : Utiliser des scrapers éprouvés comme Outscraper ou Apify (Google Maps Scraper). Ils contournent la limite de pagination de Maps (120 résultats max par zone géographique) et gèrent le découpage de la carte en grille géographique (maps splitting).  
    Octoparse+ 1

    LinkedIn Scraping : PhantomBuster ou Evaboot (via Sales Navigator).  
    Cleanlist

    Script de Glue (Python) : Un script Python léger pour consommer les données brutes, dédoublonner, catégoriser par ville/étoiles, et générer le fichier CSV/Excel propre.

4. Bilan Trade-Offs (À présenter à ton client)
Approche	Avantages	Inconvénients
100% Python Custom Script	

• Contrôle total sur la logique.

• Pas d'abonnements mensuels tierces parties.
	

• Temps de dev plus long.

• Maintenance lourde (les sélecteurs Google/LinkedIn changent souvent).

• Risque élevé de ban IP/compte.
Hybrid (Apify/Outscraper + Python Glue)	

• Résultat prêt en quelques heures.

• Contourne nativement les anti-bots et la pagination.

• Coût infrastructure dérisoire pour une 1ère liste.
	• Dépendance à des API payantes (quelques $ pour des milliers de lignes).

Bon, c'est vrai que euh je voulais pour un temps écrire un script pour garder pour moi pour des futures utilisations comme par exemple pour mes projets Tallyno , PaySkool comme tu connais. Maintenant, le souci c'est que le client attend la liste ce soir. Je veux une liste en une fois, ce n'est pas un truc qui va tourner tous les mois. Je veux une liste en une fois que je vais envoyer peut-être au client d'ici ce soir. Et le client ne veut pas forcément contacter le directeur. Si déjà, en fait, le directeur c'est un plus quoi. Avoir le contact du directeur c'est un plus mais si déjà on a le nom ville numéro de téléphone ou adresse mail, c'est déjà ça. Mais le Si en plus de ça on a on on peut avoir le l'adresse du directeur, c'est que c'est bon.

C'est parfait, le cadrage change la donne. Puisque tu as une deadline ce soir et qu'il s'agit d'un one-shot, écrire un scraper complet depuis zéro avec Playwright/Selenium te ferait perdre trop de temps à gérer la pagination de Google Maps, le découpage géographique et le bypassing d'anti-bot.

Pour livrer ce soir un fichier propre, voici la stratégie commando en 3 étapes.
1. Stratégie de Collecte Rapide (1 heure max)

Ne perds pas de temps à scrapper à la main ou à coder le scraper Maps cet après-midi. Utilise un outil d'extraction Google Maps déjà éprouvé.

    Option A : Apify (Google Maps Scraper) ou Outscraper

        Tu indiques les mots-clés : Hôtel à Douala, Hôtel à Yaoundé, Hôtel à Kribi, Hôtel à Bafoussam, etc. (ou par région du Cameroun).

        Ces outils font le découpage en grille (grid search) pour ne pas bloquer à 120 résultats par recherche.

        Données récupérées : Nom, Ville, Adresse complète, Téléphone, Site Web, Email (si présent sur le fiche Maps ou leur site web), Note, Lien Maps.

        Coût : Souvent gratuit pour le premier scraping (credits de bienvenue) ou $1-$2.

2. Le Script Python de "Glue" & Nettoyage (À garder dans tes assets)

Une fois le JSON/CSV brut extrait d'Apify/Outscraper, c'est là que ton rôle de senior intervient : tu exécutes un script Python pour nettoyer, normaliser et dédoublonner les données avant de sortir le fichier final (Excel/CSV) pour le client.

Voici la logique du script Python que tu peux exécuter en local :
Python

import re
import pandas as pd


def normalize_phone(phone: str) -> str:
    """Normalise les numéros de téléphone au format international (+237...)."""
    if pd.isna(phone):
        return ""
    # Conserve uniquement les chiffres
    digits = re.sub(r"\D", "", str(phone))
    if digits.startswith("237") and len(digits) == 11:
        return f"+{digits}"
    elif len(digits) == 9:
        return f"+237{digits}"
    return phone


def process_hotel_data(input_file: str, output_file: str):
    # 1. Chargement des données brutes
    df = pd.read_csv(input_file)

    # 2. Dédoublonnage sur le nom + ville ou le numéro de téléphone
    df.drop_duplicates(subset=["title", "city"], keep="first", inplace=True)

    # 3. Normalisation
    if "phone" in df.columns:
        df["phone_cleaned"] = df["phone"].apply(normalize_phone)

    # 4. Sélection et reformatage des colonnes pour le client
    columns_mapping = {
        "title": "Nom de l'établissement",
        "city": "Ville",
        "address": "Adresse complète",
        "phone_cleaned": "Téléphone",
        "email": "Email Général",
        "website": "Site Web",
        "totalScore": "Note Google",
    }

    # Ne garder que les colonnes existantes
    available_cols = [c for c in columns_mapping.keys() if c in df.columns]
    df_final = df[available_cols].rename(columns=columns_mapping)

    # 5. Export Excel / CSV propre
    df_final.to_excel(output_file, index=False)
    print(f"✅ Fichier exporté avec succès : {len(df_final)} hôtels nettoyés.")


# Utilisation
# process_hotel_data("raw_google_maps.csv", "Hotels_Cameroun_Clean.xlsx")

3. Bonus "Directeur / GM" (Quick Win sans friction)

Pour offrir un bonus sans y passer la nuit :

    Affiche les hôtels qui ont un Site Web.

    Pour les 10-20 plus grands hôtels (ex: La Falaise, Akwa Palace, Mont Fébé, Hilton, Kribi Beach), fais une recherche rapide sur Google / LinkedIn :

        Recherche Google : site:[linkedin.com/in/](https://linkedin.com/in/) "Directeur" OR "General Manager" "Nom de l'Hôtel"

    Ajoute une colonne Contact Décideur (Optionnel) et Poste dans ton fichier Excel final. Si tu trouves, tant mieux ; sinon, tu laisses vide. Le client sera ravi d'avoir au moins la liste complète et nettoyée.

Plan d'Action pour cet après-midi :

    14h00 - 14h30 : Lance un scraper Apify/Outscraper sur Google Maps pour les principales villes du Cameroun (Douala, Yaoundé, Kribi, Limbe, Bafoussam, Garoua).

    14h30 - 15h15 : Récupère le CSV brut, exécute le script Python pour filtrer/nettoyer.

    15h15 - 16h00 : Fais une repasse rapide de vérification sur Excel/Google Sheets.

    Envoi au client : Tu livres un fichier propre, bien formaté et prêt à l'emploi.

Plus tard, quand tu auras du temps pour Tallyno ou Payskool, tu pourras builder un module d'extraction réutilisable en Node.js/Python avec rotation de proxies. Mais pour aujourd'hui : Done is better than perfect.
Tu veux qu'on adapte le script Python selon le format de fichier précis que te fournit Apify/Outscraper ?
Oui

Oui mais je suis de base un développeur Node.js. Comment je peux faire ça si je compte même dans tu peux ajouter le script mais même dans l'avenir développer un module pour moi-même ? Est-ce que en Node.js c'est possible ou je dois automatiquement apprendre le Python ou je dois connaître des notions en Python ?

Absolument pas, tu n'as aucunement besoin de passer à Python. Node.js est même historiquement et techniquement plus performant que Python pour ce type de tâche grâce à son architecture I/O non-bloquante (l'Event Loop) et à son écosystème asynchrone natif.

En tant que dev Node.js / TypeScript, tu as déjà exactement les bons outils sous la main pour le besoin immédiat et pour bâtir ton futur module réutilisable.
1. Pourquoi Node.js est un excellent choix ici

    Gestion de l'I/O asynchrone : Scraper plusieurs requêtes HTTP ou gérer plusieurs instances de navigateurs headless (puppeteer, playwright) en parallèle consomme beaucoup moins de mémoire en Node.js qu'en Python multi-threading.

    Partage de code avec ton stack actuel : Le code de parsing/nettoyage que tu écris aujourd'hui peut directement devenir un package npm interne réutilisable pour tes projets (Tallyno, Payskool, etc.).

    Typage fort : En TypeScript, avec une lib comme Zod (ou Zema que tu as conçue), tu peux valider strictement le schéma de sortie de tes données d'hôtels.

2. Solution pour ce soir (Node.js / TypeScript)

Si tu récupères un fichier exporté (JSON ou CSV) depuis Apify / Outscraper, voici le script Node.js équivalent pour parser, nettoyer, normaliser les numéros du Cameroun (+237) et générer un fichier JSON / Excel propre pour ton client.
Installation des dépendances légères :
Bash

npm install csv-parser exceljs

Script de nettoyage Node.js :
TypeScript

import fs from 'fs';
import csvParser from 'csv-parser';
import ExcelJS from 'exceljs';

interface RawHotel {
  title?: string;
  city?: string;
  address?: string;
  phone?: string;
  email?: string;
  website?: string;
  totalScore?: string | number;
}

interface CleanHotel {
  "Nom de l'établissement": string;
  "Ville": string;
  "Adresse complète": string;
  "Téléphone": string;
  "Email Général": string;
  "Site Web": string;
  "Note Google": string | number;
}

/**
 * Normalise un numéro de téléphone au format international (+237...).
 */
function normalizeCameroonPhone(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  
  if (digits.startsWith('237') && digits.length === 11) {
    return `+${digits}`;
  } else if (digits.length === 9) {
    return `+237${digits}`;
  }
  return phone;
}

async function processHotels(inputCsvPath: string, outputExcelPath: string) {
  const rawResults: RawHotel[] = [];

  // 1. Lecture du CSV
  fs.createReadStream(inputCsvPath)
    .pipe(csvParser())
    .on('data', (data: RawHotel) => rawResults.push(data))
    .on('end', async () => {
      // 2. Dédoublonnage sur Nom + Ville
      const seen = new Set<string>();
      const cleanData: CleanHotel[] = [];

      for (const row of rawResults) {
        const name = row.title?.trim() || '';
        const city = row.city?.trim() || '';
        const key = `${name.toLowerCase()}_${city.toLowerCase()}`;

        if (!name || seen.has(key)) continue;
        seen.add(key);

        cleanData.push({
          "Nom de l'établissement": name,
          "Ville": city,
          "Adresse complète": row.address || '',
          "Téléphone": normalizeCameroonPhone(row.phone),
          "Email Général": row.email || '',
          "Site Web": row.website || '',
          "Note Google": row.totalScore || 'N/A',
        });
      }

      // 3. Export Excel via ExcelJS
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('Hôtels Cameroun');

      if (cleanData.length > 0) {
        worksheet.columns = Object.keys(cleanData[0]).map((key) => ({
          header: key,
          key: key,
          width: 25,
        }));

        cleanData.forEach((item) => worksheet.addRow(item));
      }

      await workbook.xlsx.writeFile(outputExcelPath);
      console.log(`✅ Fichier généré avec succès : ${cleanData.length} hôtels exportés.`);
    });
}

// Utilisation :
// processHotels('apify_export_raw.csv', 'Hotels_Cameroun_Clean.xlsx');

3. Vision Long Terme : Concevoir ton module de Scraping en Node.js

Pour tes futurs projets SaaS, tu pourras structurer ton propre module d'acquisition. Voici la stack recommandée en écosystème JS/TS :

    Automation / Headless : Playwright Node (@playwright/test ou playwright-core).

        Avantage vs Python : L'API Playwright en Node.js est la version native développée par Microsoft. Elle bénéficie du meilleur support async/await et d'un support WebSocket ultra rapide.

    Scraping HTTP / Parsing HTML : Got / Axios + Cheerio.

        Pour les sites statiques ou les API privées de Maps/LinkedIn, faire des requêtes directes avec Cheerio pour parser le DOM est 100x plus rapide qu'un vrai navigateur headless.

    Queue & Workers : BullMQ + Redis.

        Quand tu voudras distribuer le scraping de 10 000 adresses sur Tallyno ou Payskool, tu utiliseras une file d'attente BullMQ pour exécuter tes jobs de scraping en tâche de fond sans bloquer tes API NestJS/Node.

Résumé des arbitrages
Langage	Pourquoi choisir	Verdict pour toi
Python	Écosystème très connu en Data/ML (Pandas, Scrapy).	Inutile dans ton cas. Ajouter une dépendance Python complexifierait ton workflow sans réel gain.
Node.js / TS	Moteur V8 rapide, asynchronisme natif, stack unique avec ton backend/frontend/CLI.	À privilégier. Tu exploites directement tes compétences existantes.

Comment structurer un package Node.js/TypeScript réutilisable pour le scraping d'annuaires B2B ?

Pour concevoir un module de scraping B2B réutilisable, robuste et maintenable en Node.js / TypeScript, l'erreur classique est de coupler la logique d'extraction (Scraper) à la source de données (Google Maps, YellowPages, etc.).

La clé est une architecture en couches isolées qui sépare la stratégie de collecte, le transport HTTP/Browser, le parsing, et la pipeline d'enrichissement/normalisation.
1. Architecture Globale du Package

Une structure modulaire basée sur le pattern Strategy et le pattern Pipeline :

┌─────────────────────────────────────────────────────────────┐
│                      Core Manager (CLI / SDK)               │
└──────────────────────────────┬──────────────────────────────┘
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                     ▼
┌───────────────────────┐             ┌───────────────────────┐
│   Scraper Strategies  │             │ Enrichment Pipeline   │
│ (GoogleMaps, LinkedIn)│             │ (Normalizer, Dedupe)  │
└───────────┬───────────┘             └───────────────────────┘
            │
            ▼
┌───────────────────────┐
│    Driver Abstraction │
│ (Playwright, Cheerio) │
└───────────────────────┘

2. Organisation de l'Arborescence (src/)
Plaintext

src/
├── core/
│   ├── driver/               # Abstraction du moteur d'exécution
│   │   ├── base.driver.ts
│   │   ├── playwright.driver.ts
│   │   └── cheerio.driver.ts
│   ├── pipeline/             # Nettoyage, validation et dédoublonnage
│   │   ├── deduplicator.ts
│   │   └── phone-normalizer.ts
│   └── types/                # Interfaces & types partagés
│       ├── lead.entity.ts
│       └── scraper.interface.ts
├── scrapers/                 # Implémentation des stratégies par source
│   ├── google-maps/
│   │   ├── gmaps.scraper.ts
│   │   └── gmaps.parser.ts
│   └── yellow-pages/
│       └── yellowpages.scraper.ts
├── index.ts                  # Export public du SDK
└── cli.ts                    # Point d'entrée CLI éventuel

3. Les Interfaces Clés (Contrats TypeScript)
A. Entité de donnée unifiée (Lead)

Quelle que soit la source (Google Maps, LinkedIn, Annuaires local), la sortie doit être standardisée via un modèle unique.
TypeScript

// src/core/types/lead.entity.ts

export interface LeadContact {
  fullName?: string;
  role?: string;
  email?: string;
  linkedinUrl?: string;
}

export interface B2BLead {
  id: string;
  source: string; // ex: 'google-maps', 'yellowpages'
  companyName: string;
  category?: string;
  city: string;
  country: string;
  address?: string;
  phoneRaw?: string;
  phoneNormalized?: string;
  email?: string;
  websiteUrl?: string;
  contacts?: LeadContact[];
  metadata?: Record<string, unknown>;
  createdAt: Date;
}

B. Interface Stratégie de Scraping

Chaque nouvelle source implémente cette interface contractuelle.
TypeScript

// src/core/types/scraper.interface.ts
import { B2BLead } from './lead.entity';

export interface ScraperQuery {
  query: string;       # ex: "Hôtel"
  location: string;    # ex: "Douala, Cameroun"
  limit?: number;
}

export interface IScraper {
  readonly name: string;
  execute(query: ScraperQuery): AsyncIterable<B2BLead>; // Utilisation d'AsyncIterable pour du streaming de données
}

4. Implementation d'un Scraper Exemple (Google Maps Strategy)

Grâce à AsyncIterable, tu peux traiter/streamer les résultats au fur et à mesure sans tout charger en mémoire.
TypeScript

// src/scrapers/google-maps/gmaps.scraper.ts
import { IScraper, ScraperQuery } from '../../core/types/scraper.interface';
import { B2BLead } from '../../core/types/lead.entity';
import { PhoneNormalizer } from '../../core/pipeline/phone-normalizer';

export class GoogleMapsScraper implements IScraper {
  readonly name = 'google-maps';

  async *execute(query: ScraperQuery): AsyncIterable<B2BLead> {
    // 1. Initialisation du Driver (ex: Playwright ou API interne)
    // 2. Navigation vers la zone géographique
    
    // Exemple d'itération sur les éléments trouvés :
    const rawItems = []; // ... extraits du DOM
    
    for (const raw of rawItems) {
      const lead: B2BLead = {
        id: `gmaps_${raw.placeId}`,
        source: this.name,
        companyName: raw.title,
        city: query.location,
        country: 'CM',
        phoneRaw: raw.phone,
        phoneNormalized: PhoneNormalizer.toE164(raw.phone, 'CM'),
        websiteUrl: raw.website,
        createdAt: new Date(),
      };

      yield lead; // Stream du résultat
    }
  }
}

5. Module Pipeline : Nettoyage & Dédoublonnage

Le scraper récupère la donnée, mais le pipeline la valide et la transforme.
TypeScript

// src/core/pipeline/deduplicator.ts
import { B2BLead } from '../types/lead.entity';

export class Deduplicator {
  private seenKeys = new Set<string>();

  public isDuplicate(lead: B2BLead): boolean {
    // Clé unique basée sur le nom d'entreprise + la ville
    const normalizedName = lead.companyName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const normalizedCity = lead.city.toLowerCase().trim();
    const key = `${normalizedName}_${normalizedCity}`;

    if (this.seenKeys.has(key)) {
      return true;
    }

    this.seenKeys.add(key);
    return false;
  }
}

6. Orchestrateur / Export du SDK (Index.ts)

L'utilisateur final (tes projets Tallyno, Payskool, ou un script CLI) interagit uniquement avec le SDK principal.
TypeScript

// src/index.ts
import { IScraper, ScraperQuery } from './core/types/scraper.interface';
import { Deduplicator } from './core/pipeline/deduplicator';
import { B2BLead } from './core/types/lead.entity';

export class B2BScraperEngine {
  private deduplicator = new Deduplicator();

  constructor(private scraper: IScraper) {}

  async run(query: ScraperQuery): Promise<B2BLead[]> {
    const results: B2BLead[] = [];

    console.log(`[${this.scraper.name}] Lancement de la collecte...`);
    
    for await (const lead of this.scraper.execute(query)) {
      if (!this.deduplicator.isDuplicate(lead)) {
        results.push(lead);
      }
    }

    return results;
  }
}

// Re-export des types et scrapers
export * from './core/types/lead.entity';
export * from './scrapers/google-maps/gmaps.scraper';

7. Trade-Offs de cette Architecture
Avantage	Inconvénient
Extensibilité : Ajouter un nouvel annuaire (ex: LinkedIn, Pages Jaunes) demande juste d'implémenter IScraper sans toucher au reste.	Overhead initial : Nécessite d'écrire plus d'interfaces et de boilerplate au début qu'un script mono-fichier.
Testabilité : Tu peux facilement mocker le Driver HTTP/Playwright pour tester les parsers unitaires (Jest / Vitest).	Maintenance des sélecteurs : Si la source cible modifie son HTML, le parser de la stratégie concernée doit être mis à jour.
Polyvalence (Monorepo) : Peut être publié en tant que package privé npm (@your-org/b2b-scraper) ou utilisé dans un monorepo workspace.	

Comment intégrer un gestionnaire de proxies et de rate-limiting dans le driver du package ?

Pour intégrer la rotation de proxies et le rate-limiting sans polluer la logique de tes scrapers, il faut encapsuler ces contraintes réseau au niveau du Driver (pattern Decorator ou Middleware).

Le scraper demande une ressource HTML/JSON, et le Driver s'occupe en arrière-plan d'injecter le bon proxy, de respecter les délais (throttling) et de gérer le retry en cas de blocage (HTTP 429 / 403).
1. Architecture du Gestionnaire Réseau
Plaintext

┌──────────────────────────────────────────────────────────────────┐
│                          Scraper Strategy                        │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ execute(url)
                                  ▼
┌──────────────────────────────────────────────────────────────────┐
│                            HTTP Driver                           │
│  ┌────────────────────┐  ┌─────────────────┐  ┌───────────────┐  │
│  │ RateLimiter (p-ratelimit) │  │ ProxyRotator    │  │ Retry Engine  │  │
│  └────────────────────┘  └─────────────────┘  └───────────────┘  │
└─────────────────────────────────┬────────────────────────────────┘
                                  │ HTTP Request (avec Proxy)
                                  ▼
                            [ Target Site ]

2. Implémentation du Gestionnaire de Proxies (ProxyManager)

Un gestionnaire simple supportant deux modes : Pool de proxies statiques (liste d'IPs) ou Proxy résidentiel rotatif (BrightData, ScraperAPI, Oxylabs) qui gère la rotation via les headers/ports.
TypeScript

// src/core/network/proxy-manager.ts

export interface ProxyConfig {
  server: string; // http://ip:port
  username?: string;
  password?: string;
}

export class ProxyManager {
  private currentIndex = 0;

  constructor(private proxies: ProxyConfig[] = []) {}

  /**
   * Récupère le prochain proxy selon un algorithme Round-Robin.
   */
  public getNextProxy(): ProxyConfig | undefined {
    if (this.proxies.length === 0) return undefined;

    const proxy = this.proxies[this.currentIndex];
    this.currentIndex = (this.currentIndex + 1) % this.proxies.length;
    return proxy;
  }

  /**
   * Convertit l'objet ProxyConfig en chaîne exploitable par Axios/Got/Playwright.
   */
  public static toUrl(proxy: ProxyConfig): string {
    if (proxy.username && proxy.password) {
      const [protocol, host] = proxy.server.split('://');
      return `${protocol}://${proxy.username}:${proxy.password}@${host}`;
    }
    return proxy.server;
  }
}

3. Implémentation du Rate Limiter (RateLimiter)

Utilisation du pattern Token Bucket ou de la bibliothèque p-queue / bottleneck pour garantir qu'on ne dépasse pas X requêtes par intervalle de temps.
TypeScript

// src/core/network/rate-limiter.ts

export interface RateLimiterOptions {
  maxRequests: number; // Ex: 5 requêtes
  perMilliseconds: number; // Ex: par 1000ms (1 seconde)
}

export class RateLimiter {
  private queue: Array<() => void> = [];
  private tokens: number;
  private lastReset: number = Date.now();

  constructor(private options: RateLimiterOptions) {
    this.tokens = options.maxRequests;
  }

  /**
   * Bloque l'exécution jusqu'à ce qu'un slot soit disponible.
   */
  async acquireSlot(): Promise<void> {
    return new Promise((resolve) => {
      this.queue.push(resolve);
      this.processQueue();
    });
  }

  private processQueue() {
    const now = Date.now();
    if (now - this.lastReset > this.options.perMilliseconds) {
      this.tokens = this.options.maxRequests;
      this.lastReset = now;
    }

    while (this.tokens > 0 && this.queue.length > 0) {
      this.tokens--;
      const resolve = this.queue.shift();
      if (resolve) resolve();
    }

    if (this.queue.length > 0) {
      setTimeout(() => this.processQueue(), this.options.perMilliseconds / 2);
    }
  }
}

4. Integration dans le Driver (Exemple avec Playwright & Cheerio)

Voici comment coupler RateLimiter et ProxyManager directement dans la couche HTTP Driver :
TypeScript

// src/core/driver/http.driver.ts
import got, { Got } from 'got';
import { ProxyManager, ProxyConfig } from '../network/proxy-manager';
import { RateLimiter } from '../network/rate-limiter';

export interface DriverOptions {
  proxies?: ProxyConfig[];
  rateLimit?: { maxRequests: number; perMilliseconds: number };
  maxRetries?: number;
}

export class HttpDriver {
  private proxyManager: ProxyManager;
  private rateLimiter?: RateLimiter;
  private maxRetries: number;

  constructor(options: DriverOptions = {}) {
    this.proxyManager = new ProxyManager(options.proxies || []);
    this.maxRetries = options.maxRetries || 3;

    if (options.rateLimit) {
      this.rateLimiter = new RateLimiter(options.rateLimit);
    }
  }

  async fetchHtml(url: string, attempt = 1): Promise<string> {
    // 1. Appliquer le Rate Limiting avant l'exécution
    if (this.rateLimiter) {
      await this.rateLimiter.acquireSlot();
    }

    // 2. Sélectionner le proxy
    const proxy = this.proxyManager.getNextProxy();
    const agent = proxy ? ProxyManager.toUrl(proxy) : undefined;

    try {
      // 3. Exécuter la requête HTTP (via 'got' ou 'axios')
      const response = await got(url, {
        agent: agent ? { https: undefined /* config proxy agent */ } : undefined,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36...',
        },
        timeout: { request: 10000 },
      });

      return response.body;

    } catch (error: any) {
      // 4. Gestion automatique du Retry en cas de rate-limit (429) ou IP Banned (403)
      const isBlockError = error.response?.statusCode === 429 || error.response?.statusCode === 403;

      if (isBlockError && attempt <= this.maxRetries) {
        console.warn(`[Driver] Blocage détecté (${error.response.statusCode}). Tentative ${attempt}/${this.maxRetries} avec une nouvelle IP...`);
        
        // Petit delai exponentiel (backoff)
        await new Promise((res) => setTimeout(res, attempt * 2000));
        return this.fetchHtml(url, attempt + 1);
      }

      throw error;
    }
  }
}

5. Avantages & Inconvénients (Trade-Offs)
Avantage	Inconvénient
Transparence totale : Tes scrapers (GoogleMapsScraper, etc.) appellent simplement driver.fetchHtml(url). Ils n'ont pas conscience des proxies ni du rate-limit.	Complexité de configuration : Les proxies résidentiels nécessitent une gestion fine des sessions (sticky sessions vs IP rotative à chaque requête).
Résilience (Self-Healing) : Le driver gère nativement le retry avec un autre proxy si une IP est bannie en cours de route.	Overhead Réseau : L'usage de proxies ajoute de la latence aux requêtes HTTP/Playwright.

Montre-moi comment créer une CLI au-dessus de ce package avec Commander.js pour lancer des collectes en ligne de commande.

Créer une interface CLI (Command Line Interface) au-dessus de ton package avec Commander.js permet de le rendre autonome et exécutable directement depuis le terminal ou via des scripts CRON, sans avoir à réécrire du code Node.js à chaque besoin.

Voici comment structurer et implémenter cette CLI de manière propre et typée.
1. Installation des dépendances
Bash

npm install commander ora chalk dotenv
npm install --save-dev @types/node tsx

    commander : Le framework CLI.

    ora : Affiche des spinners animés élégants dans le terminal pendant l'extraction.

    chalk : Pour la coloration des logs dans la console (succès en vert, erreurs en rouge).

    dotenv : Charger des variables d'environnement (ex: clés d'API proxies si besoin).

2. Implémentation du fichier CLI (src/cli.ts)

Voici l'architecture de la CLI. Elle parse les arguments, initialise le scraper sélectionné, lance la collecte et exporte les données au format choisi (JSON ou Excel).
TypeScript

#!/usr/bin/env node

import { Command } from 'commander';
import ora from 'ora';
import chalk from 'chalk';
import path from 'path';
import fs from 'fs';
import { B2BScraperEngine } from './index';
import { GoogleMapsScraper } from './scrapers/google-maps/gmaps.scraper';
import { B2BLead } from './core/types/lead.entity';
import ExcelJS from 'exceljs';

const program = new Command();

program
  .name('b2b-scraper')
  .description('CLI B2B Lead Scraping & Enrichment Engine pour l\'Afrique')
  .version('1.0.0');

// Definition de la commande principale "extract"
program
  .command('extract')
  .description('Lance une session d\'extraction de prospects')
  .requiredOption('-q, --query <string>', 'Mots-clés de recherche (ex: "Hôtel", "Restaurant")')
  .requiredOption('-l, --location <string>', 'Ville ou région cible (ex: "Douala, Cameroun")')
  .option('-s, --source <string>', 'Source de collecte (gmaps, yellowpages)', 'gmaps')
  .option('-o, --output <string>', 'Chemin du fichier de sortie', './results.json')
  .option('-f, --format <string>', 'Format d\'export (json, excel)', 'excel')
  .option('--limit <number>', 'Nombre maximum de résultats à récupérer', '50')
  .action(async (options) => {
    const startTime = Date.now();
    console.log(chalk.bold.blue('\n🚀 Initialisation du Moteur de Scraping B2B\n'));

    // 1. Sélection de la stratégie de scraping
    let scraper;
    switch (options.source.toLowerCase()) {
      case 'gmaps':
      case 'google-maps':
        scraper = new GoogleMapsScraper();
        break;
      default:
        console.error(chalk.red(`❌ Source inconnue: ${options.source}`));
        process.exit(1);
    }

    // 2. Instanciation du moteur avec le scraper choisi
    const engine = new B2BScraperEngine(scraper);
    const spinner = ora(`Extraction en cours : "${options.query}" à "${options.location}"...`).start();

    try {
      // 3. Exécution de la collecte
      const leads: B2BLead[] = await engine.run({
        query: options.query,
        location: options.location,
        limit: parseInt(options.limit, 10),
      });

      spinner.succeed(chalk.green(`Collecte terminée ! ${leads.length} prospects uniques extraits.`));

      // 4. Export des résultats
      const outputPath = path.resolve(process.cwd(), options.output);
      const format = options.format.toLowerCase();

      if (format === 'excel' || outputPath.endsWith('.xlsx')) {
        await exportToExcel(leads, outputPath);
      } else {
        await exportToJson(leads, outputPath);
      }

      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(chalk.green(`\n✅ Fichier généré avec succès : ${chalk.bold(outputPath)}`));
      console.log(chalk.gray(`⏱️  Temps d'exécution : ${duration}s\n`));

    } catch (error: any) {
      spinner.fail(chalk.red('Une erreur est survenue lors de l\'extraction.'));
      console.error(chalk.red(`[Erreur] ${error.message}`));
      process.exit(1);
    }
  });

// Utilitaires d'export
async function exportToJson(data: B2BLead[], filePath: string) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

async function exportToExcel(data: B2BLead[], filePath: string) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Leads');

  sheet.columns = [
    { header: 'ID', key: 'id', width: 20 },
    { header: 'Entreprise', key: 'companyName', width: 30 },
    { header: 'Ville', key: 'city', width: 15 },
    { header: 'Téléphone Brut', key: 'phoneRaw', width: 18 },
    { header: 'Téléphone Normalisé', key: 'phoneNormalized', width: 20 },
    { header: 'Site Web', key: 'websiteUrl', width: 30 },
    { header: 'Source', key: 'source', width: 15 },
  ];

  data.forEach((lead) => sheet.addRow(lead));
  await workbook.xlsx.writeFile(filePath);
}

program.parse(process.argv);

3. Configuration du package.json

Pour exécuter la CLI sous forme de commande binaire globale ou locale, déclare le champ bin et ajoute un script d'exécution rapide dans ton package.json :
JSON

{
  "name": "@meragix/b2b-scraper",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "bin": {
    "b2b-scraper": "./dist/cli.js"
  },
  "scripts": {
    "build": "tsc",
    "cli": "tsx src/cli.ts",
    "link:local": "npm link"
  }
}

4. Exemples d'utilisation depuis le terminal
A. En mode développement (via tsx) :
Bash

npx tsx src/cli.ts extract --query "Hôtel" --location "Douala, Cameroun" --limit 30 --format excel --output ./Hotels_Douala.xlsx

B. Après compilation (npm run build) ou liaison globale (npm link) :
Bash

# Commande accessible globalement sur ta machine
b2b-scraper extract -q "École privée" -l "Yaoundé" -s gmaps -o ./Ecoles_Yaounde.xlsx

5. Avantages & Limites
Avantage	Inconvénient
Automation facile : Tu peux programmer cette CLI via des tâches CRON sur un serveur VPS.	Expérience interactive limitée : Pour les formulaires complexes multi-étapes, une CLI basée sur inquirer ou prompts est préférable.
Pas de code à écrire au quotidien : Tu réutilises directement le package compilé depuis la ligne de commande.	Dépendances système : Si tu utilises Playwright dans le scraper, les navigateurs doivent être préinstallés sur la machine exécutant la CLI (npx playwright install).

En fait, ce que tu viens de faire là, ce qu'on peut faire c'est que euh tu me donnes plutôt un bon prompt pour que je passe à Claude pour qu'il puisse initier le en fait donner la structure en fait le mettre dans le contexte pour qu'il puisse développer maintenant un module en interne pour moi en Node.js complet. Parce que je n'ai pas je n'ai pas envie de payer du scraping tout le temps. S'il peut me développer mon module à moi mais en Node.js. Et la question que je voulais te poser est-ce que en Node.js c'est vraiment performant que Python ? Il y a aussi Go, j'utilise aussi Go. Il faut aussi mettre d'ici la langue sur le langage Go peut aller aussi.
1. Node.js vs Python vs Go pour le Scraping B2B
Critère	Node.js (V8)	Python	Go (Golang)
I/O Asynchrone & Concurrence	

Excellent (Event Loop)

Gestion native du non-bloquant sur des milliers de requêtes HTTP.
	

Moyen (GIL)

Nécessite asyncio ou du multi-processing lourd.
	

Ultra Performant (Goroutines)

Empilement de milliers de threads légers avec consommation RAM minimale.
Support Playwright / Headless	

Natif & Référence

Playwright est maintenu prioritairement pour Node.js.
	

Très Bon

Wrapper Python très utilisé.
	

Limité / Tiers

Bibliothèques communautaires (rod, chromedp) moins stables.
Écosystème Scraping	cheerio, got, puppeteer, playwright, zod.	scrapy, beautifulsoup4, selenium.	colly, goquery, rod.
Vitesse d'exécution (Parsing JSON/DOM)	Très rapide (Moteur JIT V8).	Plus lent (Interprété).	Ultra rapide (Compilé).
Verdict Technique :

    Si scraping HTTP direct (APIs, HTML statique) : Go est imbattable en vitesse, mémoire et concurrence par Goroutines.

    Si scraping de Single Page Applications (SPA) nécessitant la gestion du JS/DOM (Google Maps, LinkedIn) : Node.js est le meilleur compromis. Playwright en JS/TS est l'outil le plus stable et le plus mature du marché.

    Pour ton cas : Choisir Node.js / TypeScript te permet de garder la stack unique de tes projets, tout en profitant du support natif de Playwright.

2. Le Prompt Système pour Claude 3.5 Sonnet

Copie-colle le prompt ci-dessous directement à Claude pour qu'il te génère le boilerplate complet du module :
Plaintext

Tu es un Architecte Logiciel Senior spécialisé en Node.js, TypeScript et Web Scraping avancé. 

Je souhaite développer un module/package interne réutilisable (pour mes projets SaaS) qui permet de faire de l'extraction de leads B2B (Annuaires, Google Maps, Sites Web) de manière autonome, robuste et sans dépendre d'APIs tierces payantes.

Voici les spécifications techniques et les contraintes d'architecture à respecter :

1. STACK TECHNIQUE :
   - Langage : TypeScript (Strict Mode)
   - Runtime : Node.js (ESM)
   - Automation Headless : Playwright Node (`playwright-core` ou `@playwright/test`)
   - HTTP/Parsing Rapide : `got` (ou `axios`) + `cheerio`
   - Validation & Schéma : `zod`
   - CLI : `commander`, `ora`, `chalk`
   - Export : `exceljs` et support JSON nativement

2. ARCHITECTURE TECHNIQUE ATTENDUE :
   Applique le pattern "Strategy" pour les scrapers et le pattern "Decorator/Middleware" pour le réseau.
   
   Structure des dossiers :
   - /src/core/driver : Abstraction du réseau avec gestion du Rate Limiting (Token Bucket ou p-queue), rotation de Proxies (ProxyManager), et Retry Strategy exponentielle sur erreurs HTTP (429, 403).
   - /src/core/pipeline : Dédoublonnage d'entreprises (Nom + Ville) et normalisation des numéros de téléphone (Format E.164 / Afrique - Cameroun +237).
   - /src/core/types : Modèle d'entité unique unifié `B2BLead` et interface contractuelle `IScraper`.
   - /src/scrapers/google-maps : Implémentation complète de la stratégie Google Maps utilisant Playwright (gestion du scroll, extraction du nom, ville, adresse, téléphone, site web, note).
   - /src/cli.ts : Interface CLI construite avec Commander.js permettant de lancer des commandes du type `b2b-scraper extract -q "Hôtel" -l "Douala, Cameroun" -o ./hotels.xlsx`.

3. CONTRAT DE LIVRABLE :
   Ne me donne pas de pseudo-code ou d'explications vagues. 
   Génère les fichiers TypeScript réels, typés à 100%, prêts à être insérés dans un projet. 
   Fournis également le fichier `package.json` complet avec toutes les dépendances nécessaires et la configuration `tsconfig.json`.

Ajuste le prompt pour inclure un exporter PostgreSQL via Prisma dans l'architecture.

Voici le prompt mis à jour avec la couche d'export PostgreSQL / Prisma intégrée au niveau du pipeline de stockage :
Plaintext

Tu es un Architecte Logiciel Senior spécialisé en Node.js, TypeScript et Web Scraping avancé. 

Je souhaite développer un module/package interne réutilisable (pour mes projets SaaS) qui permet de faire de l'extraction de leads B2B (Annuaires, Google Maps, Sites Web) de manière autonome, robuste et sans dépendre d'APIs tierces payantes.

Voici les spécifications techniques et les contraintes d'architecture à respecter :

1. STACK TECHNIQUE :
   - Langage : TypeScript (Strict Mode)
   - Runtime : Node.js (ESM)
   - Automation Headless : Playwright Node (`playwright-core` ou `@playwright/test`)
   - HTTP/Parsing Rapide : `got` (ou `axios`) + `cheerio`
   - ORM / Persistence : `@prisma/client` + `prisma` (PostgreSQL)
   - Validation & Schéma : `zod`
   - CLI : `commander`, `ora`, `chalk`
   - Exporters : Excel (`exceljs`), JSON et PostgreSQL via Prisma Client

2. ARCHITECTURE TECHNIQUE ATTENDUE :
   Applique le pattern "Strategy" pour les scrapers, le pattern "Decorator/Middleware" pour le réseau, et un pattern "Repository/Exporter" extensible pour la persistance des données.
   
   Structure des dossiers :
   - /prisma : Schéma `schema.prisma` définissant le modèle `Lead` (id, companyName, city, country, phoneRaw, phoneNormalized, websiteUrl, source, metadata JSON, createdAt, updatedAt) avec contrainte d'unicité composite ou d'indexation sur `[companyName, city]`.
   - /src/core/driver : Abstraction du réseau avec gestion du Rate Limiting (Token Bucket ou p-queue), rotation de Proxies (ProxyManager), et Retry Strategy exponentielle sur erreurs HTTP (429, 403).
   - /src/core/pipeline : Dédoublonnage d'entreprises (Nom + Ville) et normalisation des numéros de téléphone (Format E.164 / Afrique - Cameroun +237).
   - /src/core/exporters : Interface `ILeadExporter` et ses implémentations :
     * `JsonExporter`
     * `ExcelExporter`
     * `PostgresPrismaExporter` (avec support de l'upsert/bulk insert pour éviter les doublons en BDD)
   - /src/core/types : Modèle d'entité unique unifié `B2BLead` et interface contractuelle `IScraper`.
   - /src/scrapers/google-maps : Implémentation complète de la stratégie Google Maps utilisant Playwright (gestion du scroll, extraction du nom, ville, adresse, téléphone, site web, note).
   - /src/cli.ts : Interface CLI construite avec Commander.js permettant de lancer des commandes du type `b2b-scraper extract -q "Hôtel" -l "Douala, Cameroun" --target postgres` ou `--target excel --output ./hotels.xlsx`.

3. CONTRAT DE LIVRABLE :
   Ne me donne pas de pseudo-code ou d'explications vagues. 
   Génère les fichiers TypeScript réels, typés à 100%, prêts à être insérés dans un projet. 
   Fournis également le fichier `schema.prisma`, le `package.json` complet avec toutes les dépendances nécessaires et la configuration `tsconfig.json`.

Modifie aussi le prompt pour ajouter la résolution de captchas via 2Captcha/Anti-Captcha.

Voici le prompt final mis à jour avec le module de résolution automatique de Captchas (2Captcha / Anti-Captcha) intégré au niveau de l'abstraction du Driver :
Plaintext

Tu es un Architecte Logiciel Senior spécialisé en Node.js, TypeScript et Web Scraping avancé. 

Je souhaite développer un module/package interne réutilisable (pour mes projets SaaS) qui permet de faire de l'extraction de leads B2B (Annuaires, Google Maps, Sites Web) de manière autonome, robuste et sans dépendre d'APIs tierces payantes.

Voici les spécifications techniques et les contraintes d'architecture à respecter :

1. STACK TECHNIQUE :
   - Langage : TypeScript (Strict Mode)
   - Runtime : Node.js (ESM)
   - Automation Headless : Playwright Node (`playwright-core` ou `@playwright/test`)
   - HTTP/Parsing Rapide : `got` (ou `axios`) + `cheerio`
   - Captcha Solving : `2captcha` ou `anti-captcha` SDK (reCAPTCHA v2/v3, Turnstile, hCaptcha)
   - ORM / Persistence : `@prisma/client` + `prisma` (PostgreSQL)
   - Validation & Schéma : `zod`
   - CLI : `commander`, `ora`, `chalk`
   - Exporters : Excel (`exceljs`), JSON et PostgreSQL via Prisma Client

2. ARCHITECTURE TECHNIQUE ATTENDUE :
   Applique le pattern "Strategy" pour les scrapers, le pattern "Decorator/Middleware" pour le réseau/driver, et un pattern "Repository/Exporter" extensible pour la persistance des données.
   
   Structure des dossiers :
   - /prisma : Schéma `schema.prisma` définissant le modèle `Lead` (id, companyName, city, country, phoneRaw, phoneNormalized, websiteUrl, source, metadata JSON, createdAt, updatedAt) avec contrainte d'unicité composite ou d'indexation sur `[companyName, city]`.
   - /src/core/driver : Abstraction du réseau avec :
     * Rate Limiting (Token Bucket ou p-queue)
     * Rotation de Proxies (`ProxyManager`)
     * Service de résolution de Captchas (`CaptchaSolverService` supportant 2Captcha/Anti-Captcha avec détection auto et injection de token dans le navigateur Playwright/HTTP)
     * Retry Strategy exponentielle sur erreurs HTTP (429, 403, 503) et échecs de Captcha.
   - /src/core/pipeline : Dédoublonnage d'entreprises (Nom + Ville) et normalisation des numéros de téléphone (Format E.164 / Afrique - Cameroun +237).
   - /src/core/exporters : Interface `ILeadExporter` et ses implémentations :
     * `JsonExporter`
     * `ExcelExporter`
     * `PostgresPrismaExporter` (avec support de l'upsert/bulk insert pour éviter les doublons en BDD)
   - /src/core/types : Modèle d'entité unique unifié `B2BLead` et interface contractuelle `IScraper`.
   - /src/scrapers/google-maps : Implémentation complète de la stratégie Google Maps utilisant Playwright (gestion du scroll, extraction du nom, ville, adresse, téléphone, site web, note, et résolution automatique si un captcha Google survient).
   - /src/cli.ts : Interface CLI construite avec Commander.js permettant de lancer des commandes du type `b2b-scraper extract -q "Hôtel" -l "Douala, Cameroun" --target postgres` ou `--target excel --output ./hotels.xlsx`.

3. CONTRAT DE LIVRABLE :
   Ne me donne pas de pseudo-code ou d'explications vagues. 
   Génère les fichiers TypeScript réels, typés à 100%, prêts à être insérés dans un projet. 
   Fournis également le fichier `schema.prisma`, le `package.json` complet avec toutes les dépendances nécessaires et la configuration `tsconfig.json`.

Comment adapter la structure Prisma pour lier un ou plusieurs contacts/décideurs à chaque lead d'entreprise ?

Pour modéliser la relation entre une entreprise (un Lead) et ses différents décideurs/contacts (Directeur, Responsable Achats, Gérant), l'approche propre en modélisation BDD et Prisma est une relation Un-à-Plusieurs (1:N).

Une entreprise peut avoir plusieurs contacts, mais un contact est rattaché à une entreprise donnée dans ce contexte.
1. Le Schéma Prisma (schema.prisma)

Voici comment adapter ton modèle Prisma. On utilise des enums pour typer les rôles et on ajoute une contrainte d'unicité sur l'email du contact s'il est présent pour éviter les doublons lors des ré-extractions.
Extrait de code

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

generator client {
  provider = "prisma-client-js"
}

// ------------------------------------------------------
// 1. Modèle Entreprise / Lead Principal
// ------------------------------------------------------
model Lead {
  id              String   @id @default(uuid())
  companyName     String   @map("company_name")
  category        String?
  city            String
  country         String   @default("CM")
  address         String?
  phoneRaw        String?  @map("phone_raw")
  phoneNormalized String?  @map("phone_normalized")
  email           String?  // Email générique (ex: contact@hotel.cm)
  websiteUrl      String?  @map("website_url")
  source          String   // ex: "google-maps", "yellowpages"
  googleRating    Float?   @map("google_rating")
  metadata        Json?    // Métadonnées flexibles (nombre de chambres, équipements, etc.)
  
  // Relations
  contacts        Contact[]

  createdAt       DateTime @default(now()) @map("created_at")
  updatedAt       DateTime @updatedAt @map("updated_at")

  // Contrainte pour éviter de re-scrapper la même entreprise dans la même ville
  @@unique([companyName, city])
  @@index([city, category])
  @@map("leads")
}

// ------------------------------------------------------
// 2. Modèle Décideur / Contact Nominatif
// ------------------------------------------------------
model Contact {
  id            String      @id @default(uuid())
  firstName     String?     @map("first_name")
  lastName      String?     @map("last_name")
  fullName      String      @map("full_name") // ex: "Jean-Pierre Dupont"
  role          ContactRole @default(OTHER)
  titleRaw      String?     @map("title_raw") // Intitulé exact du poste (ex: "General Manager & Founder")
  
  // Coordonnées directes
  emailDirect   String?     @map("email_direct")
  phoneDirect   String?     @map("phone_direct")
  linkedinUrl   String?     @map("linkedin_url")
  confidence    Float?      @default(1.0) // Score de certitude sur le contact (ex: 0.8 si trouvé via regex Hunter.io)

  // Relation avec le Lead
  leadId        String      @map("lead_id")
  lead          Lead        @relation(fields: [leadId], references: [id], onDelete: Cascade)

  createdAt     DateTime    @default(now()) @map("created_at")
  updatedAt     DateTime    @updatedAt @map("updated_at")

  @@unique([leadId, emailDirect]) // Évite les doublons d'email au sein de la même entreprise
  @@index([role])
  @@map("contacts")
}

// Enum pour catégoriser proprement les décideurs
enum ContactRole {
  GENERAL_MANAGER  // Directeur Général / GM
  OWNER            // Propriétaire / Gérant
  DIRECTOR         // Directeur de département
  EXECUTIVE        // Cadre / Responsable
  OTHER            // Autre / Non spécifié
}

2. Comment requêter et sauvegarder avec Prisma Client (TypeScript)
A. Upsert d'un Lead avec ses Contacts (Bulk / Atomic)

Lors de l'extraction, tu veux créer ou mettre à jour le Lead et lui rattacher ses contacts en une seule transaction Prisma :
TypeScript

import { PrismaClient, ContactRole } from '@prisma/client';
import { B2BLead } from '../types/lead.entity';

const prisma = new PrismaClient();

export async function saveLeadWithContacts(leadData: B2BLead) {
  return await prisma.lead.upsert({
    where: {
      companyName_city: {
        companyName: leadData.companyName,
        city: leadData.city,
      },
    },
    // Si l'entreprise existe déjà, on met à jour ses données et on ajoute les nouveaux contacts
    update: {
      phoneNormalized: leadData.phoneNormalized,
      websiteUrl: leadData.websiteUrl,
      contacts: {
        createMany: {
          data: leadData.contacts.map((c) => ({
            fullName: c.fullName,
            role: c.role as ContactRole,
            titleRaw: c.titleRaw,
            emailDirect: c.emailDirect,
            linkedinUrl: c.linkedinUrl,
          })),
          skipDuplicates: true, // Ignore si l'email direct existe déjà pour ce lead
        },
      },
    },
    // Si l'entreprise n'existe pas, on la crée avec tous ses contacts en cascade
    create: {
      companyName: leadData.companyName,
      city: leadData.city,
      country: leadData.country || 'CM',
      address: leadData.address,
      phoneRaw: leadData.phoneRaw,
      phoneNormalized: leadData.phoneNormalized,
      email: leadData.email,
      websiteUrl: leadData.websiteUrl,
      source: leadData.source,
      contacts: {
        create: leadData.contacts.map((c) => ({
          fullName: c.fullName,
          role: c.role as ContactRole,
          titleRaw: c.titleRaw,
          emailDirect: c.emailDirect,
          linkedinUrl: c.linkedinUrl,
        })),
      },
    },
    include: {
      contacts: true, // Renvoie le lead créé avec la liste de ses contacts
    },
  });
}

B. Requête d'extraction pour exportation Excel / CSV

Pour récupérer les leads qui ont au moins un contact "Directeur Général" ou "Gérant" :
TypeScript

export async function getLeadsWithDecisionMakers(city?: string) {
  return await prisma.lead.findMany({
    where: {
      ...(city && { city }),
      contacts: {
        some: {
          role: {
            in: [ContactRole.GENERAL_MANAGER, ContactRole.OWNER],
          },
        },
      },
    },
    include: {
      contacts: true, // Inclus tous les contacts rattachés
    },
  });
}

3. Ajustement à faire dans le Prompt Système pour Claude

Si tu souhaites que Claude intègre directement cette structure dans ton package, rajoute cette section dans le prompt sous prisma/schema.prisma :

    Mise à jour du schéma Prisma dans le prompt :
    Inclure deux modèles reliés en 1:N : Lead (entreprise) et Contact (décideurs : fullName, role Enum [GENERAL_MANAGER, OWNER, DIRECTOR, OTHER], emailDirect, linkedinUrl). Utiliser upsert avec createMany sur la relation contacts au niveau du PostgresPrismaExporter.

Génère le prompt système complet mis à jour intégrant ce nouveau schéma Prisma avec les contacts nominatifs.

Voici le prompt système final mis à jour, complet et prêt à être transmis à Claude 3.5 Sonnet :
Plaintext

Tu es un Architecte Logiciel Senior spécialisé en Node.js, TypeScript et Web Scraping avancé. 

Je souhaite développer un module/package interne réutilisable (pour mes projets SaaS) qui permet de faire de l'extraction de leads B2B (Annuaires, Google Maps, Sites Web) de manière autonome, robuste et sans dépendre d'APIs tierces payantes.

Voici les spécifications techniques et les contraintes d'architecture à respecter :

1. STACK TECHNIQUE :
   - Langage : TypeScript (Strict Mode)
   - Runtime : Node.js (ESM)
   - Automation Headless : Playwright Node (`playwright-core` ou `@playwright/test`)
   - HTTP/Parsing Rapide : `got` (ou `axios`) + `cheerio`
   - Captcha Solving : `2captcha` ou `anti-captcha` SDK (reCAPTCHA v2/v3, Turnstile, hCaptcha)
   - ORM / Persistence : `@prisma/client` + `prisma` (PostgreSQL)
   - Validation & Schéma : `zod`
   - CLI : `commander`, `ora`, `chalk`
   - Exporters : Excel (`exceljs`), JSON et PostgreSQL via Prisma Client

2. ARCHITECTURE TECHNIQUE ATTENDUE :
   Applique le pattern "Strategy" pour les scrapers, le pattern "Decorator/Middleware" pour le réseau/driver, et un pattern "Repository/Exporter" extensible pour la persistance des données.
   
   Structure des dossiers :
   - /prisma : Schéma `schema.prisma` définissant deux modèles reliés en relation 1:N (One-to-Many) :
     * `Lead` (id, companyName, category, city, country, address, phoneRaw, phoneNormalized, email, websiteUrl, source, googleRating, metadata JSON, createdAt, updatedAt) avec contrainte d'unicité composite sur `[companyName, city]`.
     * `Contact` (id, fullName, role Enum [GENERAL_MANAGER, OWNER, DIRECTOR, EXECUTIVE, OTHER], titleRaw, emailDirect, phoneDirect, linkedinUrl, confidence Float, leadId, createdAt, updatedAt) relié à `Lead` avec suppression en cascade (`onDelete: Cascade`) et contrainte d'unicité `[leadId, emailDirect]`.
   
   - /src/core/driver : Abstraction du réseau avec :
     * Rate Limiting (Token Bucket ou p-queue).
     * Rotation de Proxies (`ProxyManager`).
     * Service de résolution de Captchas (`CaptchaSolverService` supportant 2Captcha/Anti-Captcha avec détection automatique et injection du token dans le navigateur Playwright/HTTP).
     * Retry Strategy exponentielle sur erreurs HTTP (429, 403, 503) et échecs de Captcha.
   
   - /src/core/pipeline : Dédoublonnage d'entreprises (Nom + Ville) et normalisation des numéros de téléphone (Format E.164 / Afrique - Cameroun +237).
   
   - /src/core/exporters : Interface `ILeadExporter` et ses implémentations :
     * `JsonExporter`
     * `ExcelExporter` (avec onglet dédié pour les entreprises et les contacts rattachés)
     * `PostgresPrismaExporter` (implémentant un `upsert` atomique avec `createMany` sur la relation `contacts` pour gérer les mises à jour et éviter les doublons en BDD).
   
   - /src/core/types : Modèle d'entité unifié `B2BLead` (incluant un tableau `contacts?: LeadContact[]`) et interface contractuelle `IScraper`.
   
   - /src/scrapers/google-maps : Implémentation complète de la stratégie Google Maps utilisant Playwright (gestion du scroll, extraction du nom, ville, adresse, téléphone, site web, note, et résolution automatique si un captcha Google survient).
   
   - /src/cli.ts : Interface CLI construite avec Commander.js permettant de lancer des commandes du type `b2b-scraper extract -q "Hôtel" -l "Douala, Cameroun" --target postgres` ou `--target excel --output ./hotels.xlsx`.

3. CONTRAT DE LIVRABLE :
   Ne me donne pas de pseudo-code ou d'explications vagues. 
   Génère les fichiers TypeScript réels, typés à 100%, prêts à être insérés dans un projet. 
   Fournis également le fichier `schema.prisma` complet, le `package.json` exhaustif avec toutes les dépendances nécessaires et la configuration `tsconfig.json`.

Tout est prêt pour la conception du module. Que souhaites-tu faire ensuite ?
Finaliser la checklist de livraison du fichier client pour ce soir
Concevoir une stratégie d'enrichissement automatique via LinkedIn / Hunter.io


Gemini est une IA et peut se tromper.
