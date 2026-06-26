import type { AppPageType } from '@/types/visualization';

interface ExampleQuestionsProps {
  pageType: AppPageType;
  personName?: string;
  onSelect: (question: string) => void;
}

function getQuestions(pageType: AppPageType, personName?: string): string[] {
  if (pageType === 'person' && personName) {
    const firstName = personName.split(' ')[0];
    return [
      `What records exist for ${firstName}?`,
      'What am I missing?',
      `Tell me about ${firstName}'s family`,
    ];
  }
  if (pageType === 'tree') {
    return [
      'Who are the oldest ancestors?',
      'Which family lines need more research?',
      'Tell me about the Welsh immigrants',
    ];
  }
  if (pageType === 'globe') {
    return [
      'What migration patterns do you see?',
      'Who traveled the farthest?',
    ];
  }
  return [
    'Who served in the military?',
    'Who are the earliest ancestors?',
    'Which ancestors were born in Germany?',
  ];
}

export default function ExampleQuestions({
  pageType,
  personName,
  onSelect,
}: ExampleQuestionsProps) {
  const questions = getQuestions(pageType, personName);
  return (
    <div className="py-4 px-1">
      <p className="text-sm text-gray-400 mb-3 text-center">
        Ask about your family tree
      </p>
      <div className="flex flex-col gap-2">
        {questions.map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => onSelect(q)}
            className="px-3 py-2 text-sm text-left bg-amber-50/50 hover:bg-amber-50 text-gray-600 rounded-lg transition-colors border border-amber-200/40"
          >
            {q}
          </button>
        ))}
      </div>
    </div>
  );
}
