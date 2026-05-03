export interface FeedEntry {
  id: string;
  date: string;
  category: 'research' | 'person' | 'site-update' | 'editorial';
  headline: string;
  body?: string;
  people?: string[];
  count?: number;
  source: 'frontmatter' | 'git' | 'research' | 'editorial';
  pinned?: boolean;
}

export interface ActivityFeedFile {
  generatedAt: string;
  entries: FeedEntry[];
}

export interface ActivityApiResponse {
  entries: FeedEntry[];
  total: number;
  page: number;
  pages: number;
  generatedAt: string;
}
