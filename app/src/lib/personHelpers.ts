/**
 * Helper utilities for person profile pages
 */

import React from 'react';
import type { Individual, FamilyRelationships, Biography } from '@/types/person';

/**
 * Render markdown bold (**text**) as strong elements
 */
export function renderMarkdownBold(text: string): React.ReactNode {
  const parts = text.split(/\*\*([^*]+)\*\*/g);
  return React.createElement(
    React.Fragment,
    null,
    ...parts.map((part, idx) =>
      idx % 2 === 1
        ? React.createElement('strong', { key: idx, className: 'text-gray-900 font-semibold' }, part)
        : part
    )
  );
}

/**
 * Filter out notes that contain markdown tables, GEDCOM metadata, or research notes
 */
export function isDisplayableNote(note: string): boolean {
  if (!note || note.length < 10) return false;

  // Skip markdown tables
  if (note.includes('| Field') || note.includes('|----') || note.includes('| **')) return false;

  // Skip GEDCOM metadata
  if (note.includes('**GEDCOM') || note.includes('GEDCOM ID') || note.includes('@I') || note.includes('@F')) return false;

  // Skip numbered research items that are clearly metadata
  if (/^\d+\.\s*\*\*/.test(note)) return false;

  // Skip verification status notes
  if (note.includes('Verification Status') || note.includes('WikiTree ID')) return false;

  return true;
}

/**
 * Check if occupation is valid for display as a hook
 */
export function isValidOccupationHook(occ: string): boolean {
  if (!occ || occ.length < 3 || occ.length > 50) return false;
  const junk = ['###', '**', 'Priority', 'GEDCOM', 'census', 'confirmed', 'verified', 'documented'];
  return !junk.some(j => occ.toLowerCase().includes(j.toLowerCase()));
}

/**
 * Generate a compelling "hook" for a person based on their data
 */
export function generateHook(
  person: Individual,
  family: FamilyRelationships | null,
  biography: Biography | null
): string {
  const age = person.birthYear && person.deathYear ? person.deathYear - person.birthYear : null;

  // Migration hook - most compelling
  const birthCountry = person.birthPlace?.split(',').pop()?.trim();
  const deathCountry = person.deathPlace?.split(',').pop()?.trim();
  if (birthCountry && deathCountry && birthCountry !== deathCountry) {
    return `${birthCountry} to ${deathCountry}`;
  }

  // Occupation hook - filter out junk
  if (biography?.occupations && biography.occupations.length > 0) {
    const validOcc = biography.occupations.find(isValidOccupationHook);
    if (validOcc) {
      return validOcc;
    }
  }

  // Longevity hook
  if (age && age >= 90) {
    return `Lived ${age} years`;
  }

  // Large family hook - prefer researched count
  const childCount = biography?.researchedChildCount || family?.children?.length || 0;
  if (childCount >= 6) {
    return `Parent to ${childCount}+ children`;
  }

  return '';
}

/**
 * Format lifespan string from birth/death years
 */
export function formatLifespan(birthYear?: number | null, deathYear?: number | null): string {
  if (birthYear && deathYear) return `${birthYear}–${deathYear}`;
  if (birthYear) return `b. ${birthYear}`;
  if (deathYear) return `d. ${deathYear}`;
  return '';
}

/**
 * Calculate age from birth and death years
 */
export function calculateAge(birthYear?: number | null, deathYear?: number | null): number | null {
  if (birthYear && deathYear) return deathYear - birthYear;
  return null;
}
