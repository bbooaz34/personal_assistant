'use client';

/**
 * Mounts the orb renderer and owns its lifecycle.
 *
 * The canvas is the whole background; the engine draws into it every frame.
 * Where WebGL2 is missing the CSS orb stands in, and everything conversational
 * still works on top of it.
 */

import { useEffect, useRef, useState } from 'react';
import { OrbEngine, type OrbEngineHooks } from './engine';

export function OrbStage({
  engineRef,
  hooks,
}: {
  engineRef: React.MutableRefObject<OrbEngine | null>;
  hooks: OrbEngineHooks;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hooksRef = useRef(hooks);
  hooksRef.current = hooks;
  const [webglOk, setWebglOk] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // The UI waits for the orb: wordmark and pill rise in at the reveal.
    document.body.classList.add('pre-reveal');

    const engine = new OrbEngine(
      canvas,
      {
        onStatus: (text, sticky) => hooksRef.current.onStatus?.(text, sticky),
        onReveal: () => {
          document.body.classList.remove('pre-reveal');
          hooksRef.current.onReveal?.();
        },
        getDockAnchor: () => hooksRef.current.getDockAnchor?.() ?? null,
      },
      // Held on its first frame until the entry gesture, so the flight and its
      // sound arrive together.
      { deferStart: true },
    );
    engineRef.current = engine;
    setWebglOk(engine.webglOk);
    if (!engine.webglOk) {
      // No renderer means no entry flight and therefore no reveal event. The
      // conversation must not be gated on a frame that will never arrive.
      document.body.classList.remove('pre-reveal');
      hooksRef.current.onReveal?.();
    }

    return () => {
      engine.destroy();
      engineRef.current = null;
      document.body.classList.remove('pre-reveal');
    };
  }, [engineRef]);

  return (
    <>
      <canvas id="stage" ref={canvasRef} style={webglOk ? undefined : { display: 'none' }} />
      {!webglOk ? (
        <div id="fallback">
          <div className="orb" aria-hidden="true" />
        </div>
      ) : null}
    </>
  );
}
