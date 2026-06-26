import type { FamilyChartDatum } from '../transformData';

export function collectVisiblePersonIds(
  data: FamilyChartDatum[],
  focusPersonId: string | null,
  ancestryDepth: number,
  progenyDepth: number,
): string[] {
  if (data.length === 0) {
    return [];
  }

  const nodeMap = new Map(data.map((node) => [node.id, node]));

  if (!focusPersonId || !nodeMap.has(focusPersonId)) {
    return data.map((node) => node.id);
  }

  const visibleIds = new Set<string>();

  const walkUp = (personId: string, depth: number) => {
    if (depth < 0 || visibleIds.has(personId)) {
      if (depth < 0) return;
    }
    visibleIds.add(personId);
    const node = nodeMap.get(personId);
    if (!node || depth === 0) {
      return;
    }
    node.rels.parents.forEach((parentId) => {
      walkUp(parentId, depth - 1);
      const parentNode = nodeMap.get(parentId);
      parentNode?.rels.spouses.forEach((spouseId) => visibleIds.add(spouseId));
      parentNode?.rels.children.forEach((siblingId) =>
        visibleIds.add(siblingId),
      );
    });
  };

  const walkDown = (personId: string, depth: number) => {
    visibleIds.add(personId);
    const node = nodeMap.get(personId);
    if (!node) {
      return;
    }

    node.rels.spouses.forEach((spouseId) => visibleIds.add(spouseId));

    if (depth === 0) {
      return;
    }

    node.rels.children.forEach((childId) => {
      walkDown(childId, depth - 1);
    });
  };

  walkUp(focusPersonId, ancestryDepth);
  walkDown(focusPersonId, progenyDepth);

  nodeMap
    .get(focusPersonId)
    ?.rels.spouses.forEach((spouseId) => visibleIds.add(spouseId));
  nodeMap
    .get(focusPersonId)
    ?.rels.children.forEach((childId) => visibleIds.add(childId));
  nodeMap.get(focusPersonId)?.rels.parents.forEach((parentId) => {
    const parentNode = nodeMap.get(parentId);
    parentNode?.rels.children.forEach((siblingId) => visibleIds.add(siblingId));
  });

  return Array.from(visibleIds).filter((id) => nodeMap.has(id));
}
