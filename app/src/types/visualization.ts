export type AppPageType =
  | 'person'
  | 'globe'
  | 'timeline'
  | 'home'
  | 'collection'
  | 'tree'
  | 'explorer';

export interface PageContext {
  type: AppPageType;
  personId?: string;
  personName?: string;
  collectionType?: string;
  visiblePersonIds?: string[];
  focusPersonId?: string;
  sourcePathname?: string;
}

export type VisualizationAction =
  | 'filter'
  | 'highlight'
  | 'focusOn'
  | 'showCollection'
  | 'reset';
export type VisualizationTarget = 'globe' | 'tree' | 'both';

export interface VisualizationCommandParams {
  branch?: string;
  personIds?: string[];
  personId?: string;
  collectionType?: string;
  location?: string;
}

export interface VisualizationCommand {
  action: VisualizationAction;
  target: VisualizationTarget;
  params: VisualizationCommandParams;
}

export interface VisualizationFeedback {
  status: 'applied' | 'rejected';
  reason?: string;
}
