// ---------------------------------------------------------------------------
// Types for the API response
// ---------------------------------------------------------------------------
export interface ApiNode {
  id: string;
  type?: 'person' | 'family';
  name: string;
  sex: string;
  birthYear?: number;
  deathYear?: number;
  isLiving: boolean;
  photoUrl?: string;
  originCountry?: string;
  birthCountry?: string;
  deathCountry?: string;
  parentIds?: string[];
  childIds?: string[];
  partnerIds?: string[];
  layoutHidden?: boolean;
}

// ---------------------------------------------------------------------------
// Types for family-chart data format (v0.9.0+)
// ---------------------------------------------------------------------------
export interface FamilyChartDatum {
  id: string;
  data: {
    gender: 'M' | 'F';
    'first name': string;
    'last name': string;
    birthday: string;
    deathday: string;
    avatar: string;
    _fullName: string;
    _isLiving: boolean;
    _sex: 'M' | 'F' | 'U';
    _originCountry: string;
    _deathCountry: string;
  };
  rels: {
    parents: string[];
    spouses: string[];
    children: string[];
  };
}

// ---------------------------------------------------------------------------
// Transform API data into family-chart format (bilateral ancestry)
// ---------------------------------------------------------------------------
export function transformData(apiNodes: ApiNode[]): FamilyChartDatum[] {
  // 1. Filter: only person nodes (skip family nodes)
  const personNodes = apiNodes.filter(
    (n) => n.type === 'person' || n.type === undefined,
  );

  // Build a lookup set so we can validate references
  const personIdSet = new Set(personNodes.map((n) => n.id));

  // ---------------------------------------------------------------------------
  // Bilateral ancestry rules:
  //   - Each child can have up to 2 parents in rels.parents
  //   - BOTH parents list the child in rels.children
  //   - Spouses are inferred: if two people share a child, they're spouses
  //   - The library reads rels.parents[0] AND rels.parents[1] directly
  // ---------------------------------------------------------------------------

  // Step 1: For each person, determine their valid parents (up to 2)
  const childToParents = new Map<string, string[]>();
  for (const node of personNodes) {
    const validParents = (node.parentIds || []).filter(
      (id) => personIdSet.has(id) && id !== node.id,
    );
    if (validParents.length > 0) {
      childToParents.set(node.id, validParents.slice(0, 2));
    }
  }

  // Step 2: Build children lists — BOTH parents get the child
  const parentToChildren = new Map<string, string[]>();
  for (const [childId, parents] of childToParents) {
    for (const parentId of parents) {
      if (!parentToChildren.has(parentId)) {
        parentToChildren.set(parentId, []);
      }
      parentToChildren.get(parentId)!.push(childId);
    }
  }

  // Step 3: Infer spouses from shared parenthood
  const spouseMap = new Map<string, Set<string>>();

  function addSpouse(a: string, b: string) {
    if (a === b) return;
    if (!spouseMap.has(a)) spouseMap.set(a, new Set());
    if (!spouseMap.has(b)) spouseMap.set(b, new Set());
    spouseMap.get(a)!.add(b);
    spouseMap.get(b)!.add(a);
  }

  // Infer from shared children
  for (const [, parents] of childToParents) {
    if (parents.length === 2) {
      addSpouse(parents[0], parents[1]);
    }
  }

  // Also add explicit partner relationships from the API
  for (const node of personNodes) {
    for (const partnerId of node.partnerIds || []) {
      if (personIdSet.has(partnerId)) {
        addSpouse(node.id, partnerId);
      }
    }
  }

  // Step 4: Build the output
  return personNodes.map((node) => {
    const nameParts = (node.name || '').trim().split(/\s+/);
    const firstName = nameParts.slice(0, -1).join(' ') || nameParts[0] || '';
    const lastName =
      nameParts.length > 1 ? nameParts[nameParts.length - 1] : '';

    const parents = childToParents.get(node.id) || [];
    const spouses = Array.from(spouseMap.get(node.id) || []);
    const children = parentToChildren.get(node.id) || [];

    const birthday = node.birthYear != null ? String(node.birthYear) : '';
    const deathday = node.deathYear != null ? String(node.deathYear) : '';

    return {
      id: node.id,
      data: {
        gender: node.sex === 'F' ? 'F' : 'M',
        _sex: node.sex === 'F' ? 'F' : node.sex === 'M' ? 'M' : 'U',
        'first name': firstName,
        'last name': lastName,
        birthday,
        deathday,
        avatar: node.photoUrl || '',
        _fullName: node.name || '',
        _isLiving: node.isLiving,
        _originCountry: node.originCountry || node.birthCountry || '',
        _deathCountry: node.deathCountry || '',
      },
      rels: {
        parents,
        spouses,
        children,
      },
    };
  });
}
