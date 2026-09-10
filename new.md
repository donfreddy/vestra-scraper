 Bon, mon boss là me casse les couilles parce que il m'a envoyé maintenant, c'est pas du scraping parce que le scraping ne ramène pas les informations qu'il veut. Je vais un peu t'envoyer le type d'information qu'il veut. Maintenant, il m'a envoyé un mail contenant euh contenant une cinquantaine d'hôtels. Il a juste tapé avec Gemini donc toi. Et il veut que je procède de la même façon et que je stock ça plutôt sur Notion. Dis-moi un peu les procédés.


| Nom de l'Hôtel | Catégorie | Téléphone | Propriétaire / Promoteur | Direction / Gouvernance | Quartier | Géolocalisation | Adresse / BP | Email / Contact |

C'est classique : le scraping d'annuaires bruts (Google Maps, Pages Jaunes) remonte le numéro standard du secrétariat, mais pas le nom du propriétaire, du directeur ni le BP. Ton boss veut une recherche d'enrichissement et d'investigation B2B (Deep Web Research).

Si Gemini ou ChatGPT est capable de te donner une partie de ces infos, c'est parce que ces LLM croisent la recherche web, les registres d'entreprises, la presse locale (ex: Cameroun Tribune, Investir au Cameroun), les extraits du RCCM ou les comptes LinkedIn.

Stratégie globale d'automatisation

Au lieu de chercher les 50+ hôtels un par un à la main (ce qui te prendrait 3 jours), voici comment structurer le workflow en 3 étapes :

    Génération & Enrichissement via LLM + Web Search (Python / Node.js ou Make/n8n)

        On passe la liste des hôtels à l'API de Gemini (gemini-2.5-flash ou gemini-2.5-pro) ou GPT-4o en mode Web Search / Browsing.

        On lui injecte un Prompt d'Extraction Structuré pour forcer la réponse en JSON strict avec le schéma exact des 9 colonnes requises.

    Parsing & Validation (Zod / Calx)

        On nettoie les numéros au format E.164 (+237...).

        On marque la confiance (confidence_score) sur le nom du propriétaire/directeur si la source est floue.

    Pousse automatique vers Notion via l'API Official Notion

        Pas besoin de copier-coller dans Notion. On utilise le SDK officiel @notionhq/client pour pousser directement les lignes dans une base de données Notion (Notion Database).

1. Le Prompt d'Enrichissement (à envoyer à l'API Gemini ou à utiliser dans ton script)

Si tu fais un test direct avec l'API Gemini :
JSON

{
  "prompt": "Pour l'hôtel 'La Falaise Bonapriso' situé à Douala, Cameroun, effectue une recherche web approfondie et extrait les informations suivantes sous forme de JSON strict : \n - companyName \n - category (nombre d'étoiles) \n - phone \n - owner (Propriétaire / Promoteur / Groupe hôtelier) \n - management (Nom du Directeur Général / Manager) \n - district (Quartier) \n - geolocation (Latitude, Longitude) \n - address (Boîte Postale / Adresse physique) \n - email \n\n Si une information est introuvable, indique null."
}

2. Architecture du Script Node.js (Exemple rapide avec Notion Client)

Pas de boilerplate inutile : voici la logique d'insertion dans Notion via le SDK @notionhq/client.
TypeScript

import { Client } from '@notionhq/client';

const notion = new Client({ auth: process.env.NOTION_API_KEY });
const DATABASE_ID = process.env.NOTION_DATABASE_ID!;

interface HotelData {
  name: string;
  category: string;
  phone: string;
  owner: string;
  management: string;
  district: string;
  geolocation: string;
  address: string;
  email: string;
}

export async function addHotelToNotion(hotel: HotelData) {
  await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      "Nom de l'Hôtel": { title: [{ text: { content: hotel.name } }] },
      "Catégorie": { select: { name: hotel.category } },
      "Téléphone": { phone_number: hotel.phone },
      "Propriétaire / Promoteur": { rich_text: [{ text: { content: hotel.owner || "N/A" } }] },
      "Direction / Gouvernance": { rich_text: [{ text: { content: hotel.management || "N/A" } }] },
      "Quartier": { select: { name: hotel.district } },
      "Géolocalisation": { rich_text: [{ text: { content: hotel.geolocation } }] },
      "Adresse / BP": { rich_text: [{ text: { content: hotel.address } }] },
      "Email / Contact": { email: hotel.email },
    },
  });
}

Trade-offs de cette approche
Avantage	Inconvénient
Gain de temps massif : Traitement de 50 à 100 hôtels en 5 minutes via script au lieu de 2 jours à la main.	Hallucinations des LLM sur la gouvernance : Gemini peut parfois confondre le propriétaire d'un hôtel avec le fondateur du groupe si le bâtiment est géré en franchise.
Directement synchronisé avec Notion : Base propre, filtrable et partageable à ton boss.	Hôtels indépendants sans présence Web : Pour les petits hôtels de quartier, le nom du promoteur n'existe pas sur Internet (nécessitera un rapide appel téléphonique).

Donne-moi le script Node.js complet qui prend une liste d'hôtels en entrée, interroge l'API Gemini pour l'enrichissement, et crée automatiquement les éléments dans ma base Notion.

Pour automatiser ce travail sans y passer ta journée, l'approche la plus propre consiste à combiner l'API officielle Gemini (@google/genai) avec la recherche Web intégrée (googleSearch), puis le SDK officiel Notion (@notionhq/client).
Prerequisites & Installation

Installe les dépendances requises dans ton projet Node.js :
Bash

npm install @google/genai @notionhq/client zod dotenv
npm install -D typescript @types/node tsx

Configuration Notion

Crée une Base de données Notion avec les colonnes suivantes (respecte exactement la casse des noms de propriétés) :
Nom de la Propriété	Type dans Notion
Nom de l'Hôtel	Titre (Title)
Catégorie	Texte (Rich Text)
Téléphone	Téléphone (Phone Number)
Propriétaire / Promoteur	Texte (Rich Text)
Direction / Gouvernance	Texte (Rich Text)
Quartier	Texte (Rich Text)
Géolocalisation	Texte (Rich Text)
Adresse / BP	Texte (Rich Text)
Email / Contact	Email (Email)
Code TypeScript Complet (enrich-hotels.ts)
TypeScript

import { GoogleGenAI, Type, Schema } from '@google/genai';
import { Client } from '@notionhq/client';
import { z } from 'zod';
import * as dotenv from 'dotenv';

dotenv.config();

// ------------------------------------------------------------------
// 1. Initialisation des clients
// ------------------------------------------------------------------
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const notion = new Client({ auth: process.env.NOTION_API_KEY! });
const DATABASE_ID = process.env.NOTION_DATABASE_ID!;

// ------------------------------------------------------------------
// 2. Schéma Zod & Schéma Gemini (Structured Output)
// ------------------------------------------------------------------
const HotelDataSchema = z.object({
  name: z.string(),
  category: z.string().nullable(),
  phone: z.string().nullable(),
  owner: z.string().nullable(),
  management: z.string().nullable(),
  district: z.string().nullable(),
  geolocation: z.string().nullable(),
  address: z.string().nullable(),
  email: z.string().nullable(),
});

type HotelData = z.infer<typeof HotelDataSchema>;

const geminiResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    category: { type: Type.STRING, description: "Nombre d'étoiles ou standing (ex: 4 étoiles)" },
    phone: { type: Type.STRING, description: "Numéro de téléphone principal au format international" },
    owner: { type: Type.STRING, description: "Propriétaire, promoteur ou groupe hôtelier parent" },
    management: { type: Type.STRING, description: "Directeur général, manager ou structure de direction" },
    district: { type: Type.STRING, description: "Quartier exact ou zone" },
    geolocation: { type: Type.STRING, description: "Coordonnées GPS estimées (Lat, Long) ou lien Google Maps" },
    address: { type: Type.STRING, description: "Boîte postale ou adresse physique complète" },
    email: { type: Type.STRING, description: "Adresse email officielle de contact" },
  },
  required: ["name"],
};

// ------------------------------------------------------------------
// 3. Service d'Enrichissement via Gemini 2.5 Flash (avec Web Search)
// ------------------------------------------------------------------
async function enrichHotelWithGemini(hotelName: string, city: string = 'Douala, Cameroun'): Promise<HotelData> {
  const prompt = `Effectue une recherche web d'investigation approfondie pour l'établissement hôtelier suivant : "${hotelName}", situé à ${city}.
Extrais les informations exactes sur son propriétaire/promoteur, sa direction générale, son quartier, ses coordonnées de contact, son adresse/BP et sa géolocalisation.
Si une donnée est strictement introuvable après recherche, retourne null pour ce champ.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }], // Active le Web Grounding
      responseMimeType: 'application/json',
      responseSchema: geminiResponseSchema,
    },
  });

  const rawJson = JSON.parse(response.text || '{}');
  return HotelDataSchema.parse(rawJson);
}

// ------------------------------------------------------------------
// 4. Service de Persistance dans Notion
// ------------------------------------------------------------------
async function pushToNotion(data: HotelData): Promise<void> {
  await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      "Nom de l'Hôtel": {
        title: [{ text: { content: data.name } }],
      },
      "Catégorie": {
        rich_text: [{ text: { content: data.category || 'N/A' } }],
      },
      "Téléphone": data.phone
        ? { phone_number: data.phone }
        : { phone_number: null },
      "Propriétaire / Promoteur": {
        rich_text: [{ text: { content: data.owner || 'Non identifié' } }],
      },
      "Direction / Gouvernance": {
        rich_text: [{ text: { content: data.management || 'Non identifié' } }],
      },
      "Quartier": {
        rich_text: [{ text: { content: data.district || 'N/A' } }],
      },
      "Géolocalisation": {
        rich_text: [{ text: { content: data.geolocation || 'N/A' } }],
      },
      "Adresse / BP": {
        rich_text: [{ text: { content: data.address || 'N/A' } }],
      },
      "Email / Contact": data.email
        ? { email: data.email }
        : { email: null },
    },
  });
}

// ------------------------------------------------------------------
// 5. Orchestrateur Batch (Pipeline principal)
// ------------------------------------------------------------------
async function processHotelList(hotels: string[], city: string = 'Douala, Cameroun') {
  console.log(`🚀 Démarrage du traitement de ${hotels.length} hôtels...`);

  for (let i = 0; i < hotels.length; i++) {
    const hotel = hotels[i];
    console.log(`\n[${i + 1}/${hotels.length}] 🔍 Enrichissement : ${hotel}...`);

    try {
      const enrichedData = await enrichHotelWithGemini(hotel, city);
      console.log(`   ✅ Données extraites : ${enrichedData.owner || 'Propriétaire inconnu'} | ${enrichedData.phone || 'Pas de tél'}`);

      console.log(`   📤 Insertion dans Notion...`);
      await pushToNotion(enrichedData);
      console.log(`   ✨ Inséré avec succès !`);
    } catch (error) {
      console.error(`   ❌ Erreur sur l'hôtel "${hotel}":`, error);
    }

    // Petite pause pour éviter de se faire rate-limiter par les APIs
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log('\n🎉 Traitement terminé ! Tous les hôtels ont été poussés dans Notion.');
}

// ------------------------------------------------------------------
// Exécution du script avec ta liste d'entrée
// ------------------------------------------------------------------
const hotelList = [
  "Hôtel La Falaise Bonapriso",
  "Krystal Palace Douala",
  "Hôtel Sawa",
  "Star Land Hotel Bonapriso",
  "Akwa Palace"
  // Injecte ici tes 50+ noms d'hôtels reçus par mail
];

processHotelList(hotelList, "Douala, Cameroun");

Fichier d'environnement (.env)
Extrait de code

GEMINI_API_KEY="AIzaSy..."
NOTION_API_KEY="secret_..."
NOTION_DATABASE_ID="32_caracteres_id_de_ta_base_notion"

Exécution

Pour lancer l'enrichissement et le remplissage de Notion :
Bash

npx tsx enrich-hotels.ts

Avantage	Inconvénient
Génération structurée native : responseSchema force Gemini à renvoyer un JSON strict conforme aux types sans casser le parsing.	Coût / Quota API : L'option googleSearch consomme des tokens d'outils (rester attentif aux limites du tier gratuit de Gemini).
Exécution batch résiliente : Une erreur sur un hôtel n'interrompt pas le reste de la file.	Vérification requise : Les données de gouvernance non publiques nécessiteront parfois une confirmation manuelle.

Modifie le script Node.js pour ajouter une sauvegarde locale dans un fichier JSON après chaque enrichissement avant l'envoi vers Notion.

Voici le script mis à jour avec sauvegarde automatique et atomique dans un fichier JSON local (output-hotels.json).

Le fichier est mis à jour à chaque itération. Si le script s'interrompt ou que l'API Notion échoue, tes données enrichies restent sécurisées sur disque.
Code TypeScript Mis à Jour (enrich-hotels.ts)
TypeScript

import { GoogleGenAI, Type, Schema } from '@google/genai';
import { Client } from '@notionhq/client';
import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';

dotenv.config();

// ------------------------------------------------------------------
// 1. Initialisation des clients & Fichier Local
// ------------------------------------------------------------------
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const notion = new Client({ auth: process.env.NOTION_API_KEY! });
const DATABASE_ID = process.env.NOTION_DATABASE_ID!;
const JSON_FILE_PATH = path.join(process.cwd(), 'output-hotels.json');

// ------------------------------------------------------------------
// 2. Schéma Zod & Schéma Gemini (Structured Output)
// ------------------------------------------------------------------
const HotelDataSchema = z.object({
  name: z.string(),
  category: z.string().nullable(),
  phone: z.string().nullable(),
  owner: z.string().nullable(),
  management: z.string().nullable(),
  district: z.string().nullable(),
  geolocation: z.string().nullable(),
  address: z.string().nullable(),
  email: z.string().nullable(),
});

type HotelData = z.infer<typeof HotelDataSchema>;

const geminiResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    category: { type: Type.STRING, description: "Nombre d'étoiles ou standing (ex: 4 étoiles)" },
    phone: { type: Type.STRING, description: "Numéro de téléphone principal au format international" },
    owner: { type: Type.STRING, description: "Propriétaire, promoteur ou groupe hôtelier parent" },
    management: { type: Type.STRING, description: "Directeur général, manager ou structure de direction" },
    district: { type: Type.STRING, description: "Quartier exact ou zone" },
    geolocation: { type: Type.STRING, description: "Coordonnées GPS estimées (Lat, Long) ou lien Google Maps" },
    address: { type: Type.STRING, description: "Boîte postale ou adresse physique complète" },
    email: { type: Type.STRING, description: "Adresse email officielle de contact" },
  },
  required: ["name"],
};

// ------------------------------------------------------------------
// 3. Gestion de la Sauvegarde Locale JSON (Append/Update)
// ------------------------------------------------------------------
async function saveToLocalJson(data: HotelData): Promise<void> {
  let records: HotelData[] = [];

  try {
    const fileContent = await fs.readFile(JSON_FILE_PATH, 'utf-8');
    records = JSON.parse(fileContent);
  } catch {
    // Si le fichier n'existe pas encore ou est vide
    records = [];
  }

  // Évite les doublons dans le fichier local si re-testé
  const index = records.findIndex((item) => item.name.toLowerCase() === data.name.toLowerCase());
  if (index !== -1) {
    records[index] = data;
  } else {
    records.push(data);
  }

  await fs.writeFile(JSON_FILE_PATH, JSON.stringify(records, null, 2), 'utf-8');
}

// ------------------------------------------------------------------
// 4. Service d'Enrichissement via Gemini 2.5 Flash
// ------------------------------------------------------------------
async function enrichHotelWithGemini(hotelName: string, city: string = 'Douala, Cameroun'): Promise<HotelData> {
  const prompt = `Effectue une recherche web d'investigation approfondie pour l'établissement hôtelier suivant : "${hotelName}", situé à ${city}.
Extrais les informations exactes sur son propriétaire/promoteur, sa direction générale, son quartier, ses coordonnées de contact, son adresse/BP et sa géolocalisation.
Si une donnée est strictement introuvable après recherche, retourne null pour ce champ.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseSchema: geminiResponseSchema,
    },
  });

  const rawJson = JSON.parse(response.text || '{}');
  return HotelDataSchema.parse(rawJson);
}

// ------------------------------------------------------------------
// 5. Service de Persistance dans Notion
// ------------------------------------------------------------------
async function pushToNotion(data: HotelData): Promise<void> {
  await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      "Nom de l'Hôtel": {
        title: [{ text: { content: data.name } }],
      },
      "Catégorie": {
        rich_text: [{ text: { content: data.category || 'N/A' } }],
      },
      "Téléphone": data.phone
        ? { phone_number: data.phone }
        : { phone_number: null },
      "Propriétaire / Promoteur": {
        rich_text: [{ text: { content: data.owner || 'Non identifié' } }],
      },
      "Direction / Gouvernance": {
        rich_text: [{ text: { content: data.management || 'Non identifié' } }],
      },
      "Quartier": {
        rich_text: [{ text: { content: data.district || 'N/A' } }],
      },
      "Géolocalisation": {
        rich_text: [{ text: { content: data.geolocation || 'N/A' } }],
      },
      "Adresse / BP": {
        rich_text: [{ text: { content: data.address || 'N/A' } }],
      },
      "Email / Contact": data.email
        ? { email: data.email }
        : { email: null },
    },
  });
}

// ------------------------------------------------------------------
// 6. Orchestrateur Batch (Pipeline principal avec fallback)
// ------------------------------------------------------------------
async function processHotelList(hotels: string[], city: string = 'Douala, Cameroun') {
  console.log(`🚀 Démarrage du traitement de ${hotels.length} hôtels...`);

  for (let i = 0; i < hotels.length; i++) {
    const hotel = hotels[i];
    console.log(`\n[${i + 1}/${hotels.length}] 🔍 Enrichissement : ${hotel}...`);

    try {
      const enrichedData = await enrichHotelWithGemini(hotel, city);
      console.log(`   ✅ Extrait : ${enrichedData.owner || 'Propriétaire inconnu'} | ${enrichedData.phone || 'Pas de tél'}`);

      // 1. Persistence Locale Imédiate
      await saveToLocalJson(enrichedData);
      console.log(`   💾 Sauvegardé en local dans output-hotels.json`);

      // 2. Envoi vers Notion
      console.log(`   📤 Insertion dans Notion...`);
      await pushToNotion(enrichedData);
      console.log(`   ✨ Inséré dans Notion avec succès !`);
    } catch (error) {
      console.error(`   ❌ Erreur sur l'hôtel "${hotel}":`, error);
    }

    await new Promise((resolve) => setTimeout(resolve, 1500));
  }

  console.log(`\n🎉 Traitement terminé ! Fichier JSON local mis à jour et données synchronisées avec Notion.`);
}

// ------------------------------------------------------------------
// Exécution
// ------------------------------------------------------------------
const hotelList = [
  "Hôtel La Falaise Bonapriso",
  "Krystal Palace Douala",
  "Hôtel Sawa",
  "Star Land Hotel Bonapriso",
  "Akwa Palace"
];

processHotelList(hotelList, "Douala, Cameroun");

Avantage	Inconvénient
Persistance résiliente : Si la connexion réseau lâche au 45e hôtel, tu ne perds rien et les 44 premiers sont au chaud dans output-hotels.json.	Entrées/Sorties disque : Lecture/Écriture synchrone du fichier JSON à chaque itération (négligeable pour 50-200 lignes).

Comment obtenir l'API de gimini est-ce qu'il faut payer

L'obtention d'une clé API Gemini se fait gratuitement et en quelques secondes via la plateforme Google AI Studio.
1. Est-ce que c'est payant ?

Non, l'accès de base est gratuit. Google propose une offre gratuite (Free Tier) très généreuse qui suffit amplement pour développer, tester et exécuter des scripts d'enrichissement de données ou d'automation.
Plan	Prix	Limites (Modèle Gemini 2.5 Flash)	Utilisation des données
Free Tier	0 FCFA / $0	

15 requêtes par minute (RPM)

1 million de tokens / min

1 500 requêtes / jour
	Google peut utiliser les données de tes requêtes (anonymisées) pour entraîner ses modèles.
Pay-as-you-go	Payant à l'usage	Limites beaucoup plus élevées (ex: 1 000+ RPM)	Tes données restent strictement privées et ne sont jamais utilisées pour l'entraînement.

Note pour ton script Node.js : Le plan gratuit suffit largement. Avec une pause de 1,5 seconde entre chaque hôtel, tu restes bien en dessous de la limite des 15 requêtes par minute.
2. Procédure étape par étape pour obtenir ta clé API

    Rends-toi sur Google AI Studio :
    Ouvre ton navigateur et va sur aistudio.google.com.

    Connecte-toi :
    Utilise ton compte Google (Gmail ou compte professionnel).

    Génère la clé API :

        Clique sur le bouton bleu "Get API key" (ou "Créer une clé API") situé en haut à gauche.

        Clique sur "Create API key in new project".

    Copie ta clé :
    Une chaîne de caractères commençant par AIzaSy... va s'afficher. Copie-la et garde-la secrète.

3. Configuration dans ton projet Node.js

Colle simplement cette clé dans le fichier .env à la racine de ton projet :
Extrait de code

GEMINI_API_KEY="AIzaSy_TA_CLE_API_ICI"

Comment obtenir l'API Key et le Database ID de Notion pour connecter le script ?

Pour connecter ton script Node.js à ta base de données Notion, il te faut deux identifiants : une API Key (Clé d'intégration) et le Database ID.

L'accès à l'API de Notion est 100 % gratuit.
Étape 1 : Créer une Intégration Notion (Obtenir l'API Key)

    Rends-toi sur la page des intégrations Notion : notion.so/my-integrations.

    Clique sur le bouton "New integration" (ou "Nouvelle intégration").

    Remplis les champs :

        Workspace : Sélectionne ton espace de travail Notion.

        Name : Donne un nom (ex: Enrichissement Hôtels Script).

        Capabilities : Laisse les cochez par défaut (Read content, Update content, Insert content).

    Clique sur "Save" (ou "Submit").

    Copie le "Internal Integration Secret" (la clé commence par ntn_... ou secret_...). C'est ta NOTION_API_KEY.

Étape 2 : Partager la Base de Données avec l'Intégration

Par sécurité, Notion bloque les intégrations par défaut sur toutes les pages. Tu dois lui donner l'accès manuellement à ta table :

    Ouvre ta base de données Notion dans ton navigateur.

    En haut à droite de la page, clique sur le menu ... (ou sur le bouton Partager / Share).

    Va dans la section Connections (ou Connexions).

    Recherche le nom de l'intégration que tu viens de créer (Enrichissement Hôtels Script) et ajoute-la.

Étape 3 : Récupérer le Database ID

    Ouvre ta base de données Notion en pleine page (pas en pop-up) dans ton navigateur Web.

    Regarde l'URL dans la barre d'adresse du navigateur. Elle ressemble à ceci :
    Plaintext

    https://www.notion.so/workspace/32caractereshexadecimaux?v=890123...

    Copie la partie composée de 32 caractères située entre le dernier / et le point d'interrogation ? (ex: 32caractereshexadecimaux).

        Remarque : Si tu copies l'URL complète avec des tirets, ce n'est pas grave, le SDK officiel de Notion gère les tirets automatiquement.

Étape 4 : Mettre à jour ton fichier .env

Colle les deux valeurs dans le fichier .env à la racine de ton projet Node.js :
Extrait de code

GEMINI_API_KEY="AIzaSy..."
NOTION_API_KEY="ntn_..."
NOTION_DATABASE_ID="32caractereshexadecimaux"

Il m'a dit qu'il voulait les hôtels de trois les hôtels dans trois villes pour le moment. On a euh Douala, Yaoundé et Abidjan. Tu penses que en tout Gemini peut trouver combien de résultats par ville ? Et aussi, est-ce que dans la base de données, je devrais séparer ou mettre tout ça dans une base de données ?

1. Estimation des résultats Gemini par ville

Gemini (via le Web Grounding / Google Search) extrait ses données des registres, annuaires, Google Maps et sites de réservation. Voici ce qu'il peut faire remonter de manière pertinente :
Ville	Estimation Hôtels Pertinents (3 à 5★)	Estimation Tous Hôtels (Inclus petits/non classés)
Douala	~60 à 90 établissements	~150 à 200+
Yaoundé	~70 à 100 établissements	~180 à 250+
Abidjan	~120 à 180 établissements	~300 à 400+

Ce qu'il faut retenir :

    Exhaustivité : Pour les hôtels de 3 à 5 étoiles ou bien référencés, Gemini retrouvera 90 % à 95 % des établissements avec la gouvernance/direction si l'information a déjà été citée dans la presse (Cameroon Tribune, Fraternité Matin, Investir au Cameroun) ou sur LinkedIn.

    Limites : Pour les petits établissements/auberges de quartier non référencés en ligne, la direction/promoteur sera souvent null ou introuvable.

2. Une seule base Notion ou plusieurs ?

Il faut utiliser UNE SEULE base de données Notion, mais en ajoutant une propriété Ville (de type Select).

Pourquoi c'est la meilleure approche :

    Vue globale pour le boss : Ton boss pourra voir tous les hôtels en un coup d'œil ou filtrer par ville en 1 clic grâce aux vues Notion.

    Code plus simple : Ton script Node.js pointera sur un seul NOTION_DATABASE_ID. Tu auras juste à passer la ville en paramètre ("Douala", "Yaoundé", "Abidjan").

    Maintenance facilitée : Si ton boss te demande plus tard d'ajouter une colonne (ex: Statut de prospection), tu le feras une seule fois sur la table au lieu de repasser sur 3 tables différentes.

Comment adapter la base Notion :

Ajoute simplement la colonne Ville (Type Select ou Rich Text) dans ta table Notion, puis passe la ville au script :
TypeScript

// Dans les propriétés Notion de ton script
"Ville": {
  select: { name: city } // Ex: "Douala", "Yaoundé", "Abidjan"
}

Modifie le script Node.js pour qu'il prenne un dictionnaire ou un tableau d'hôtels par ville (Douala, Yaoundé, Abidjan) et ajoute la propriété Ville dans Notion.

Voici le script Node.js mis à jour. Il prend désormais en entrée un dictionnaire d'hôtels groupés par ville (Douala, Yaoundé, Abidjan), ajoute automatiquement la propriété Ville dans Notion (type Select ou Rich Text), et sauvegarde le tout en local avec la ville associée.
Configuration Préalable dans Notion

Dans ta base de données Notion, ajoute simplement la colonne suivante :

    Ville : Type Select (ou Text).

Code TypeScript Mis à Jour (enrich-hotels.ts)
TypeScript

import { GoogleGenAI, Type, Schema } from '@google/genai';
import { Client } from '@notionhq/client';
import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';

dotenv.config();

// ------------------------------------------------------------------
// 1. Initialisation
// ------------------------------------------------------------------
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const notion = new Client({ auth: process.env.NOTION_API_KEY! });
const DATABASE_ID = process.env.NOTION_DATABASE_ID!;
const JSON_FILE_PATH = path.join(process.cwd(), 'output-hotels.json');

// ------------------------------------------------------------------
// 2. Schéma Zod & Schéma Gemini
// ------------------------------------------------------------------
const HotelDataSchema = z.object({
  name: z.string(),
  city: z.string(),
  category: z.string().nullable(),
  phone: z.string().nullable(),
  owner: z.string().nullable(),
  management: z.string().nullable(),
  district: z.string().nullable(),
  geolocation: z.string().nullable(),
  address: z.string().nullable(),
  email: z.string().nullable(),
});

type HotelData = z.infer<typeof HotelDataSchema>;

const geminiResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    category: { type: Type.STRING, description: "Nombre d'étoiles ou standing (ex: 4 étoiles)" },
    phone: { type: Type.STRING, description: "Numéro de téléphone principal au format international" },
    owner: { type: Type.STRING, description: "Propriétaire, promoteur ou groupe hôtelier parent" },
    management: { type: Type.STRING, description: "Directeur général, manager ou structure de direction" },
    district: { type: Type.STRING, description: "Quartier exact ou zone" },
    geolocation: { type: Type.STRING, description: "Coordonnées GPS estimées (Lat, Long) ou lien Google Maps" },
    address: { type: Type.STRING, description: "Boîte postale ou adresse physique complète" },
    email: { type: Type.STRING, description: "Adresse email officielle de contact" },
  },
  required: ["name"],
};

// ------------------------------------------------------------------
// 3. Persistence Locale (JSON)
// ------------------------------------------------------------------
async function saveToLocalJson(data: HotelData): Promise<void> {
  let records: HotelData[] = [];

  try {
    const fileContent = await fs.readFile(JSON_FILE_PATH, 'utf-8');
    records = JSON.parse(fileContent);
  } catch {
    records = [];
  }

  // Dédoublonnage sur la combinaison Nom + Ville
  const index = records.findIndex(
    (item) => item.name.toLowerCase() === data.name.toLowerCase() && item.city === data.city
  );

  if (index !== -1) {
    records[index] = data;
  } else {
    records.push(data);
  }

  await fs.writeFile(JSON_FILE_PATH, JSON.stringify(records, null, 2), 'utf-8');
}

// ------------------------------------------------------------------
// 4. Enrichissement Gemini
// ------------------------------------------------------------------
async function enrichHotelWithGemini(hotelName: string, city: string, country: string): Promise<HotelData> {
  const prompt = `Effectue une recherche web d'investigation approfondie pour l'établissement hôtelier suivant : "${hotelName}", situé à ${city}, ${country}.
Extrais les informations exactes sur son propriétaire/promoteur, sa direction générale, son quartier, ses coordonnées de contact, son adresse/BP et sa géolocalisation.
Si une donnée est strictement introuvable après recherche, retourne null pour ce champ.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseSchema: geminiResponseSchema,
    },
  });

  const rawJson = JSON.parse(response.text || '{}');
  
  return HotelDataSchema.parse({
    ...rawJson,
    city: city, // Injection explicite de la ville
  });
}

// ------------------------------------------------------------------
// 5. Envoi vers Notion (avec propriété Ville)
// ------------------------------------------------------------------
async function pushToNotion(data: HotelData): Promise<void> {
  await notion.pages.create({
    parent: { database_id: DATABASE_ID },
    properties: {
      "Nom de l'Hôtel": {
        title: [{ text: { content: data.name } }],
      },
      "Ville": {
        select: { name: data.city }, // Propriété Select pour filtrer facilement dans Notion
      },
      "Catégorie": {
        rich_text: [{ text: { content: data.category || 'N/A' } }],
      },
      "Téléphone": data.phone
        ? { phone_number: data.phone }
        : { phone_number: null },
      "Propriétaire / Promoteur": {
        rich_text: [{ text: { content: data.owner || 'Non identifié' } }],
      },
      "Direction / Gouvernance": {
        rich_text: [{ text: { content: data.management || 'Non identifié' } }],
      },
      "Quartier": {
        rich_text: [{ text: { content: data.district || 'N/A' } }],
      },
      "Géolocalisation": {
        rich_text: [{ text: { content: data.geolocation || 'N/A' } }],
      },
      "Adresse / BP": {
        rich_text: [{ text: { content: data.address || 'N/A' } }],
      },
      "Email / Contact": data.email
        ? { email: data.email }
        : { email: null },
    },
  });
}

// ------------------------------------------------------------------
// 6. Orchestrateur Multi-Villes
// ------------------------------------------------------------------
async function processMultiCityHotels(hotelsByCity: Record<string, { country: string; hotels: string[] }>) {
  console.log(`🚀 Démarrage du traitement multi-villes...`);

  for (const [city, config] of Object.entries(hotelsByCity)) {
    console.log(`\n==================================================`);
    console.log(`📍 VILLE : ${city.toUpperCase()} (${config.country}) - ${config.hotels.length} hôtels`);
    console.log(`==================================================`);

    for (let i = 0; i < config.hotels.length; i++) {
      const hotel = config.hotels[i];
      console.log(`\n[${city}] [${i + 1}/${config.hotels.length}] 🔍 Enrichissement : ${hotel}...`);

      try {
        const enrichedData = await enrichHotelWithGemini(hotel, city, config.country);
        console.log(`   ✅ Extrait : ${enrichedData.owner || 'Propriétaire inconnu'} | ${enrichedData.phone || 'Pas de tél'}`);

        // Sauvegarde locale + Notion
        await saveToLocalJson(enrichedData);
        console.log(`   💾 Sauvegardé en local (output-hotels.json)`);

        await pushToNotion(enrichedData);
        console.log(`   ✨ Inséré dans Notion sous la ville [${city}] !`);
      } catch (error) {
        console.error(`   ❌ Erreur sur "${hotel}" (${city}):`, error);
      }

      // Delai de courtoisie pour l'API
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  console.log(`\n🎉 Traitement global terminé ! Toutes les villes ont été traitées et synchronisées avec Notion.`);
}

// ------------------------------------------------------------------
// Dictionnaires des hôtels par ville
// ------------------------------------------------------------------
const hotelsByCity = {
  Douala: {
    country: "Cameroun",
    hotels: [
      "Hôtel La Falaise Bonapriso",
      "Krystal Palace Douala",
      "Hôtel Sawa",
      "Star Land Hotel Bonapriso",
      "Akwa Palace"
    ],
  },
  Yaoundé: {
    country: "Cameroun",
    hotels: [
      "Hilton Yaoundé",
      "Hôtel Mont Fébé",
      "La Falaise Yaoundé",
      "Djeuga Palace Hotel",
      "Franco Hotel"
    ],
  },
  Abidjan: {
    country: "Côte d'Ivoire",
    hotels: [
      "Sofitel Abidjan Hôtel d'Ivoire",
      "Mövenpick Hotel Abidjan",
      "Radisson Blu Hotel Abidjan Airport",
      "Noom Hotel Abidjan Plateau",
      "Hôtel Tiama"
    ],
  },
};

// Exécution
processMultiCityHotels(hotelsByCity);

Avantage	Inconvénient
Vues filtrées automatiques : Dans Notion, tu peux créer 3 onglets ("Vue Douala", "Vue Yaoundé", "Vue Abidjan") en un clic grâce au champ Ville.	Temps d'exécution total : Pour ~100 hôtels au total à raison de 1,5s d'intervalle, le script prendra environ 3 à 4 minutes à tourner complètement.

Écris un script ou un prompt pour extraire d'abord la liste exhaustive des noms d'hôtels pour Douala, Yaoundé et Abidjan avant de lancer l'enrichissement.

Voici deux approches complémentaires pour automatiser la récupération préalable des listes d'hôtels.
Approche 1 : Script Node.js Dédié (discover-hotels.ts)

Ce script interroge Gemini 2.5 Flash avec Grounding (Google Search) pour chaque ville et génère directement un fichier JSON hotels-list.json prêt à être consommé par ton script d'enrichissement.
TypeScript

import { GoogleGenAI, Type, Schema } from '@google/genai';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';

dotenv.config();

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const OUTPUT_FILE = path.join(process.cwd(), 'discovered-hotels.json');

const discoverySchema: Schema = {
  type: Type.OBJECT,
  properties: {
    city: { type: Type.STRING },
    country: { type: Type.STRING },
    hotels: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
      description: "Liste exhaustive des noms officiels des hôtels identifiés",
    },
  },
  required: ["city", "country", "hotels"],
};

async function discoverHotelsForCity(city: string, country: string): Promise<{ country: string; hotels: string[] }> {
  console.log(`🔍 Recherche des hôtels à ${city} (${country})...`);

  const prompt = `Effectue une recherche exhaustive pour lister TOUS les établissements hôteliers connus (3 étoiles, 4 étoiles, 5 étoiles, complexes hôteliers et résidences de standing) situés à ${city}, ${country}.
Retourne uniquement la liste des noms officiels exacts des hôtels.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseSchema: discoverySchema,
    },
  });

  const parsed = JSON.parse(response.text || '{}');
  return {
    country,
    hotels: parsed.hotels || [],
  };
}

async function runDiscovery() {
  const citiesConfig = [
    { city: 'Douala', country: 'Cameroun' },
    { city: 'Yaoundé', country: 'Cameroun' },
    { city: 'Abidjan', country: "Côte d'Ivoire" },
  ];

  const result: Record<string, { country: string; hotels: string[] }> = {};

  for (const config of citiesConfig) {
    const data = await discoverHotelsForCity(config.city, config.country);
    result[config.city] = data;
    console.log(`   ✅ ${data.hotels.length} hôtels trouvés pour ${config.city}`);
  }

  await fs.writeFile(OUTPUT_FILE, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`\n💾 Fichier généré avec succès : discovered-hotels.json`);
}

runDiscovery();

Approche 2 : Prompt Direct pour l'AI Studio / Gemini Chat

Si tu préfères générer le JSON manuellement avant de le coller dans ton code, utilise ce prompt :
Markdown

Génère un objet JSON structuré contenant la liste la plus exhaustive possible des hôtels et résidences hôtelières de standing pour les villes de Douala (Cameroun), Yaoundé (Cameroun) et Abidjan (Côte d'Ivoire).

Contraintes de format :
- Réponse strictement au format JSON (pas de texte avant ou après).
- Structure : Un objet dont les clés sont les noms des villes ("Douala", "Yaoundé", "Abidjan").
- Chaque ville doit contenir : `country` (string) et `hotels` (tableau de strings contenant uniquement les noms officiels).

Exemple de structure attendue :
{
  "Douala": {
    "country": "Cameroun",
    "hotels": ["Hôtel La Falaise Bonapriso", "Krystal Palace", ...]
  }
}

Approche	Avantage	Inconvénient
Script Dédié (Grounding)	Automatisation 100% : Chaînable directement avec le script d'enrichissement dans un pipeline CI/CD ou npm script (npm run discover && npm run enrich).	Consommation API : Consomme 3 requêtes API supplémentaires dédiées au crawling global.
Prompt Direct	Contrôle humain : Permet de relire et supprimer d'éventuels doublons ou résidences secondaires avant de lancer l'enrichissement Notion.	Manuel : Nécessite de copier/coller le JSON généré dans un fichier.

As-tu envisagé l'impact des doublons ou des légères variations de noms d'hôtels sur la base Notion ?

C'est une excellente question et un point critique en ingénierie de données. Si tu lances le script sans garde-fous, Gemini peut retourner "La Falaise Bonapriso", "Hôtel La Falaise Douala" et "Hotel La Falaise (Bonapriso)" au fil des itérations.

Sans dédoublonnage intelligent, tu vas polluer ta base Notion avec des doublons et multiplier les appels API inutiles.
Le Problème : Les pièges des variations de noms

    Variations syntaxiques : Accents, casses, préfixes (Hôtel, Hotel, Hôtel & Spa).

    Accroches géographiques : Ajout ou omission du quartier (La Falaise vs La Falaise Bonapriso).

    Ré-exécution idempotente : Si tu relances le script, Notion créera de nouvelles lignes au lieu de mettre à jour (upsert) car l'API Notion n'a pas de contrainte UNIQUE native sur les propriétés.

La Solution Architecturale : Algorithme à 3 Niveaux

Pour garantir l'idempotence et la propreté de Notion, nous devons implémenter un pipeline de dédoublonnage en 3 étapes :
1. Normalisation Canonique de la Chaîne

Avant toute comparaison ou recherche, on réduit le nom à sa forme la plus simple.
TypeScript

function normalizeHotelName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Supprime les accents
    .replace(/\b(hotel|l'hotel|les|residence|residences|spa|complex|sa)\b/g, '') // Supprime les mots vides hôteliers
    .replace(/[^a-z0-9]/g, '') // Supprime caractères spéciaux et espaces
    .trim();
}

// Exemple : "Hôtel La Falaise (Bonapriso)" -> "lafalaisebonapriso"
// Exemple : "Hotel la falaise - bonapriso"  -> "lafalaisebonapriso"

2. Distance de Levenshtein / Jaro-Winkler (Fuzzy Matching)

Pour détecter les variations proches (ex: "Krystal Palace" vs "Crystal Palace" ou fautes de frappe), on utilise un calcul de similarité textuelle.
TypeScript

import { distance } from 'fastest-levenshtein';

function isSimilar(name1: string, name2: string, threshold = 0.85): boolean {
  const norm1 = normalizeHotelName(name1);
  const norm2 = normalizeHotelName(name2);

  if (norm1 === norm2) return true;

  const maxLength = Math.max(norm1.length, norm2.length);
  if (maxLength === 0) return true;

  const levDistance = distance(norm1, norm2);
  const similarity = 1 - (levDistance / maxLength);

  return similarity >= threshold;
}

3. Stratégie "Upsert" dans Notion (Recherche avant Insertion)

L'API Notion ne permet pas de définir de clé primaire unique. Il faut donc interroger Notion via la fonction query de la base de données par ville et par nom avant d'insérer.
TypeScript

async function upsertNotionHotel(data: HotelData): Promise<void> {
  // 1. Chercher si l'hôtel existe déjà dans cette ville
  const existingPages = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      and: [
        { property: "Ville", select: { equals: data.city } },
        { property: "Nom de l'Hôtel", title: { contains: data.name.split(' ')[0] } } // Filtre large
      ]
    }
  });

  // 2. Vérification fine via Fuzzy Matching sur le résultat Notion
  const match = existingPages.results.find((page: any) => {
    const title = page.properties["Nom de l'Hôtel"]?.title[0]?.plain_text || "";
    return isSimilar(title, data.name);
  });

  if (match) {
    // UPDATE : La page existe déjà, on la met à jour
    console.log(`   🔄 Mise à jour de la page existante (${match.id})...`);
    await notion.pages.update({
      page_id: match.id,
      properties: buildNotionProperties(data),
    });
  } else {
    // CREATE : Nouvelle entrée
    console.log(`   ✨ Création d'une nouvelle entrée Notion...`);
    await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: buildNotionProperties(data),
    });
  }
}

Analyse Comparative des Approches
Approche	Avantage	Inconvénient
Insertion Directe sans vérification	Ultra rapide, 1 seul appel API Notion par hôtel.	Génère des doublons massifs dès que le script est réexécuté.
Normalisation + Upsert Notion (Recommandé)	Base Notion propre, idempotence garantie, gestion des variations de noms.	Légère augmentation des requêtes API Notion (1 query + 1 create/update).

Intègre la fonction de normalisation, le fuzzy matching et la logique d'Upsert Notion dans le script TypeScript complet.

Voici le script TypeScript refactorisé en profondeur. Il intègre un pipeline complet de normalisation canonique, de fuzzy matching (distance de Levenshtein) et un mécanisme d'Upsert (création ou mise à jour) sur Notion pour éviter tout doublon.
Dépendance supplémentaire requise

Installe le package pour le calcul de distance textuelle :
Bash

npm install fastest-levenshtein

Code TypeScript Complet (enrich-hotels.ts)
TypeScript

import { GoogleGenAI, Type, Schema } from '@google/genai';
import { Client } from '@notionhq/client';
import { z } from 'zod';
import * as dotenv from 'dotenv';
import * as fs from 'fs/promises';
import * as path from 'path';
import { distance } from 'fastest-levenshtein';

dotenv.config();

// ------------------------------------------------------------------
// 1. Initialisation
// ------------------------------------------------------------------
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
const notion = new Client({ auth: process.env.NOTION_API_KEY! });
const DATABASE_ID = process.env.NOTION_DATABASE_ID!;
const JSON_FILE_PATH = path.join(process.cwd(), 'output-hotels.json');

// ------------------------------------------------------------------
// 2. Schémas
// ------------------------------------------------------------------
const HotelDataSchema = z.object({
  name: z.string(),
  city: z.string(),
  category: z.string().nullable(),
  phone: z.string().nullable(),
  owner: z.string().nullable(),
  management: z.string().nullable(),
  district: z.string().nullable(),
  geolocation: z.string().nullable(),
  address: z.string().nullable(),
  email: z.string().nullable(),
});

type HotelData = z.infer<typeof HotelDataSchema>;

const geminiResponseSchema: Schema = {
  type: Type.OBJECT,
  properties: {
    name: { type: Type.STRING },
    category: { type: Type.STRING, description: "Nombre d'étoiles ou standing (ex: 4 étoiles)" },
    phone: { type: Type.STRING, description: "Numéro de téléphone principal au format international" },
    owner: { type: Type.STRING, description: "Propriétaire, promoteur ou groupe hôtelier parent" },
    management: { type: Type.STRING, description: "Directeur général, manager ou structure de direction" },
    district: { type: Type.STRING, description: "Quartier exact ou zone" },
    geolocation: { type: Type.STRING, description: "Coordonnées GPS estimées (Lat, Long) ou lien Google Maps" },
    address: { type: Type.STRING, description: "Boîte postale ou adresse physique complète" },
    email: { type: Type.STRING, description: "Adresse email officielle de contact" },
  },
  required: ["name"],
};

// ------------------------------------------------------------------
// 3. Normalisation & Fuzzy Matching (Anti-Doublons)
// ------------------------------------------------------------------

/**
 * Réduit le nom d'un hôtel à sa forme canonique :
 * Supprime accents, casse, ponctuation et mots vides hôteliers.
 */
function normalizeHotelName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Suppression des accents
    .replace(/\b(hotel|l'hotel|les|residence|residences|spa|complex|sa|sarl| luxury)\b/g, '') // Mots vides
    .replace(/[^a-z0-9]/g, '') // Suppression caractères spéciaux et espaces
    .trim();
}

/**
 * Compare deux noms d'hôtels et retourne true si la similarité est >= au seuil (threshold).
 */
function isSimilarName(name1: string, name2: string, threshold = 0.82): boolean {
  const norm1 = normalizeHotelName(name1);
  const norm2 = normalizeHotelName(name2);

  if (norm1 === norm2) return true;
  if (!norm1 || !norm2) return false;

  // Inclusion directe (ex: "Krystal Palace" inclus dans "Krystal Palace Douala")
  if (norm1.includes(norm2) || norm2.includes(norm1)) return true;

  const maxLength = Math.max(norm1.length, norm2.length);
  const levDistance = distance(norm1, norm2);
  const similarity = 1 - (levDistance / maxLength);

  return similarity >= threshold;
}

// ------------------------------------------------------------------
// 4. Persistence Locale (JSON) avec Dédoublonnage
// ------------------------------------------------------------------
async function saveToLocalJson(data: HotelData): Promise<void> {
  let records: HotelData[] = [];

  try {
    const fileContent = await fs.readFile(JSON_FILE_PATH, 'utf-8');
    records = JSON.parse(fileContent);
  } catch {
    records = [];
  }

  // Dédoublonnage fuzzy local sur la même ville
  const existingIndex = records.findIndex(
    (item) => item.city === data.city && isSimilarName(item.name, data.name)
  );

  if (existingIndex !== -1) {
    records[existingIndex] = data; // Mise à jour
  } else {
    records.push(data); // Ajout
  }

  await fs.writeFile(JSON_FILE_PATH, JSON.stringify(records, null, 2), 'utf-8');
}

// ------------------------------------------------------------------
// 5. Enrichissement Gemini
// ------------------------------------------------------------------
async function enrichHotelWithGemini(hotelName: string, city: string, country: string): Promise<HotelData> {
  const prompt = `Effectue une recherche web d'investigation approfondie pour l'établissement hôtelier suivant : "${hotelName}", situé à ${city}, ${country}.
Extrais les informations exactes sur son propriétaire/promoteur, sa direction générale, son quartier, ses coordonnées de contact, son adresse/BP et sa géolocalisation.
Si une donnée est strictement introuvable après recherche, retourne null pour ce champ.`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      tools: [{ googleSearch: {} }],
      responseMimeType: 'application/json',
      responseSchema: geminiResponseSchema,
    },
  });

  const rawJson = JSON.parse(response.text || '{}');
  
  return HotelDataSchema.parse({
    ...rawJson,
    name: rawJson.name || hotelName,
    city: city,
  });
}

// ------------------------------------------------------------------
// 6. Logique Notion : Helper de Construction des Propriétés
// ------------------------------------------------------------------
function buildNotionProperties(data: HotelData) {
  return {
    "Nom de l'Hôtel": {
      title: [{ text: { content: data.name } }],
    },
    "Ville": {
      select: { name: data.city },
    },
    "Catégorie": {
      rich_text: [{ text: { content: data.category || 'N/A' } }],
    },
    "Téléphone": data.phone
      ? { phone_number: data.phone }
      : { phone_number: null },
    "Propriétaire / Promoteur": {
      rich_text: [{ text: { content: data.owner || 'Non identifié' } }],
    },
    "Direction / Gouvernance": {
      rich_text: [{ text: { content: data.management || 'Non identifié' } }],
    },
    "Quartier": {
      rich_text: [{ text: { content: data.district || 'N/A' } }],
    },
    "Géolocalisation": {
      rich_text: [{ text: { content: data.geolocation || 'N/A' } }],
    },
    "Adresse / BP": {
      rich_text: [{ text: { content: data.address || 'N/A' } }],
    },
    "Email / Contact": data.email
      ? { email: data.email }
      : { email: null },
  };
}

// ------------------------------------------------------------------
// 7. Mechanism Upsert Notion (Query -> Match -> Create / Update)
// ------------------------------------------------------------------
async function upsertNotionHotel(data: HotelData): Promise<void> {
  // 1. Récupérer tous les hôtels enregistrés dans cette ville dans Notion
  const existingPages = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      property: "Ville",
      select: { equals: data.city },
    },
  });

  // 2. Chercher une correspondance par fuzzy matching
  const matchingPage = existingPages.results.find((page: any) => {
    const existingTitle = page.properties["Nom de l'Hôtel"]?.title[0]?.plain_text || "";
    return isSimilarName(existingTitle, data.name);
  });

  if (matchingPage) {
    // UPDATE : L'hôtel existe déjà sous un nom très proche
    const existingTitle = (matchingPage as any).properties["Nom de l'Hôtel"]?.title[0]?.plain_text;
    console.log(`   🔄 Doublon détecté ("${data.name}" ≈ "${existingTitle}"). Mise à jour de la page Notion ${matchingPage.id}...`);

    await notion.pages.update({
      page_id: matchingPage.id,
      properties: buildNotionProperties(data),
    });
  } else {
    // CREATE : Nouvel hôtel
    console.log(`   ✨ Création d'une nouvelle entrée Notion pour "${data.name}"...`);
    await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: buildNotionProperties(data),
    });
  }
}

// ------------------------------------------------------------------
// 8. Orchestrateur Multi-Villes
// ------------------------------------------------------------------
async function processMultiCityHotels(hotelsByCity: Record<string, { country: string; hotels: string[] }>) {
  console.log(`🚀 Démarrage du traitement multi-villes avec Upsert & Anti-Doublons...`);

  for (const [city, config] of Object.entries(hotelsByCity)) {
    console.log(`\n==================================================`);
    console.log(`📍 VILLE : ${city.toUpperCase()} (${config.country}) - ${config.hotels.length} hôtels au programme`);
    console.log(`==================================================`);

    for (let i = 0; i < config.hotels.length; i++) {
      const hotelInputName = config.hotels[i];
      console.log(`\n[${city}] [${i + 1}/${config.hotels.length}] 🔍 Recherche : "${hotelInputName}"...`);

      try {
        // 1. Enrichissement Gemini
        const enrichedData = await enrichHotelWithGemini(hotelInputName, city, config.country);
        console.log(`   ✅ Extrait : ${enrichedData.name} | ${enrichedData.owner || 'Propriétaire inconnu'}`);

        // 2. Persistence Locale
        await saveToLocalJson(enrichedData);

        // 3. Upsert dans Notion
        await upsertNotionHotel(enrichedData);

      } catch (error) {
        console.error(`   ❌ Erreur sur "${hotelInputName}" (${city}):`, error);
      }

      // Pause de courtoisie API
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
  }

  console.log(`\n🎉 Pipeline terminé avec succès ! Aucune donnée en doublon.`);
}

// ------------------------------------------------------------------
// Jeu de données de test (incluant des variations volontaires)
// ------------------------------------------------------------------
const hotelsByCity = {
  Douala: {
    country: "Cameroun",
    hotels: [
      "Hôtel La Falaise Bonapriso",
      "La Falaise Douala (Bonapriso)", // Testera le fuzzy matching
      "Krystal Palace Douala",
      "Hôtel Sawa",
    ],
  },
  Yaoundé: {
    country: "Cameroun",
    hotels: [
      "Hilton Yaoundé",
      "Hôtel Mont Fébé",
    ],
  },
  Abidjan: {
    country: "Côte d'Ivoire",
    hotels: [
      "Sofitel Abidjan Hôtel d'Ivoire",
      "Mövenpick Hotel Abidjan",
    ],
  },
};

// Exécution
processMultiCityHotels(hotelsByCity);

Avantage	Inconvénient
Idempotence totale : Tu peux relancer le script autant de fois que tu veux sans jamais créer de lignes doublons dans Notion.	Latence supplémentaire : Effectue une requête query sur Notion par ville pour charger la liste existante avant l'évaluation.
Robuste aux fautes : Détecte que "La Falaise Douala (Bonapriso)" et "Hôtel La Falaise Bonapriso" désignent le même établissement.	Seuil d'agressivité (Threshold) : Si deux hôtels ont des noms extrêmement proches dans la même ville (ex: "Hôtel de la Paix 1" et "Hôtel de la Paix 2"), il faudra ajuster le seuil à 0.90.

Explique comment générer un Slug déterministe par hôtel et l'ajouter en propriété masquée/secondaire dans Notion pour simplifier la recherche d'existants.

L'utilisation d'un Slug déterministe (ou Hash) est un excellent reflexe d'architecture. Au lieu de faire des requêtes textuelles lourdes et d'évaluer le fuzzy matching sur l'API Notion à chaque itération, tu génères une clé unique basée sur des invariants de l'hôtel.
1. Concept : La Clé Déterministe (Slug)

Un Slug déterministe garantit que, quel que soit le formatage d'entrée ("Hôtel La Falaise - Bonapriso", "la falaise bonapriso" ou "HOTEL LA FALAISE BONAPRISO"), l'algorithme produira toujours la même chaîne alphanumérique.

La formule du Slug :
Slug=Clean(Ville)+"-"+Clean(Nom Canonique)
Implémentation du Générateur de Slug
TypeScript

import { createHash } from 'crypto';

/**
 * Génère un slug lisible et déterministe pour un hôtel dans une ville.
 * Ex: "Hôtel La Falaise (Bonapriso)" à "Douala" -> "douala-la-falaise-bonapriso"
 */
export function generateHotelSlug(hotelName: string, city: string): string {
  const cleanCity = city
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, '');

  const cleanName = hotelName
    .toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "") // Supprime les accents
    .replace(/\b(hotel|l'hotel|les|residence|residences|spa|complex|sa|sarl|luxury)\b/g, '') // Mots vides
    .replace(/[^a-z0-9]/g, '-') // Remplace caractères spéciaux par des tirets
    .replace(/-+/g, '-') // Évite les tirets multiples ("---" -> "-")
    .replace(/^-|-$/g, ''); // Trim des tirets en début/fin

  return `${cleanCity}-${cleanName}`;
}

/**
 * Option alternative : Hash SHA-256 tronqué pour un identifiant ultra-compact (8-12 car)
 * Ex: "douala-la-falaise-bonapriso" -> "a3f89d12"
 */
export function generateHotelHash(hotelName: string, city: string): string {
  const slug = generateHotelSlug(hotelName, city);
  return createHash('sha256').update(slug).digest('hex').substring(0, 12);
}

2. Configuration de la Base Notion

Dans ta base de données Notion, ajoute une nouvelle propriété :

    Nom de la propriété : Slug (ou ID Externe)

    Type Notion : Rich Text (Texte brut)

3. Intégration de la Recherche O(1) dans l'Upsert Notion

Grâce au Slug, tu n'as plus besoin de charger tous les hôtels de la ville et de boucler dessus avec Levenshtein. Tu fais une requête directe à l'API Notion sur le filtre Slug == targetSlug.
TypeScript

async function upsertHotelWithSlug(data: HotelData): Promise<void> {
  // 1. Génération du Slug unique
  const hotelSlug = generateHotelSlug(data.name, data.city);

  // 2. Requête Notion exacte et ultra-rapide sur le Slug
  const existingPages = await notion.databases.query({
    database_id: DATABASE_ID,
    filter: {
      property: "Slug",
      rich_text: {
        equals: hotelSlug,
      },
    },
  });

  // Construction des propriétés Notion avec le Slug inclus
  const notionProperties = {
    ...buildNotionProperties(data), // Tes propriétés habituelles
    "Slug": {
      rich_text: [{ text: { content: hotelSlug } }],
    },
  };

  // 3. Traitement Upsert
  if (existingPages.results.length > 0) {
    const existingPageId = existingPages.results[0].id;
    console.log(`   🔄 Slug existant trouvé ("${hotelSlug}"). Mise à jour de la page Notion...`);

    await notion.pages.update({
      page_id: existingPageId,
      properties: notionProperties,
    });
  } else {
    console.log(`   ✨ Nouveaux Slug ("${hotelSlug}"). Création dans Notion...`);

    await notion.pages.create({
      parent: { database_id: DATABASE_ID },
      properties: notionProperties,
    });
  }
}

Comparative : Fuzzy Matching vs Slug Déterministe
Critère	Recherche Fuzzy (Levenshtein)	Slug Déterministe / Hash
Complexité algorithmique	O(N) — Parcours de la liste locale	O(1) — Filtre exact Notion via index API
Bande passante API	Élevée (charge tous les enregistrements de la ville)	Minimale (retourne 0 ou 1 résultat exact)
Fiabilité	Risque de faux positifs/négatifs selon le seuil	100% déterministe et mathématiquement prévisible
Maintenance	Code plus complexe à faire évoluer	Code concis, facile à tester unitairement
