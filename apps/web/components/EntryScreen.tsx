'use client';

/**
 * The entry gate.
 *
 * A blur over the held first frame — the cloudscape before the orb arrives —
 * with a single control that starts everything. It exists for a concrete
 * reason rather than as ceremony: browsers refuse audio until the visitor has
 * interacted, so without a gesture the entry flight's whoosh and the reveal
 * chime are silently dropped. One click buys the sound, and gives the arrival
 * a threshold to cross.
 */

export function EntryScreen({
  owner,
  selfReference,
  leaving,
  onEnter,
}: {
  owner: string;
  selfReference: string;
  /** True once dismissed: the overlay fades and unblurs before unmounting. */
  leaving: boolean;
  onEnter: () => void;
}) {
  return (
    <div id="entry" className={leaving ? 'leaving' : undefined} aria-hidden={leaving}>
      <div id="entryInner">
        <h1>{owner}</h1>
        <p>{selfReference}</p>
        <button type="button" onClick={onEnter} autoFocus>
          Start the conversation
        </button>
        <p className="entryNote">Sound on, if you can — it is part of it.</p>
      </div>
    </div>
  );
}
