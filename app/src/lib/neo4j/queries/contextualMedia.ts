/**
 * Neo4j queries for contextual media
 */

import { executeQuery } from '../client';

export interface ContextualMediaItem {
  id: string;
  type: string;
  name: string;
  relevance: string;
  badge?: string;
  featured?: boolean;
  year?: string;
  findagraveUrl?: string;
  wikimedia?: {
    fileTitle?: string;
    imageUrl?: string;
    thumbnailUrl?: string;
    attribution?: string;
    license?: string;
  };
  wikipedia?: {
    url?: string;
    summary?: string;
    title?: string;
    coordinates?: {
      lat?: number;
      lng?: number;
    };
  };
  googleMaps?: {
    url?: string;
    embedUrl?: string;
    coordinates?: {
      lat?: number;
      lng?: number;
    };
  };
}

interface ContextualMediaRecord {
  cm: {
    id: string;
    itemId?: string;
    type?: string;
    name?: string;
    relevance?: string;
    badge?: string;
    featured?: boolean;
    year?: string;
    findagraveUrl?: string;
    wikimediaFileTitle?: string;
    wikimediaImageUrl?: string;
    wikimediaThumbnailUrl?: string;
    wikimediaAttribution?: string;
    wikimediaLicense?: string;
    wikipediaUrl?: string;
    wikipediaSummary?: string;
    wikipediaTitle?: string;
    lat?: number;
    lng?: number;
    googleMapsUrl?: string;
    googleMapsEmbedUrl?: string;
  };
}

/**
 * Get contextual media items for a person from Neo4j
 */
export async function getPersonContextualMedia(
  personId: string,
): Promise<ContextualMediaItem[]> {
  const query = `
    MATCH (p:Person {id: $personId})-[:HAS_CONTEXT]->(cm:ContextualMedia)
    RETURN cm
    ORDER BY cm.type, cm.name
  `;

  const results = await executeQuery<ContextualMediaRecord>(query, {
    personId,
  });

  return results.map((row) => {
    const cm = row.cm;

    const item: ContextualMediaItem = {
      id: cm.itemId || cm.id,
      type: cm.type || '',
      name: cm.name || '',
      relevance: cm.relevance || '',
      badge: cm.badge || undefined,
      featured: cm.featured || undefined,
      year: cm.year || undefined,
      findagraveUrl: cm.findagraveUrl || undefined,
    };

    // Reconstruct wikimedia object if any properties exist
    if (
      cm.wikimediaImageUrl ||
      cm.wikimediaThumbnailUrl ||
      cm.wikimediaFileTitle
    ) {
      item.wikimedia = {
        fileTitle: cm.wikimediaFileTitle || undefined,
        imageUrl: cm.wikimediaImageUrl || undefined,
        thumbnailUrl: cm.wikimediaThumbnailUrl || undefined,
        attribution: cm.wikimediaAttribution || undefined,
        license: cm.wikimediaLicense || undefined,
      };
    }

    // Reconstruct wikipedia object if any properties exist
    if (cm.wikipediaUrl || cm.wikipediaSummary || cm.lat !== null) {
      item.wikipedia = {
        url: cm.wikipediaUrl || undefined,
        summary: cm.wikipediaSummary || undefined,
        title: cm.wikipediaTitle || undefined,
      };

      if (cm.lat != null && cm.lng != null) {
        item.wikipedia.coordinates = {
          lat: cm.lat,
          lng: cm.lng,
        };
      }
    }

    // Reconstruct googleMaps object if any properties exist
    if (cm.googleMapsUrl || cm.googleMapsEmbedUrl) {
      item.googleMaps = {
        url: cm.googleMapsUrl || undefined,
        embedUrl: cm.googleMapsEmbedUrl || undefined,
      };

      if (cm.lat != null && cm.lng != null) {
        item.googleMaps.coordinates = {
          lat: cm.lat,
          lng: cm.lng,
        };
      }
    }

    return item;
  });
}
