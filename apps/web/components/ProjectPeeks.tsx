'use client';

/**
 * The three project peeks offered at the opening.
 *
 * Which projects appear is selected from evidence, not authored — see
 * `selectProjectPeeks`. When the visitor names a role the rail re-selects, and
 * the label says what it narrowed to, so a set of cards changing under the
 * reader is explained rather than mysterious.
 */

export interface PeekCard {
  projectId: string;
  name: string;
  hook: string;
  supporting: string;
  cta: string;
  axis: 'product' | 'leadership' | 'creative' | 'ai';
  hasArtifact: boolean;
  verified: boolean;
}

export function ProjectPeeks({
  cards,
  focusLabel,
  onOpen,
}: {
  cards: PeekCard[];
  focusLabel?: string | null;
  onOpen: (card: PeekCard) => void;
}) {
  if (cards.length === 0) return null;

  return (
    <div className="peeks">
      {focusLabel ? <p className="peeks-focus">Narrowed to {focusLabel}</p> : null}
      {cards.map((card) => (
        <button key={card.projectId} type="button" className="peek" onClick={() => onOpen(card)}>
          <span className="peek-name">
            {card.name}
            {card.hasArtifact ? <span className="peek-live">live</span> : null}
          </span>
          <span className="peek-hook">{card.hook}</span>
          <span className="peek-supporting">{card.supporting}</span>
          <span className="peek-cta">{card.cta}</span>
        </button>
      ))}
    </div>
  );
}
