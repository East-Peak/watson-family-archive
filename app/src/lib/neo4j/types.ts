// Neo4j Node Types

export interface Neo4jPerson {
  id: string;
  gedcomId?: string;
  fullName: string;
  givenName?: string;
  surname?: string;
  suffix?: string;
  nickname?: string;
  title?: string;
  sex: 'M' | 'F' | 'U';
  birthDate?: string;
  birthYear?: number;
  birthPlace?: string;
  deathDate?: string;
  deathYear?: number;
  deathPlace?: string;
  isLiving: boolean;
  biography?: string;
  verificationStatus?: string;
  confidenceGrade?: string;
  wikitreeId?: string;
  findagraveId?: string;
  familysearchTreeId?: string;
  sources?: string; // JSON string from Neo4j
  completenessScore?: number;
  researchScore?: number;
  validationStatus?: string;
  completeness_tier?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Neo4jPlace {
  id: string;
  name: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
  geonamesId?: string;
}

export interface Neo4jTree {
  id: string;
  name: string;
  description?: string;
  isPublic: boolean;
  rootPersonId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface Neo4jUser {
  id: string;
  email: string;
  name: string;
  avatarUrl?: string;
  authProvider?: string;
  createdAt?: string;
  lastLoginAt?: string;
}

export interface Neo4jMedia {
  id: string;
  filename: string;
  path: string;
  type: 'photo' | 'document' | 'gravestone' | 'obituary';
  mimeType?: string;
  caption?: string;
  date?: string;
  isPortrait: boolean;
}

// Relationship Types

export interface SpouseRelationship {
  marriageDate?: string;
  marriageYear?: number;
  divorceDate?: string;
  marriageOrder?: number;
}

export interface ParentRelationship {
  type: 'biological' | 'adoptive' | 'step';
}

// Query Result Types

export interface PersonWithFamily extends Neo4jPerson {
  father?: { id: string; name: string; birthYear?: number };
  mother?: { id: string; name: string; birthYear?: number };
  spouses?: Array<{
    id: string;
    name: string;
    birthYear?: number;
    marriageYear?: number;
    marriagePlace?: string;
  }>;
  children?: Array<{ id: string; name: string; birthYear?: number }>;
  siblings?: Array<{ id: string; name: string; birthYear?: number }>;
}

export interface TreeGraphNode {
  id: string;
  type?: 'person' | 'family';
  name: string;
  sex: 'M' | 'F' | 'U';
  birthYear?: number;
  deathYear?: number;
  isLiving: boolean;
  photoUrl?: string;
  birthPlace?: string;
  originCountry?: string;
  birthCountry?: string;
  deathCountry?: string;
  img?: string;
  generation?: number;
  siblingCount?: number;
  childrenCount?: number;
  childrenCountTotal?: number;
  hasParents?: boolean;
  hasChildren?: boolean;
  parentIds?: string[];
  childIds?: string[];
  partnerIds?: string[];
  layoutHidden?: boolean;
}

export interface TreeGraphEdge {
  source: string;
  target: string;
  type: 'parent-child' | 'partner' | 'spouse';
}

export interface TreeGraphData {
  nodes: TreeGraphNode[];
  edges: TreeGraphEdge[];
}

export interface RelationshipPath {
  pathNodes: Array<{
    id: string;
    name: string;
    sex: string;
    birthYear?: number;
  }>;
  relationshipTypes: string[];
  commonAncestor?: {
    id: string;
    name: string;
    generationsFrom1: number;
    generationsFrom2: number;
  };
  relationshipLabel: string;
}

// API Response Types

export interface ApiResponse<T> {
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
