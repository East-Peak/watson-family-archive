/* eslint-disable @next/next/no-img-element */

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

interface FamilyMember {
  id: string;
  name: string;
  birthYear?: number;
}

interface PersonDetails {
  id: string;
  name: string;
  sex: 'M' | 'F' | 'U';
  birthYear?: number;
  deathYear?: number;
  isLiving?: boolean;
  photoUrl?: string;
  birthPlace?: string;
  deathPlace?: string;
  occupation?: string;
  father?: FamilyMember;
  mother?: FamilyMember;
  spouses?: FamilyMember[];
  children?: FamilyMember[];
  siblings?: FamilyMember[];
}

function normalizeSex(raw: string | undefined | null): 'M' | 'F' | 'U' {
  if (!raw) return 'U';
  const s = raw.charAt(0).toUpperCase();
  return s === 'M' ? 'M' : s === 'F' ? 'F' : 'U';
}

interface PersonDrawerProps {
  personId: string | null;
  onClose: () => void;
  onFocusPerson?: (personId: string) => void;
}

export function PersonDrawer({
  personId,
  onClose,
  onFocusPerson,
}: PersonDrawerProps) {
  const router = useRouter();
  const [details, setDetails] = useState<PersonDetails | null>(null);
  const [loading, setLoading] = useState(false);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    if (!personId) {
      setDetails(null);
      return;
    }

    setLoading(true);
    setImageError(false);

    fetch(`/api/person/${personId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Person not found');
        return res.json();
      })
      .then((person) => {
        setDetails({
          id: personId,
          name: person.fullName || 'Unknown',
          sex: normalizeSex(person.sex),
          birthYear: person.birthYear,
          deathYear: person.deathYear,
          isLiving: person.isLiving,
          photoUrl: person.photoUrl,
          birthPlace: person.birthPlace,
          deathPlace: person.deathPlace,
          occupation: person.occupation,
          father: person.father,
          mother: person.mother,
          spouses: person.spouses,
          children: person.children,
          siblings: person.siblings,
        });
        setLoading(false);
      })
      .catch(() => {
        setDetails(null);
        setLoading(false);
      });
  }, [personId]);

  // Close on Escape
  useEffect(() => {
    if (!personId) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [personId, onClose]);

  if (!personId) return null;

  const isFemale = details?.sex === 'F';
  const accentColor = isFemale ? '#5d8400' : '#161087';
  const accentBg = isFemale ? '#eef4e8' : '#e8e8f4';
  const hasRealPhoto = details?.photoUrl && !imageError;

  const getLifespan = () => {
    if (!details) return '';
    if (details.isLiving)
      return details.birthYear ? `Born ${details.birthYear}` : 'Living';
    if (details.birthYear && details.deathYear)
      return `${details.birthYear} \u2013 ${details.deathYear}`;
    if (details.birthYear) return `Born ${details.birthYear}`;
    if (details.deathYear) return `Died ${details.deathYear}`;
    return 'Dates unknown';
  };

  const handleSelectPerson = (id: string) => {
    if (onFocusPerson) {
      onFocusPerson(id);
    }
  };

  const renderFamilyLink = (member: FamilyMember, relationship?: string) => (
    <button
      key={member.id}
      onClick={() => handleSelectPerson(member.id)}
      className="flex items-center gap-2 px-3 py-2 w-full text-left rounded-md hover:bg-gray-100 transition-colors"
    >
      <div className="w-8 h-8 rounded-full bg-gray-200 flex items-center justify-center text-sm text-gray-500 flex-shrink-0">
        {member.name.charAt(0)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-[13px] font-medium text-gray-800 truncate">
          {member.name}
        </div>
        {(relationship || member.birthYear) && (
          <div className="text-[11px] text-gray-500">
            {relationship}
            {relationship && member.birthYear ? ' \u00b7 ' : ''}
            {member.birthYear ? `b. ${member.birthYear}` : ''}
          </div>
        )}
      </div>
      <svg width="16" height="16" viewBox="0 0 20 20" fill="#9ca3af">
        <path
          fillRule="evenodd"
          d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z"
          clipRule="evenodd"
        />
      </svg>
    </button>
  );

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 bg-black/30 z-[60] animate-[fadeIn_0.2s_ease-out]"
      />

      {/* Drawer */}
      <div className="fixed top-0 right-0 bottom-0 w-[340px] bg-white shadow-[-4px_0_24px_rgba(0,0,0,0.15)] z-[61] flex flex-col animate-[slideInRight_0.2s_ease-out]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
          <h2 className="text-base font-semibold text-gray-800">
            Person Details
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              <path
                fillRule="evenodd"
                d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-5 py-5">
          {loading ? (
            <div className="text-center py-10 text-gray-500">Loading...</div>
          ) : details ? (
            <>
              {/* Photo / Avatar and name */}
              <div className="text-center mb-6">
                <div
                  className="w-[120px] h-[120px] rounded-xl overflow-hidden mx-auto mb-4 flex items-center justify-center"
                  style={{
                    border: `3px solid ${accentColor}`,
                    backgroundColor: accentBg,
                  }}
                >
                  {hasRealPhoto ? (
                    <img
                      src={details.photoUrl!}
                      alt={details.name}
                      className="w-full h-full object-cover"
                      onError={() => setImageError(true)}
                    />
                  ) : (
                    <svg
                      width="48"
                      height="48"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke={accentColor}
                      strokeWidth="1.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      opacity="0.6"
                    >
                      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                      <circle cx="12" cy="7" r="4" />
                    </svg>
                  )}
                </div>
                <h3 className="text-xl font-semibold text-gray-800 mb-1">
                  {details.name}
                </h3>
                <p className="text-sm text-gray-500">{getLifespan()}</p>
                {details.birthPlace && (
                  <p className="text-xs text-gray-400 mt-1">
                    {details.birthPlace}
                  </p>
                )}
                {details.occupation && (
                  <p className="text-xs text-gray-400 mt-0.5">
                    {details.occupation}
                  </p>
                )}
              </div>

              {/* Action button */}
              <div className="mb-6">
                <button
                  onClick={() => router.push(`/person/${details.id}`)}
                  className="w-full px-4 py-2.5 text-[13px] font-medium text-white bg-shield rounded-lg hover:bg-shield/90 transition-colors"
                >
                  View Full Profile
                </button>
              </div>

              {/* Parents */}
              {(details.father || details.mother) && (
                <div className="mb-5">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Parents
                  </h4>
                  <div className="-mx-3">
                    {details.father &&
                      renderFamilyLink(details.father, 'Father')}
                    {details.mother &&
                      renderFamilyLink(details.mother, 'Mother')}
                  </div>
                </div>
              )}

              {/* Spouses */}
              {details.spouses && details.spouses.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    {details.spouses.length === 1 ? 'Spouse' : 'Spouses'}
                  </h4>
                  <div className="-mx-3">
                    {details.spouses.map((spouse) => renderFamilyLink(spouse))}
                  </div>
                </div>
              )}

              {/* Children (sorted by birth year) */}
              {details.children && details.children.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Children ({details.children.length})
                  </h4>
                  <div className="-mx-3">
                    {[...details.children]
                      .sort(
                        (a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999),
                      )
                      .map((child) => renderFamilyLink(child))}
                  </div>
                </div>
              )}

              {/* Siblings (sorted by birth year) */}
              {details.siblings && details.siblings.length > 0 && (
                <div className="mb-5">
                  <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                    Siblings ({details.siblings.length})
                  </h4>
                  <div className="-mx-3">
                    {[...details.siblings]
                      .sort(
                        (a, b) => (a.birthYear ?? 9999) - (b.birthYear ?? 9999),
                      )
                      .map((sibling) => renderFamilyLink(sibling))}
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-10 text-gray-500">
              No details available
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </>
  );
}
