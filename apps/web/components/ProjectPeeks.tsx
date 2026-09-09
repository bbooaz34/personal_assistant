'use client';

/**
 * The three project peeks offered at the opening.
 *
 * Which projects appear is selected from evidence, not authored — see
 * `selectProjectPeeks`. When the visitor names a role the rail re-selects, and
 * the label says what it narrowed to, so a set of cards changing under the
 * reader is explained rather than mysterious.
 *
 * Each card carries the work itself, running. A screenshot of an interface
 * argues that it existed; the interface moving argues that it works, which is
 * the whole reason a portfolio has prototypes in it. The embed is inert —
 * scaled down, pointer-events off, not in the tab order — so the card stays
 * one target that opens the real thing at full size.
 */

import { useEffect, useState } from 'react';

export interface PeekPreview {
  url: string;
  viewport: 'mobile' | 'desktop';
  label: string;
  external: boolean;
}

export interface PeekCard {
  projectId: string;
  name: string;
  hook: string;
  supporting: string;
  cta: string;
  axis: 'product' | 'leadership' | 'creative' | 'ai';
  hasArtifact: boolean;
  preview: PeekPreview | null;
  poster: string | null;
  verified: boolean;
}

/**
 * Three live interfaces is a lot of motion to hand someone who has asked for
 * none. Under the setting the poster stands in — still, and still the work.
 */
function useMotionAllowed(): boolean {
  const [allowed, setAllowed] = useState(true);
  useEffect(() => {
    const query = matchMedia('(prefers-reduced-motion: reduce)');
    const apply = () => setAllowed(!query.matches);
    apply();
    query.addEventListener('change', apply);
    return () => query.removeEventListener('change', apply);
  }, []);
  return allowed;
}

function PeekStage({
  card,
  sandbox,
  motionAllowed,
}: {
  card: PeekCard;
  sandbox: string;
  motionAllowed: boolean;
}) {
  const { preview, poster } = card;
  const [failed, setFailed] = useState(false);

  const showEmbed = Boolean(preview) && motionAllowed && !failed;
  if (!preview && !poster) return null;

  return (
    <div
      className={`peek-stage peek-stage-${preview?.viewport ?? 'desktop'}`}
      aria-hidden="true"
    >
      {poster ? (
        // Underneath the frame, not instead of it: it fills the moment before
        // the artifact paints, and stays visible if the artifact never does.
        <img className="peek-poster" src={poster} alt="" loading="lazy" decoding="async" />
      ) : null}
      {showEmbed && preview ? (
        <iframe
          className="peek-frame"
          src={preview.url}
          title={preview.label}
          loading="lazy"
          tabIndex={-1}
          onError={() => setFailed(true)}
          // A site we do not control gets no same-origin grant, whatever the
          // configured sandbox says: it is not our document to trust.
          sandbox={preview.external ? 'allow-scripts' : sandbox}
        />
      ) : null}
      {preview?.external ? <span className="peek-source">live site</span> : null}
    </div>
  );
}

export function ProjectPeeks({
  cards,
  focusLabel,
  sandbox,
  onOpen,
}: {
  cards: PeekCard[];
  focusLabel?: string | null;
  /** The sandbox attribute the portfolio requires on every embedded artifact. */
  sandbox: string;
  onOpen: (card: PeekCard) => void;
}) {
  const motionAllowed = useMotionAllowed();
  if (cards.length === 0) return null;

  return (
    <div className="peeks">
      {focusLabel ? <p className="peeks-focus">Narrowed to {focusLabel}</p> : null}
      {cards.map((card) => (
        // An article rather than a button: a button may not contain an iframe,
        // and the embed has to be inside the card to be part of it. The single
        // real control below is stretched over the whole card instead, which
        // keeps one tab stop and one hit target without nesting anything.
        <article key={card.projectId} className="peek">
          <PeekStage card={card} sandbox={sandbox} motionAllowed={motionAllowed} />
          <div className="peek-body">
            <span className="peek-name">
              {card.name}
              {card.hasArtifact ? <span className="peek-live">live</span> : null}
            </span>
            <span className="peek-hook">{card.hook}</span>
            <span className="peek-supporting">{card.supporting}</span>
            <button type="button" className="peek-cta" onClick={() => onOpen(card)}>
              {card.cta}
            </button>
          </div>
        </article>
      ))}
    </div>
  );
}
