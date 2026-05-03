'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { useMe, hasViewerPerson } from './MeProvider';

interface PathNode {
  id: string;
  name: string;
  sex?: string;
  birthYear?: number;
}

interface RelationshipPath {
  connected: boolean;
  path?: PathNode[];
  relationshipTypes?: string[];
  distance?: number;
  relationshipLabel?: string;
  relationshipCaveat?: {
    kind?: string;
    classification?: string;
    confidence?: string;
    rationale?: string;
  };
  message?: string;
}

interface RelationshipDisplayProps {
  personId: string;
  personName: string;
  personSex?: 'M' | 'F' | string | null;
  variant?: 'default' | 'hero';
}

export default function RelationshipDisplay({ personId, personName, personSex, variant = 'default' }: RelationshipDisplayProps) {
  const { me, setMe, isMe } = useMe();
  const [relationship, setRelationship] = useState<RelationshipPath | null>(null);
  const [loading, setLoading] = useState(false);

  // Fetch relationship path from Neo4j API when me changes
  useEffect(() => {
    if (!hasViewerPerson(me)) return;
    if (isMe(personId)) return;

    setLoading(true);
    fetch(`/api/person/${me.id}/path/${personId}`)
      .then(res => res.json())
      .then((data: RelationshipPath) => {
        setRelationship(data);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch relationship:', err);
        setRelationship({ connected: false, message: 'Error loading relationship' });
        setLoading(false);
      });
  }, [me, personId, isMe]);

  const effectiveRelationship =
    !hasViewerPerson(me) || isMe(personId) ? null : relationship;

  const handleSetAsMe = () => {
    setMe({ id: personId, name: personName });
  };

  const handleClearMe = () => {
    setMe(null);
  };

  // Format relationship label with gender awareness (client-side fallback).
  // The API now returns gendered terms when sex is known, but this handles
  // cases where the API returns neutral terms (sex=null in Neo4j).
  const formatLabel = (label: string): string => {
    if (!label) return label;

    const isMale = personSex === 'M';
    const isFemale = personSex === 'F';
    if (!isMale && !isFemale) return label;

    // Map of neutral → gendered terms (covers compound forms via substring replace)
    const genderMap: Array<[string, string, string]> = [
      // [neutral,         male,              female]
      ['grandparent',    'grandfather',     'grandmother'],
      ['grandchild',     'grandson',        'granddaughter'],
      ['Grandparent',    'Grandfather',     'Grandmother'],
      ['Grandchild',     'Grandson',        'Granddaughter'],
      ['Parent',         'Father',          'Mother'],
      ['Child',          'Son',             'Daughter'],
      ['Sibling',        'Brother',         'Sister'],
      ['Aunt/Uncle',     'Uncle',           'Aunt'],
      ['Niece/Nephew',   'Nephew',          'Niece'],
      ['Great-aunt/uncle', 'Great-uncle',   'Great-aunt'],
      ['Grand-niece/nephew', 'Grand-nephew', 'Grand-niece'],
      ['Spouse',         'Husband',         'Wife'],
    ];

    let result = label;

    // Handle in-law: strip suffix, gender base, re-append
    if (result.endsWith('-in-law')) {
      const base = result.replace(/-in-law$/, '');
      return formatLabel(base) + '-in-law';
    }

    // Handle "Husband's/Wife's X" possessive labels
    const possessiveMatch = result.match(/^(Husband's|Wife's|Spouse's)\s+(.+)$/);
    if (possessiveMatch) {
      const [, possessive, baseLabel] = possessiveMatch;
      return `${possessive} ${formatLabel(baseLabel)}`;
    }

    // Apply gender substitutions (substring match handles compound forms
    // like "Great-great-grandparent" → "Great-great-grandfather")
    for (const [neutral, male, female] of genderMap) {
      if (result.includes(neutral)) {
        result = result.replace(neutral, isMale ? male : female);
        break;
      }
    }

    return result;
  };

  // Determine ancestor/descendant from label (more reliable than edge types,
  // which can vary depending on graph traversal direction)
  const rawLabel = effectiveRelationship?.relationshipLabel || '';
  const isDirectAncestor = /parent|grand(parent|father|mother)/i.test(rawLabel) && !/grand(child|son|daughter)/i.test(rawLabel);
  const isDirectDescendant = /child|grand(child|son|daughter)/i.test(rawLabel);

  const isHero = variant === 'hero';

  // Compute generation count for direct ancestors
  if (loading) {
    return (
      <div className={isHero ? 'mt-2' : 'mb-3'}>
        <span className="text-white/40 text-xs">Loading...</span>
      </div>
    );
  }

  // This is the current user — hero "View tree as" button handles this
  if (isMe(personId)) {
    return null;
  }

  // No "me" is set yet, or me is the null-sentinel — hero "View tree as" button handles this
  if (!hasViewerPerson(me)) {
    return null;
  }

  // No connection found
  if (!effectiveRelationship?.connected) {
    return (
      <div className={isHero ? 'mt-2' : 'mb-3'}>
        <span className={`text-white/40 ${isHero ? 'text-sm' : 'text-xs'}`}>
          No connection to{' '}
          <Link href={`/person/${me.id}`} className="text-amber-300/60 hover:underline">
            {me.name.split(' ')[0]}
          </Link>
        </span>
      </div>
    );
  }

  // Show the relationship
  const formattedLabel = formatLabel(effectiveRelationship.relationshipLabel || '');
  const relationshipPath = effectiveRelationship.path ?? [];
  const hasRelationshipCaveat = Boolean(effectiveRelationship.relationshipCaveat);
  const caveatText = 'Relationship label is conservative while this branch is under review.';

  // Hero variant: clean subtitle with inline connection path
  if (isHero) {
    return (
      <div className="mt-2 mb-1">
        {/* Relationship as a clean subtitle */}
        <p className={`text-lg font-medium ${
          isDirectAncestor
            ? 'text-emerald-300'
            : isDirectDescendant
            ? 'text-blue-300'
            : 'text-purple-300'
        }`}>
          Your {formattedLabel}
        </p>

        {hasRelationshipCaveat && (
          <p className="mt-1 text-sm text-amber-200/80">
            {caveatText}
          </p>
        )}

        {/* Inline connection path: You → Scott → John Stuart Jr. */}
        {relationshipPath.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-sm text-white/40">
            {relationshipPath.map((step, idx) => (
              <React.Fragment key={step.id}>
                {idx > 0 && (
                  <svg className="w-3 h-3 text-white/25 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                )}
                {idx === 0 ? (
                  <span className="text-white/60">You</span>
                ) : idx === relationshipPath.length - 1 ? (
                  <span className="text-white/60">{step.name.split(' ')[0]}</span>
                ) : (
                  <Link
                    href={`/person/${step.id}`}
                    className="text-white/60 hover:text-amber-300 hover:underline underline-offset-2"
                  >
                    {step.name.split(' ')[0]}
                  </Link>
                )}
              </React.Fragment>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Default variant: compact pill badge
  return (
    <div className="mb-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-sm ${
          isDirectAncestor
            ? 'bg-emerald-500/20 border border-emerald-500/40'
            : isDirectDescendant
            ? 'bg-blue-500/20 border border-blue-500/40'
            : 'bg-purple-500/20 border border-purple-500/40'
        }`}>
          <span className={`font-medium ${
            isDirectAncestor
              ? 'text-emerald-300'
              : isDirectDescendant
              ? 'text-blue-300'
              : 'text-purple-300'
          }`}>
            {formattedLabel}
          </span>
        </div>

        {isDirectAncestor && (
          <div className="inline-flex items-center px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/30 rounded-full text-xs text-emerald-400">
            Direct Ancestor
          </div>
        )}
      </div>

      {hasRelationshipCaveat && (
        <p className="text-xs text-amber-200/80">
          {caveatText}
        </p>
      )}

      {/* Inline connection path */}
      {relationshipPath.length > 2 && (
        <div className="flex flex-wrap items-center gap-1 text-xs text-white/40">
          {relationshipPath.map((step, idx) => (
            <React.Fragment key={step.id}>
              {idx > 0 && (
                <span className="text-white/20">&rsaquo;</span>
              )}
              {idx === 0 ? (
                <span>You</span>
              ) : (
                <Link
                  href={`/person/${step.id}`}
                  className="text-amber-300/70 hover:text-amber-200 hover:underline underline-offset-2"
                >
                  {step.name.split(' ')[0]}
                </Link>
              )}
            </React.Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
