'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { siteConfig } from '@/lib/siteConfig';
import { transformData, type FamilyChartDatum } from '../transformData';
import { collectVisiblePersonIds } from '../lib/visibility';
import { configureFamilyChart } from '../lib/configureChart';
import type { VisualizationCommand } from '@/types/visualization';

interface ApiResponse {
  nodes: import('../transformData').ApiNode[];
  edges: unknown[];
}

export type TreeStatus = 'loading' | 'ready' | 'error';

interface UseTreeChartControllerArgs {
  focusId: string | null;
  viewerId?: string | null;
  visualizationCommand: VisualizationCommand | null;
  clearVisualizationCommand: () => void;
  push: (href: string) => void;
  isSidebarOpen?: boolean;
}

export function useTreeChartController({
  focusId,
  viewerId,
  visualizationCommand,
  clearVisualizationCommand,
  push,
  isSidebarOpen,
}: UseTreeChartControllerArgs) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<ReturnType<
    typeof import('family-chart').createChart
  > | null>(null);
  const ancestryDepth = 5;
  const progenyDepth = 3;

  const [status, setStatus] = useState<TreeStatus>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [nodeCount, setNodeCount] = useState(0);
  const [drawerPersonId, setDrawerPersonId] = useState<string | null>(null);
  const [chartData, setChartData] = useState<FamilyChartDatum[]>([]);
  const [treeFocusPersonId, setTreeFocusPersonId] = useState<string | null>(
    focusId ?? viewerId ?? siteConfig.rootPersonId ?? null,
  );

  const visiblePersonIds = useMemo(
    () =>
      collectVisiblePersonIds(
        chartData,
        treeFocusPersonId,
        ancestryDepth,
        progenyDepth,
      ),
    [chartData, treeFocusPersonId],
  );

  const focusPerson = useCallback(
    (personId: string, openDrawer: boolean = true) => {
      if (openDrawer) {
        setDrawerPersonId(personId);
      }
      setTreeFocusPersonId(personId);
      if (chartRef.current) {
        chartRef.current.updateMainId(personId);
        chartRef.current.updateTree({
          tree_position: 'main_to_middle',
          transition_time: 600,
        });
      }
    },
    [],
  );

  const handleCloseDrawer = useCallback(() => setDrawerPersonId(null), []);

  const handleFocusPerson = useCallback(
    (personId: string) => {
      focusPerson(personId, true);
    },
    [focusPerson],
  );

  const fitToScreen = useCallback(() => {
    if (chartRef.current) {
      chartRef.current.updateTree({
        tree_position: 'fit',
        transition_time: 800,
      });
    }
  }, []);

  const findPersonIdForBranch = useCallback(
    (branch: string): string | null => {
      const normalizedBranch = branch.trim().toLowerCase();
      if (!normalizedBranch) return null;

      const exactSurnameMatch = chartData.find(
        (person) =>
          person.data['last name']?.toLowerCase() === normalizedBranch,
      );
      if (exactSurnameMatch) return exactSurnameMatch.id;

      const partialSurnameMatch = chartData.find((person) =>
        person.data['last name']?.toLowerCase().includes(normalizedBranch),
      );
      if (partialSurnameMatch) return partialSurnameMatch.id;

      const fullNameMatch = chartData.find((person) =>
        person.data._fullName?.toLowerCase().includes(normalizedBranch),
      );
      return fullNameMatch?.id ?? null;
    },
    [chartData],
  );

  useEffect(() => {
    let cancelled = false;

    async function init() {
      try {
        const res = await fetch(`/api/tree/${siteConfig.defaultTreeId}/graph`);
        if (!res.ok) throw new Error(`API returned ${res.status}`);
        const json: ApiResponse = await res.json();

        if (cancelled) return;

        const data = transformData(json.nodes);
        setChartData(data);
        setNodeCount(data.length);

        if (data.length === 0) {
          throw new Error('No person nodes found in API response');
        }

        const f3 = await import('family-chart');

        if (cancelled || !containerRef.current) return;

        containerRef.current.innerHTML = '';

        const chart = f3.createChart(containerRef.current, data);
        chartRef.current = chart;

        configureFamilyChart({
          chart,
          ancestryDepth,
          progenyDepth,
          onCardClick: (event, datum) => {
            if (event.ctrlKey || event.metaKey) {
              window.open(`/person/${datum.data.id}`, '_blank');
              return;
            }
            focusPerson(datum.data.id, true);
          },
        });

        const configuredRootId = siteConfig.rootPersonId;
        const mainId =
          focusId && data.find((person) => person.id === focusId)
            ? focusId
            : viewerId && data.find((person) => person.id === viewerId)
              ? viewerId
              : configuredRootId &&
                  data.find((person) => person.id === configuredRootId)
                ? configuredRootId
                : data[0]?.id;

        chart.updateMainId(mainId);
        setTreeFocusPersonId(mainId ?? null);
        chart.updateTree({ initial: true, tree_position: 'main_to_middle' });

        setTimeout(() => {
          if (!cancelled) {
            chart.updateTree({
              tree_position: 'main_to_middle',
              transition_time: 800,
            });
          }
        }, 200);

        setStatus('ready');
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to initialize family chart:', err);
          setErrorMsg(err instanceof Error ? err.message : String(err));
          setStatus('error');
        }
      }
    }

    init();
    return () => {
      cancelled = true;
    };
  }, [ancestryDepth, focusId, focusPerson, progenyDepth, viewerId]);

  useEffect(() => {
    if (!focusId && viewerId && chartRef.current) {
      focusPerson(viewerId, false);
    }
  }, [viewerId, focusId, focusPerson]);

  useEffect(() => {
    if (isSidebarOpen && drawerPersonId) {
      setDrawerPersonId(null);
    }
  }, [isSidebarOpen]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!visualizationCommand) {
      return;
    }

    if (
      visualizationCommand.target !== 'tree' &&
      visualizationCommand.target !== 'both'
    ) {
      return;
    }

    switch (visualizationCommand.action) {
      case 'focusOn':
        if (visualizationCommand.params.personId) {
          focusPerson(visualizationCommand.params.personId, true);
        }
        break;
      case 'highlight':
        if (visualizationCommand.params.personIds?.[0]) {
          focusPerson(visualizationCommand.params.personIds[0], true);
        }
        break;
      case 'reset':
        if (viewerId) {
          focusPerson(viewerId, true);
        } else if (
          siteConfig.rootPersonId &&
          chartData.find((person) => person.id === siteConfig.rootPersonId)
        ) {
          focusPerson(siteConfig.rootPersonId, true);
        } else if (chartData[0]) {
          focusPerson(chartData[0].id, true);
        }
        break;
      case 'showCollection':
        if (visualizationCommand.params.collectionType) {
          push(`/collection/${visualizationCommand.params.collectionType}`);
        }
        break;
      case 'filter':
        if (visualizationCommand.params.personId) {
          focusPerson(visualizationCommand.params.personId, true);
        } else if (visualizationCommand.params.personIds?.[0]) {
          focusPerson(visualizationCommand.params.personIds[0], true);
        } else if (visualizationCommand.params.branch) {
          const branchPersonId = findPersonIdForBranch(
            visualizationCommand.params.branch,
          );
          if (branchPersonId) {
            focusPerson(branchPersonId, true);
          }
        }
        break;
    }

    clearVisualizationCommand();
  }, [
    visualizationCommand,
    clearVisualizationCommand,
    viewerId,
    chartData,
    push,
    focusPerson,
    findPersonIdForBranch,
  ]);

  return {
    containerRef,
    status,
    errorMsg,
    nodeCount,
    chartData,
    drawerPersonId,
    treeFocusPersonId,
    visiblePersonIds,
    handleCloseDrawer,
    handleFocusPerson,
    fitToScreen,
  };
}
