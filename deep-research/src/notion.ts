import { Client, isFullPage } from '@notionhq/client';
import type { HotelRecord } from './types.js';

/** Nom exact des propriétés attendues dans la base Notion (respecter la casse). */
export const NOTION_PROPS = {
  name: "Nom de l'Hôtel", // title
  city: 'Ville', // select
  category: 'Catégorie', // rich_text
  phone: 'Téléphone', // phone_number
  owner: 'Propriétaire / Promoteur', // rich_text
  management: 'Direction / Gouvernance', // rich_text
  confidence: 'Confiance gouvernance', // number
  district: 'Quartier', // rich_text
  geo: 'Géolocalisation', // rich_text
  address: 'Adresse / BP', // rich_text
  email: 'Email / Contact', // email
  website: 'Site web', // url
  sources: 'Sources', // rich_text
  status: 'Statut', // select
  slug: 'Slug', // rich_text
} as const;

const STATUS_LABEL: Record<HotelRecord['status'], string> = {
  auto: 'Auto',
  needs_review: 'À vérifier',
  verified: 'Vérifié',
};

const rt = (value: string | null | undefined) => ({
  rich_text: value ? [{ text: { content: value.slice(0, 1900) } }] : [],
});

export function buildProperties(r: HotelRecord): Record<string, unknown> {
  const geo = r.latitude != null && r.longitude != null ? `${r.latitude}, ${r.longitude}` : null;
  return {
    [NOTION_PROPS.name]: { title: [{ text: { content: r.name.slice(0, 1900) } }] },
    [NOTION_PROPS.city]: { select: { name: r.city } },
    [NOTION_PROPS.category]: rt(r.category),
    [NOTION_PROPS.phone]: { phone_number: r.phoneE164 ?? r.phone ?? null },
    [NOTION_PROPS.owner]: rt(r.owner ?? 'Non identifié'),
    [NOTION_PROPS.management]: rt(r.management ?? 'Non identifié'),
    [NOTION_PROPS.confidence]: { number: Number(r.governanceConfidence.toFixed(2)) },
    [NOTION_PROPS.district]: rt(r.district),
    [NOTION_PROPS.geo]: rt(geo),
    [NOTION_PROPS.address]: rt(r.address),
    [NOTION_PROPS.email]: { email: r.email ?? null },
    [NOTION_PROPS.website]: { url: r.website ?? null },
    [NOTION_PROPS.sources]: rt(r.sources.join('\n')),
    [NOTION_PROPS.status]: { select: { name: STATUS_LABEL[r.status] } },
    [NOTION_PROPS.slug]: rt(r.slug),
  };
}

export class NotionSink {
  private readonly notion: Client;
  constructor(
    apiKey: string,
    private readonly databaseId: string,
  ) {
    this.notion = new Client({ auth: apiKey });
  }

  /** Vérifie que la base est accessible et que les propriétés clés existent. */
  async verifySchema(): Promise<void> {
    const db = await this.notion.databases.retrieve({ database_id: this.databaseId });
    const props = 'properties' in db ? Object.keys(db.properties) : [];
    const missing = Object.values(NOTION_PROPS).filter((p) => !props.includes(p));
    if (missing.length) {
      throw new Error(
        `Propriétés Notion manquantes : ${missing.join(', ')}\n` +
          `Crée-les dans la base (voir le README pour les types).`,
      );
    }
  }

  /** Crée ou met à jour la page dont le Slug correspond. */
  async upsert(record: HotelRecord): Promise<'created' | 'updated'> {
    const found = await this.notion.databases.query({
      database_id: this.databaseId,
      filter: { property: NOTION_PROPS.slug, rich_text: { equals: record.slug } },
      page_size: 1,
    });

    const properties = buildProperties(record) as never;
    const existing = found.results[0];
    if (existing && isFullPage(existing)) {
      await this.notion.pages.update({ page_id: existing.id, properties });
      return 'updated';
    }
    await this.notion.pages.create({ parent: { database_id: this.databaseId }, properties });
    return 'created';
  }
}
