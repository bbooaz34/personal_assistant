'use client';

/**
 * Scroll-to-fullscreen, applied to every artifact in the chat column.
 *
 * The open panel is a phone-width column on purpose, so an artifact inside it
 * is read through a letterbox: a case study, a timeline or a running prototype
 * all arrive in a box barely taller than a phone, and seeing any of them means
 * scrolling a long way to see very little. So the first scroll *inside* an
 * artifact promotes it — the panel becomes the viewport and the artifact owns
 * the screen. Pulling back past its top hands the screen back, and scrolling a
 * little further into it fades the panel's own chrome (the header with its ×,
 * the composer) back in, so there is always an exit that is not a gesture.
 *
 * Why a gesture and not only the existing "Expand view" button: the complaint
 * is about the viewport, and a button asks the visitor to make a decision
 * about layout before they have seen anything. Scrolling is what they already
 * do; this just lets the artifact answer it.
 *
 * Cross-origin artifacts are the awkward case. An artifact runs in a sandboxed
 * iframe without `allow-same-origin`, so wheel and touch events over it never
 * reach this document — there is no way to observe "they scrolled the
 * prototype". While docked, those frames carry a transparent shield
 * (`StageGestureShield`) that reads the gesture, a click or a keypress and
 * promotes the artifact; once it has the screen the shield is gone and the
 * prototype is live. For the same reason the chrome appears immediately for an
 * artifact that fills the screen with nothing left to scroll: the × is then
 * the only way out, so it cannot be something you scroll to earn.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
  type TouchEvent,
  type WheelEvent,
} from 'react';

/** Downward intent over a docked artifact before it takes the screen. */
const IMMERSE_PX = 36;
/** Upward intent at the top of an immersive artifact before it gives it back. */
const RELEASE_PX = 72;
/** Scrolled into an immersive artifact before the panel's chrome returns. */
const CHROME_PX = 120;

type GestureProps = {
  onWheel: (event: WheelEvent<HTMLElement>) => void;
  onTouchStart: (event: TouchEvent<HTMLElement>) => void;
  onTouchMove: (event: TouchEvent<HTMLElement>) => void;
};

type StageHandle = {
  /** True once this artifact has the screen. */
  immersive: boolean;
  /** Take the screen now — a click or a keypress, rather than a gesture. */
  immerse: () => void;
  /** Spread onto anything that should read scroll intent for this artifact. */
  gestureProps: GestureProps;
};

const StageContext = createContext<StageHandle | null>(null);

/**
 * The stage an artifact is drawn inside, if any.
 *
 * Null in the expanded stage and anywhere else a component renders outside the
 * chat log — which is what keeps those renditions interactive as they were.
 */
export function useArtifactStage(): StageHandle | null {
  return useContext(StageContext);
}

export function ArtifactStage({
  label,
  immersive,
  onImmerse,
  onRelease,
  onChrome,
  children,
}: {
  label: string;
  immersive: boolean;
  onImmerse: () => void;
  onRelease: () => void;
  /** Whether the panel should be showing its header and composer again. */
  onChrome: (shown: boolean) => void;
  children: ReactNode;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  /**
   * Accumulated scroll intent, signed: down is positive, and either direction
   * resets the other. A single wheel notch or a few pixels of drag is not an
   * answer about layout, and a stray one should not rearrange the screen.
   */
  const intent = useRef(0);
  const touchY = useRef<number | null>(null);

  /*
   * The callbacks live in a ref because the effects below must not re-run when
   * the parent re-renders: entering immersive resets the artifact's scroll, and
   * an effect that re-ran on every render would keep yanking it back to the top
   * while the visitor reads.
   */
  const handlers = useRef({ onImmerse, onRelease, onChrome });
  handlers.current = { onImmerse, onRelease, onChrome };

  const immersiveRef = useRef(immersive);
  immersiveRef.current = immersive;

  const readIntent = useCallback((delta: number) => {
    if (!immersiveRef.current) {
      intent.current = delta > 0 ? intent.current + delta : 0;
      if (intent.current >= IMMERSE_PX) {
        intent.current = 0;
        handlers.current.onImmerse();
      }
      return;
    }
    // Immersive: only a pull upward from the very top gives the screen back,
    // so scrolling up through the content never ejects the visitor mid-read.
    const el = scrollRef.current;
    if (el && el.scrollTop > 2) {
      intent.current = 0;
      return;
    }
    intent.current = delta < 0 ? intent.current + delta : 0;
    if (intent.current <= -RELEASE_PX) {
      intent.current = 0;
      handlers.current.onRelease();
    }
  }, []);

  const gestureProps = useMemo<GestureProps>(
    () => ({
      onWheel: (event) => readIntent(event.deltaY),
      onTouchStart: (event) => {
        const touch = event.touches[0];
        touchY.current = touch ? touch.clientY : null;
      },
      onTouchMove: (event) => {
        const touch = event.touches[0];
        if (!touch || touchY.current === null) return;
        // Dragging the content up is scrolling down.
        const delta = touchY.current - touch.clientY;
        touchY.current = touch.clientY;
        readIntent(delta);
      },
    }),
    [readIntent],
  );

  /** Entering and leaving the screen: reset intent, start at the top, watch scroll. */
  useEffect(() => {
    intent.current = 0;
    if (!immersive) {
      handlers.current.onChrome(false);
      return;
    }
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = 0;
    const measure = () => {
      // An artifact that fills the screen leaves nothing to scroll — and for a
      // framed one, nothing in this document that could hear a gesture either.
      // The way out has to be visible from the start.
      const scrollable = el.scrollHeight - el.clientHeight > 24;
      handlers.current.onChrome(!scrollable || el.scrollTop > CHROME_PX);
    };
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [immersive]);

  /** Giving the screen back puts the visitor where the artifact actually sits. */
  const held = useRef(false);
  useEffect(() => {
    if (immersive) {
      held.current = true;
      return;
    }
    if (!held.current) return;
    held.current = false;
    const el = hostRef.current;
    if (!el) return;
    requestAnimationFrame(() => el.scrollIntoView({ block: 'center' }));
  }, [immersive]);

  const handle = useMemo<StageHandle>(
    () => ({ immersive, immerse: () => handlers.current.onImmerse(), gestureProps }),
    [immersive, gestureProps],
  );

  return (
    <StageContext.Provider value={handle}>
      <div
        ref={hostRef}
        className={`gen-stage${immersive ? ' is-immersive' : ''}`}
        aria-label={immersive ? `${label} — full screen` : undefined}
        {...gestureProps}
      >
        <div ref={scrollRef} className="gen-stage-scroll">
          {children}
        </div>
      </div>
    </StageContext.Provider>
  );
}

/**
 * Laid over a sandboxed frame while its artifact is docked.
 *
 * The frame runs in an opaque origin, so this document never sees a scroll
 * inside it. This is the part of the artifact that can still answer: it reads
 * the same intent the stage does, and a click or Enter promotes it outright —
 * which is also the honest affordance for a frame that is, while docked, a
 * picture of itself rather than something to click around in.
 */
export function StageGestureShield({ label }: { label: string }) {
  const stage = useArtifactStage();
  if (!stage || stage.immersive) return null;
  return (
    <button
      type="button"
      className="stage-shield"
      aria-label={`Open ${label} full screen`}
      onClick={stage.immerse}
      {...stage.gestureProps}
    >
      <span aria-hidden>full screen</span>
    </button>
  );
}
