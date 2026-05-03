export interface TimelineYearRange {
  startYear: number;
  endYear: number;
  source: 'preset' | 'custom';
}

export interface TimelineRangePreset {
  id: string;
  label: string;
  range: TimelineYearRange | null;
}

export interface TimelineBranchOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface TimelineDecadeOption {
  decade: number;
  count: number;
}
