'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { siteConfig } from '@/lib/siteConfig';

interface MiniTreeNode {
  id: string;
  type?: 'person' | 'family';
  name: string;
  sex: 'M' | 'F' | 'U' | string;
  birthYear?: number;
  deathYear?: number;
  parentIds?: string[];
  childIds?: string[];
  partnerIds?: string[];
  x?: number;
  y?: number;
  generation?: number;
}

interface MiniTreeEdge {
  source: string;
  target: string;
}

interface MiniPedigreeTreeProps {
  personId: string;
  maxGenerations?: number;
  height?: number;
  className?: string;
}

const MINI_CARD = {
  width: 120,
  height: 50,
  hGap: 20,
  vGap: 40,
};

const MINI_TREE_COLORS = {
  canvas: '#f5f0e6',
  male: {
    border: '#161087',
    background: '#e8e8f4',
  },
  female: {
    border: '#5d8400',
    background: '#eef4e8',
  },
  unknown: {
    border: '#6b7280',
    background: '#f3f4f6',
  },
};

export function MiniPedigreeTree({
  personId,
  maxGenerations = 4,
  height = 400,
  className = '',
}: MiniPedigreeTreeProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);

  const [nodes, setNodes] = useState<MiniTreeNode[]>([]);
  const [dimensions, setDimensions] = useState({ width: 400, height });
  const [transform, setTransform] = useState({ x: 0, y: 0, scale: 0.6 });
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  useEffect(() => {
    async function fetchTree() {
      setIsLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams({
          rootPersonId: personId,
          viewMode: 'ancestors',
          maxGenerations: String(maxGenerations),
        });

        const response = await fetch(
          `/api/tree/${siteConfig.defaultTreeId}/graph?${params}`,
        );
        if (!response.ok) throw new Error('Failed to load tree data');

        const data = await response.json();
        setNodes(data.nodes || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load');
      } finally {
        setIsLoading(false);
      }
    }

    fetchTree();
  }, [personId, maxGenerations]);

  const layoutNodes = React.useMemo(() => {
    if (nodes.length === 0) return [];

    const positioned: MiniTreeNode[] = [];
    const positionedIds = new Set<string>();
    const people = nodes.filter((n) => n.type !== 'family');
    const nodeMap = new Map(people.map((n) => [n.id, n]));

    const rootNode = nodeMap.get(personId);
    if (!rootNode) return [];

    const getDisplayKey = (id: string) => {
      const node = nodeMap.get(id);
      if (!node) return id;
      const birth = node.birthYear ?? '';
      const death = node.deathYear ?? '';
      return `${node.name}|${birth}|${death}`;
    };

    const uniqueByDisplayKey = (ids: string[]) => {
      const seenKeys = new Set<string>();
      const unique: string[] = [];
      for (const id of ids) {
        const key = getDisplayKey(id);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        unique.push(id);
      }
      return unique;
    };

    const parents = uniqueByDisplayKey(
      (rootNode.parentIds ?? []).filter((id) => nodeMap.has(id)),
    );
    const children = uniqueByDisplayKey(
      (rootNode.childIds ?? []).filter((id) => nodeMap.has(id)),
    );
    const spouses = uniqueByDisplayKey(
      (rootNode.partnerIds ?? []).filter((id) => nodeMap.has(id)),
    );

    const centerX = MINI_CARD.width + MINI_CARD.hGap * 2;
    const parentX = 0;
    const childX = (MINI_CARD.width + MINI_CARD.hGap * 2) * 2;
    const baseY = 0;
    const rowGap = MINI_CARD.height + MINI_CARD.vGap;

    if (!positionedIds.has(rootNode.id)) {
      positionedIds.add(rootNode.id);
      positioned.push({
        ...rootNode,
        x: centerX,
        y: baseY,
        generation: 0,
      });
    }

    if (spouses.length > 0) {
      const spouseStartY = baseY + (rowGap * (spouses.length - 1)) / -2;
      spouses.forEach((id, index) => {
        const node = nodeMap.get(id);
        if (!node) return;
        const y = spouseStartY + index * rowGap;
        if (y === baseY || positionedIds.has(node.id)) return;
        positionedIds.add(node.id);
        positioned.push({
          ...node,
          x: centerX,
          y,
          generation: 0,
        });
      });
    }

    const parentStartY = baseY + (rowGap * (parents.length - 1)) / -2;
    parents.forEach((id, index) => {
      const node = nodeMap.get(id);
      if (!node || positionedIds.has(node.id)) return;
      positionedIds.add(node.id);
      positioned.push({
        ...node,
        x: parentX,
        y: parentStartY + index * rowGap,
        generation: -1,
      });
    });

    const childStartY = baseY + (rowGap * (children.length - 1)) / -2;
    children.forEach((id, index) => {
      const node = nodeMap.get(id);
      if (!node || positionedIds.has(node.id)) return;
      positionedIds.add(node.id);
      positioned.push({
        ...node,
        x: childX,
        y: childStartY + index * rowGap,
        generation: 1,
      });
    });

    return positioned;
  }, [nodes, personId]);

  const localEdges = React.useMemo((): MiniTreeEdge[] => {
    if (nodes.length === 0) return [];

    const people = nodes.filter((n) => n.type !== 'family');
    const nodeMap = new Map(people.map((n) => [n.id, n]));
    const rootNode = nodeMap.get(personId);
    if (!rootNode) return [];

    const getDisplayKey = (id: string) => {
      const node = nodeMap.get(id);
      if (!node) return id;
      const birth = node.birthYear ?? '';
      const death = node.deathYear ?? '';
      return `${node.name}|${birth}|${death}`;
    };

    const uniqueByDisplayKey = (ids: string[]) => {
      const seenKeys = new Set<string>();
      const unique: string[] = [];
      for (const id of ids) {
        const key = getDisplayKey(id);
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        unique.push(id);
      }
      return unique;
    };

    const parents = uniqueByDisplayKey(
      (rootNode.parentIds ?? []).filter((id) => nodeMap.has(id)),
    );
    const children = uniqueByDisplayKey(
      (rootNode.childIds ?? []).filter((id) => nodeMap.has(id)),
    );
    const spouses = uniqueByDisplayKey(
      (rootNode.partnerIds ?? []).filter((id) => nodeMap.has(id)),
    );

    const edgesLocal: MiniTreeEdge[] = [];
    for (const parentId of parents) {
      edgesLocal.push({ source: parentId, target: personId });
    }
    for (const childId of children) {
      edgesLocal.push({ source: personId, target: childId });
      for (const spouseId of spouses) {
        edgesLocal.push({ source: spouseId, target: childId });
      }
    }

    return edgesLocal;
  }, [nodes, personId]);

  useEffect(() => {
    if (!containerRef.current) return;

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;

      setDimensions({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      });
    });

    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, []);

  const zoomIn = useCallback(() => {
    setTransform((prev) => {
      const newScale = Math.min(2, prev.scale * 1.3);
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;
      const scaleChange = newScale / prev.scale;
      return {
        x: centerX - (centerX - prev.x) * scaleChange,
        y: centerY - (centerY - prev.y) * scaleChange,
        scale: newScale,
      };
    });
  }, [dimensions]);

  const zoomOut = useCallback(() => {
    setTransform((prev) => {
      const newScale = Math.max(0.3, prev.scale / 1.3);
      const centerX = dimensions.width / 2;
      const centerY = dimensions.height / 2;
      const scaleChange = newScale / prev.scale;
      return {
        x: centerX - (centerX - prev.x) * scaleChange,
        y: centerY - (centerY - prev.y) * scaleChange,
        scale: newScale,
      };
    });
  }, [dimensions]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      setIsDragging(true);
      setDragStart({ x: e.clientX - transform.x, y: e.clientY - transform.y });
    },
    [transform.x, transform.y],
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!isDragging) return;
      setTransform((prev) => ({
        ...prev,
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      }));
    },
    [isDragging, dragStart],
  );

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const fitToScreen = useCallback(() => {
    if (layoutNodes.length === 0) return;

    const minX = Math.min(...layoutNodes.map((n) => n.x ?? 0));
    const maxX = Math.max(
      ...layoutNodes.map((n) => (n.x ?? 0) + MINI_CARD.width),
    );
    const minY = Math.min(...layoutNodes.map((n) => n.y ?? 0));
    const maxY = Math.max(
      ...layoutNodes.map((n) => (n.y ?? 0) + MINI_CARD.height),
    );

    const treeWidth = maxX - minX + 40;
    const treeHeight = maxY - minY + 40;
    const scaleX = dimensions.width / treeWidth;
    const scaleY = dimensions.height / treeHeight;
    const scale = Math.min(scaleX, scaleY, 1) * 0.9;

    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    setTransform({
      x: dimensions.width / 2 - centerX * scale,
      y: dimensions.height / 2 - centerY * scale,
      scale,
    });
  }, [layoutNodes, dimensions]);

  useEffect(() => {
    if (layoutNodes.length === 0 || dimensions.width <= 100) return;
    const timer = setTimeout(fitToScreen, 50);
    return () => clearTimeout(timer);
  }, [layoutNodes.length, dimensions.width, dimensions.height, fitToScreen]);

  const renderConnections = () => {
    const elements: React.ReactElement[] = [];
    const nodePositions = new Map(
      layoutNodes.map((n) => [n.id, { x: n.x ?? 0, y: n.y ?? 0 }]),
    );
    const seen = new Set<string>();

    for (const edge of localEdges) {
      const parentPos = nodePositions.get(edge.source);
      const childPos = nodePositions.get(edge.target);
      if (!parentPos || !childPos) continue;

      const key = `${edge.source}-${edge.target}`;
      if (seen.has(key)) continue;
      seen.add(key);

      const startX = parentPos.x + MINI_CARD.width;
      const startY = parentPos.y + MINI_CARD.height / 2;
      const endX = childPos.x;
      const endY = childPos.y + MINI_CARD.height / 2;
      const midX = (startX + endX) / 2;
      const path = `M ${startX} ${startY} L ${midX} ${startY} L ${midX} ${endY} L ${endX} ${endY}`;

      elements.push(
        <path
          key={`edge-${edge.source}-${edge.target}`}
          d={path}
          fill="none"
          stroke="#9ca3af"
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.7}
        />,
      );
    }

    return elements;
  };

  if (isLoading) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ height }}
      >
        <div className="text-gray-400 text-sm">Loading family tree...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className={`flex items-center justify-center ${className}`}
        style={{ height }}
      >
        <div className="text-red-500 text-sm">{error}</div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        width: '100%',
        height,
        backgroundColor: MINI_TREE_COLORS.canvas,
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <svg
        width={dimensions.width}
        height={dimensions.height}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          cursor: isDragging ? 'grabbing' : 'grab',
        }}
      >
        <g
          transform={`translate(${transform.x}, ${transform.y}) scale(${transform.scale})`}
        >
          {renderConnections()}

          {layoutNodes.map((node) => {
            const isFocusPerson = node.id === personId;
            const palette =
              node.sex === 'F'
                ? MINI_TREE_COLORS.female
                : node.sex === 'M'
                  ? MINI_TREE_COLORS.male
                  : MINI_TREE_COLORS.unknown;

            return (
              <g
                key={node.id}
                transform={`translate(${node.x ?? 0}, ${node.y ?? 0})`}
                style={{ cursor: 'pointer' }}
                onClick={() => router.push(`/person/${node.id}`)}
              >
                <rect
                  width={MINI_CARD.width}
                  height={MINI_CARD.height}
                  rx={6}
                  fill={palette.background}
                  stroke={isFocusPerson ? '#161087' : palette.border}
                  strokeWidth={isFocusPerson ? 2 : 1}
                />
                <text
                  x={MINI_CARD.width / 2}
                  y={18}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={500}
                  fill="#1f2937"
                >
                  {node.name.split(' ').slice(0, 2).join(' ')}
                </text>
                {node.birthYear && (
                  <text
                    x={MINI_CARD.width / 2}
                    y={35}
                    textAnchor="middle"
                    fontSize={9}
                    fill="#6b7280"
                  >
                    {node.birthYear}
                    {node.deathYear ? `-${node.deathYear}` : ''}
                  </text>
                )}
              </g>
            );
          })}
        </g>
      </svg>

      <div className="absolute bottom-3 right-3 flex flex-col gap-1">
        <button
          onClick={zoomIn}
          className="w-8 h-8 bg-white/90 hover:bg-white border border-gray-300 rounded-lg shadow-sm flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors"
          title="Zoom in"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6v12M6 12h12"
            />
          </svg>
        </button>
        <button
          onClick={zoomOut}
          className="w-8 h-8 bg-white/90 hover:bg-white border border-gray-300 rounded-lg shadow-sm flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors"
          title="Zoom out"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 12h12"
            />
          </svg>
        </button>
        <button
          onClick={fitToScreen}
          className="w-8 h-8 bg-white/90 hover:bg-white border border-gray-300 rounded-lg shadow-sm flex items-center justify-center text-gray-600 hover:text-gray-900 transition-colors"
          title="Fit to screen"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
