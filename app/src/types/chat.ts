import type { VisualizationCommand, VisualizationFeedback } from './visualization';

export type ChatIntent = 'question' | 'visualization' | 'mixed';

export interface ChatSourcePerson {
  id: string;
  name: string;
}

export interface ChatConfidence {
  score: number;
  level: 'high' | 'medium' | 'low';
  threshold: number;
  passed: boolean;
  reasons: string[];
}

export interface ChatSources {
  database: string;
  historicalKnowledge: boolean;
  intent: ChatIntent;
  viewerScoped: boolean;
  confidence?: ChatConfidence;
  familyRecords: {
    totalPeopleReferenced: number;
    people: ChatSourcePerson[];
  };
}

export interface ChatApiResponse {
  response: string;
  searchMethod: 'neo4j';
  sources: ChatSources;
  visualizationCommand?: VisualizationCommand;
  visualizationFeedback?: VisualizationFeedback;
  peopleReferenced?: Array<{ id: string; name: string }>;
  error?: string;
}

export type SidebarMessage =
  | { type: 'user'; content: string; timestamp: number }
  | {
      type: 'assistant';
      content: string;
      timestamp: number;
      sources?: ChatSources;
      visualizationCommand?: VisualizationCommand;
      visualizationFeedback?: VisualizationFeedback;
      peopleReferenced?: Array<{ id: string; name: string }>;
    }
  | { type: 'context-marker'; content: string; timestamp: number };

export interface SidebarConversation {
  version: 1;
  messages: SidebarMessage[];
}
