export const CONTRIBUTION_KINDS = ['error', 'knowledge', 'memory', 'question'] as const;
export type ContributionKind = (typeof CONTRIBUTION_KINDS)[number];

export const CONTRIBUTION_STATUSES = ['open', 'in_progress', 'accepted', 'rejected'] as const;
export type ContributionStatus = (typeof CONTRIBUTION_STATUSES)[number];

export interface ContributionEntity {
  type: string;
  id: string;
}

export interface ContributionPhoto {
  blobUrl: string;
  pathname: string;
  mimeType: string;
  sizeBytes: number;
}

export interface ContributionResolution {
  note: string;
  incorporatedInCommit: string;
  editorNote: string;
  rejectedReason: string;
}

export interface ContributionSubmitter {
  email: string;
  viewerId?: string;
  displayName?: string;
}

export interface ContributionFrontmatter {
  id: string;
  kind: ContributionKind;
  submittedBy: ContributionSubmitter;
  submittedAt: string;
  url: string;
  entity?: ContributionEntity;
  selector?: string;
  anchorAttribute?: string;
  routeContext?: Record<string, unknown>;
  quotedText?: string;
  viewport?: string;
  title?: string;
  when?: string;
  where?: string;
  photo?: ContributionPhoto;
  status: ContributionStatus;
  statusUpdatedAt: string;
  resolution: ContributionResolution;
}

export interface ContributionIndexEntry {
  id: string;
  path: string;
  kind: ContributionKind;
  submitterEmailHash: string;
  submittedAt: string;
  status: ContributionStatus;
  statusUpdatedAt: string;
  entityType?: string;
  entityId?: string;
}

export interface ContributionsIndexFile {
  schemaVersion: 1;
  rebuiltAt: string;
  items: ContributionIndexEntry[];
}

export interface ContributionRecord extends ContributionFrontmatter {
  path: string;
  body: string;
}

export interface CreateContributionInput {
  kind: ContributionKind;
  body: string;
  url: string;
  selector?: string;
  entity?: ContributionEntity;
  routeContext?: Record<string, unknown>;
  quotedText?: string;
  viewport?: string;
  title?: string;
  when?: string;
  where?: string;
}
