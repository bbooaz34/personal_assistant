/**
 * The orb's runtime, adapted from the External Brain OS orb into a
 * framework-free engine the React shell can drive.
 *
 * Everything visual is preserved from the source: the rhythm envelopes and
 * their fast-attack/slow-release chase, the shape morph machine and its idle
 * daydream, the entry flight with the elastic reveal, zoom/parallax/press
 * interactions, and the dock that shrinks the orb into the panel's porthole.
 *
 * What changed is who is in charge. The source page owned its own chat, mind,
 * and speech; here the host application does — the engine only renders the
 * presence and exposes the same four modes the original `window.orb` API had:
 *
 *   calm       idle breathing (default)
 *   speaking   while the representative answers
 *   heartbeat  while it reasons / retrieves
 *   live       microphone-reactive, while the visitor speaks
 *
 * `live` opens its own analyser on the microphone. During a realtime voice
 * session the WebRTC transport already holds a granted mic permission, so this
 * second, read-only stream attaches silently — it is what lets the orb breathe
 * with the visitor's actual voice rather than a canned envelope.
 */

import { VERT, FRAG } from './shaders';

export type OrbMode = 'calm' | 'speaking' | 'heartbeat' | 'live';
export type OrbShape = 0 | 1 | 2 | 3 | 4; // orb · question · ball · lava · heart

export interface OrbEngineOptions {
  /**
   * Hold the entry flight until `begin()` is called.
   *
   * The entry screen exists so the first sound the visitor hears is not
   * blocked: browsers only allow audio after a user gesture, so the flight's
   * whoosh and the reveal chime are silent on autoplay. Deferring the intro to
   * a click means the scene and its sound arrive together.
   */
  deferStart?: boolean;
}

export interface OrbEngineHooks {
  /** Status line for the input placeholder. `null` clears it. */
  onStatus?: (text: string | null, sticky?: boolean) => void;
  /** Fired once when the entry flight ends and the UI should rise in. */
  onReveal?: () => void;
  /** CSS-pixel centre of the porthole while the panel is expanded, else null. */
  getDockAnchor?: () => { x: number; y: number } | null;
}

const MODES: OrbMode[] = ['calm', 'speaking', 'heartbeat', 'live'];
const MORPH_SECONDS = 1.25;
const ZOOM_MIN = 2.15, ZOOM_MAX = 4.0, ZOOM_HOME = 2.75, ZOOM_FAR = 9.0;

const easeInOut = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
const easeOutBack = (x: number) => {
  const c1 = 1.70158, c3 = c1 + 1;
  return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
};

function speakingEnvelope(t: number): number {
  // syllable-rate flutter gated by phrase-rate pauses
  const syllable = Math.abs(Math.sin(t * 3.1) * Math.sin(t * 4.7 + 1.3) * Math.sin(t * 1.9 + 4.1));
  const phrase = 0.5 + 0.5 * Math.sin(t * 0.31 + Math.sin(t * 0.13) * 2.0);
  const gate = Math.min(1, Math.max(0, (phrase - 0.28) / 0.28));
  return Math.pow(syllable, 0.7) * gate;
}

function heartbeatEnvelope(t: number): number {
  const period = 1.05; // ~57 bpm at rest
  const ph = t % period;
  const lub = Math.exp(-Math.pow(ph - 0.1, 2) / 0.0045);
  const dub = 0.62 * Math.exp(-Math.pow(ph - 0.38, 2) / 0.006);
  return Math.min(1, lub + dub);
}

function calmEnvelope(t: number): number {
  return 0.18 + 0.16 * (0.5 + 0.5 * Math.sin(t * 0.7));
}

interface MicState {
  ctx: AudioContext;
  analyser: AnalyserNode;
  data: Float32Array<ArrayBuffer>;
  stream: MediaStream;
}

export class OrbEngine {
  readonly webglOk: boolean;

  private canvas: HTMLCanvasElement;
  private gl: WebGL2RenderingContext | null = null;
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private hooks: OrbEngineHooks;
  private observer: ResizeObserver | null = null;
  private raf = 0;
  private destroyed = false;
  private cleanups: Array<() => void> = [];

  private reduceMotion = typeof matchMedia !== 'undefined'
    ? matchMedia('(prefers-reduced-motion: reduce)')
    : ({ matches: false } as MediaQueryList);

  // rhythm
  private mode: OrbMode = 'calm';
  private pulse = 0;
  private energy = 0.3;
  private mic: MicState | null = null;
  private micPeak = 0.1;

  // interaction
  private kick = 0;
  private kickTarget = 0;
  private look = { x: 0, y: 0, tx: 0, ty: 0 };
  private zoom = ZOOM_HOME;
  private zoomTarget = ZOOM_HOME;
  private pinch = new Map<number, { x: number; y: number }>();
  private pinchDist = 0;

  // shape
  private shapeA = 0;
  private shapeB = 0;
  private morphT = 1;
  private idleShape = 0;
  private idleReturnAt = 0;
  private lastInteraction = 0;

  // scene placement
  private chatOpen = false;
  private expanded = false;
  private dock = 0;
  private sceneShift = 0;
  private sceneShiftY = 0;

  // entry
  private t0 = 0;
  private lastFrame = 0;
  private revealTriggered = false;
  private pendingShimmer = false;
  private introFly: number;
  private introReveal: number;
  /** True while waiting for `begin()`: the scene holds on its first frame. */
  private deferred = false;
  /**
   * One AudioContext for the whole session, created inside the entry gesture.
   * Creating a fresh one per sound worked only when autoplay happened to be
   * permitted; opened during a click, this one stays unlocked for the chime
   * that plays seconds later.
   */
  private audioCtx: AudioContext | null = null;

  constructor(canvas: HTMLCanvasElement, hooks: OrbEngineHooks = {}, options: OrbEngineOptions = {}) {
    this.canvas = canvas;
    this.hooks = hooks;
    this.deferred = options.deferStart === true;
    this.introFly = this.reduceMotion.matches ? 0 : 3.2;
    this.introReveal = this.reduceMotion.matches ? 0.6 : 1.3;

    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false });
    this.webglOk = Boolean(gl);
    if (!gl) return;
    this.gl = gl;

    const compile = (type: number, src: string) => {
      const s = gl.createShader(type)!;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        throw new Error(gl.getShaderInfoLog(s) || 'shader compile failed');
      }
      return s;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      throw new Error(gl.getProgramInfoLog(prog) || 'program link failed');
    }
    gl.useProgram(prog);

    for (const name of ['uRes', 'uTime', 'uPulse', 'uEnergy', 'uLook', 'uKick', 'uZoom',
                        'uShapeA', 'uShapeB', 'uMorph', 'uReveal', 'uBurst', 'uShift', 'uShiftY', 'uDock']) {
      this.uniforms[name] = gl.getUniformLocation(prog, name);
    }

    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(canvas);
    this.resize();

    this.bindInteractions();

    this.t0 = performance.now();
    this.lastFrame = this.t0;
    this.lastInteraction = this.t0;
    if (!this.deferred) this.begin();
    this.raf = requestAnimationFrame((now) => this.frame(now));
  }

  /**
   * Start the entry flight. Call from a user gesture so the sound is allowed.
   */
  begin(): void {
    if (!this.deferred && this.t0 !== 0 && this.revealTriggered) return;
    this.deferred = false;
    this.t0 = performance.now();
    this.lastFrame = this.t0;
    this.lastInteraction = this.t0;
    this.revealTriggered = false;
    // Opened synchronously inside the gesture, which is what unlocks audio.
    try {
      const ctx = new AudioContext();
      void ctx.resume().catch(() => {});
      this.audioCtx = ctx;
    } catch { /* no audio: the scene is silent, the world goes on */ }
    if (this.introFly > 0) this.playWhoosh(this.introFly + 0.4);
  }

  destroy(): void {
    this.destroyed = true;
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    this.stopMic();
    this.audioCtx?.close().catch(() => {});
    for (const cleanup of this.cleanups) cleanup();
    this.cleanups = [];
  }

  // --- host API -----------------------------------------------------------

  get currentMode(): OrbMode { return this.mode; }

  async setMode(next: OrbMode): Promise<boolean> {
    if (!MODES.includes(next) || this.destroyed) return false;
    if (next === this.mode) return true;

    if (next === 'live') {
      if (!navigator.mediaDevices?.getUserMedia) {
        this.hooks.onStatus?.('microphone is not available here');
        return false;
      }
      try {
        await this.startMic();
      } catch (error) {
        this.hooks.onStatus?.(
          (error as { name?: string }).name === 'NotAllowedError'
            ? 'microphone permission was declined'
            : 'microphone is not available here',
        );
        return false;
      }
      this.mode = 'live';
      this.micPeak = 0.1;
      return true;
    }

    this.stopMic();
    this.mode = next;
    return true;
  }

  setShape(next: OrbShape): boolean {
    if (!Number.isInteger(next) || next < 0 || next > 4) return false;
    this.idleShape = 0; // an explicit choice ends any daydream
    this.morphTo(next);
    return true;
  }

  /** The panel is open: glide the orb into the left two-thirds. */
  setChatOpen(open: boolean): void { this.chatOpen = open; }

  /** The panel is expanded: dock the orb into the header porthole. */
  setExpanded(expanded: boolean): void {
    this.expanded = expanded;
    if (expanded) {
      this.idleShape = 0;
      this.morphTo(0); // the docked avatar is always the orb form
    }
  }

  // --- internals ----------------------------------------------------------

  private morphTo(next: number): void {
    if (next === this.shapeB) return;
    this.shapeA = this.shapeB;
    this.shapeB = next;
    this.morphT = 0;
  }

  private resize(): void {
    const gl = this.gl!;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let w = Math.round(this.canvas.clientWidth * dpr);
    let h = Math.round(this.canvas.clientHeight * dpr);
    const budget = 3.4e6; // raymarching pays per pixel
    const area = w * h;
    if (area > budget) {
      const s = Math.sqrt(budget / area);
      w = Math.round(w * s);
      h = Math.round(h * s);
    }
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }

  private on<K extends keyof DocumentEventMap>(
    target: Document | HTMLCanvasElement,
    type: K | string,
    handler: (e: never) => void,
    options?: AddEventListenerOptions,
  ): void {
    target.addEventListener(type as string, handler as EventListener, options);
    this.cleanups.push(() => target.removeEventListener(type as string, handler as EventListener));
  }

  private bindInteractions(): void {
    const canvas = this.canvas;

    this.on(canvas, 'wheel', (e: WheelEvent) => {
      e.preventDefault();
      const gain = e.ctrlKey ? 0.008 : 0.0018; // trackpad pinch arrives as ctrl-wheel
      this.zoomTarget = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoomTarget + e.deltaY * gain));
    }, { passive: false });

    this.on(canvas, 'pointermove', (e: PointerEvent) => {
      if (this.pinch.has(e.pointerId)) this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch.size === 2) {
        const [a, b] = [...this.pinch.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (this.pinchDist > 0) {
          this.zoomTarget = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, this.zoomTarget - (d - this.pinchDist) * 0.008));
        }
        this.pinchDist = d;
        return; // two fingers zoom; they do not parallax or excite
      }
      this.look.tx = (e.clientX / window.innerWidth) * 2 - 1;
      this.look.ty = (e.clientY / window.innerHeight) * 2 - 1;
    });

    this.on(canvas, 'pointerdown', (e: PointerEvent) => {
      if (this.pendingShimmer) this.pendingShimmer = !this.playShimmer(); // autoplay was blocked
      this.pinch.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (this.pinch.size >= 2) {
        this.kickTarget = 0; // a second finger means pinch, not press
        this.pinchDist = 0;
        return;
      }
      this.kickTarget = 1;
      try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointers */ }
    });

    const release = (e: PointerEvent) => {
      this.pinch.delete(e.pointerId);
      this.pinchDist = 0;
      if (this.pinch.size === 0) this.kickTarget = 0;
    };
    this.on(canvas, 'pointerup', release);
    this.on(canvas, 'pointercancel', release);

    const markInteraction = () => { this.lastInteraction = performance.now(); };
    this.on(document, 'pointerdown', markInteraction);
    this.on(document, 'pointermove', markInteraction);
    this.on(document, 'wheel', markInteraction, { passive: true });
    this.on(document, 'keydown', markInteraction);
  }

  private async startMic(): Promise<void> {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: false, autoGainControl: false },
    });
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    const analyser = ctx.createAnalyser();
    analyser.fftSize = 1024;
    analyser.smoothingTimeConstant = 0;
    ctx.createMediaStreamSource(stream).connect(analyser);
    this.mic = { ctx, analyser, data: new Float32Array(new ArrayBuffer(analyser.fftSize * 4)), stream };
    for (const track of stream.getTracks()) {
      track.addEventListener('ended', () => {
        if (this.mode === 'live') {
          this.stopMic();
          this.mode = 'calm';
          this.hooks.onStatus?.('microphone disconnected');
        }
      });
    }
  }

  private stopMic(): void {
    if (!this.mic) return;
    for (const track of this.mic.stream.getTracks()) track.stop();
    this.mic.ctx.close().catch(() => {});
    this.mic = null;
  }

  private micEnvelope(): number {
    const mic = this.mic!;
    mic.analyser.getFloatTimeDomainData(mic.data);
    let sum = 0;
    for (let i = 0; i < mic.data.length; i++) sum += mic.data[i]! * mic.data[i]!;
    const rms = Math.sqrt(sum / mic.data.length);
    // adaptive gain: a whisper and a shout both use the orb's full range
    this.micPeak = Math.max(rms, this.micPeak * 0.996, 0.02);
    return Math.pow(Math.min(1, rms / this.micPeak), 0.85);
  }

  // the magical chime: a rising pentatonic sparkle, synthesised on the spot
  private playShimmer(): boolean {
    try {
      const ctx = this.audioCtx;
      if (!ctx) return true; // nothing to retry
      if (ctx.state === 'suspended') {
        void ctx.resume().catch(() => {});
        return false; // still blocked: retry on the next gesture
      }
      const master = ctx.createGain();
      master.gain.value = 0.15;
      master.connect(ctx.destination);
      const notes = [523.25, 659.25, 783.99, 1046.5, 1318.5, 1568.0, 2093.0];
      notes.forEach((f, i) => {
        const at = ctx.currentTime + i * 0.07;
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = f * (1 + (Math.random() - 0.5) * 0.004);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0, at);
        g.gain.linearRampToValueAtTime(0.9 / (1 + i * 0.15), at + 0.02);
        g.gain.exponentialRampToValueAtTime(0.001, at + 1.6);
        o.connect(g);
        g.connect(master);
        o.start(at);
        o.stop(at + 1.7);
      });
      return true;
    } catch {
      return true;
    }
  }

  // a soft whoosh under the camera flight: filtered noise sweeping upward
  private playWhoosh(seconds: number): void {
    try {
      const ctx = this.audioCtx;
      if (!ctx) return;
      if (ctx.state === 'suspended') void ctx.resume().catch(() => {});
      const len = Math.ceil(ctx.sampleRate * seconds);
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.Q.value = 0.8;
      filter.frequency.setValueAtTime(220, ctx.currentTime);
      filter.frequency.exponentialRampToValueAtTime(950, ctx.currentTime + seconds);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.09, ctx.currentTime + seconds * 0.7);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + seconds);
      src.connect(filter);
      filter.connect(g);
      g.connect(ctx.destination);
      src.start();
      src.stop(ctx.currentTime + seconds);
    } catch { /* sound is a garnish, never an error */ }
  }

  private frame(now: number): void {
    if (this.destroyed) return;
    const gl = this.gl!;
    const dt = Math.min((now - this.lastFrame) / 1000, 0.1);
    this.lastFrame = now;
    const speed = this.reduceMotion.matches ? 0.25 : 1.0;
    const t = ((now - this.t0) / 1000) * speed;

    // Before `begin()`, hold the opening frame: the camera far out in the
    // cloudscape with no orb yet. This is what the entry screen blurs.
    if (this.deferred) {
      const gl0 = this.gl!;
      const U0 = this.uniforms;
      gl0.uniform2f(U0.uRes!, this.canvas.width, this.canvas.height);
      gl0.uniform1f(U0.uTime!, t);
      gl0.uniform1f(U0.uPulse!, 0);
      gl0.uniform1f(U0.uEnergy!, 0.3);
      gl0.uniform2f(U0.uLook!, 0.9, -0.38);
      gl0.uniform1f(U0.uKick!, 0);
      gl0.uniform1f(U0.uZoom!, ZOOM_FAR);
      gl0.uniform1f(U0.uDock!, 0);
      gl0.uniform1f(U0.uReveal!, 0);
      gl0.uniform1f(U0.uBurst!, 0);
      gl0.uniform1f(U0.uShift!, 0);
      gl0.uniform1f(U0.uShiftY!, 0);
      gl0.uniform1f(U0.uShapeA!, 0);
      gl0.uniform1f(U0.uShapeB!, 0);
      gl0.uniform1f(U0.uMorph!, 1);
      gl0.drawArrays(gl0.TRIANGLES, 0, 3);
      this.raf = requestAnimationFrame((n) => this.frame(n));
      return;
    }

    let target: number;
    if (this.mode === 'live' && this.mic) target = this.micEnvelope();
    else if (this.mode === 'speaking') target = speakingEnvelope(t);
    else if (this.mode === 'heartbeat') target = heartbeatEnvelope(t);
    else target = calmEnvelope(t);

    // fast attack, slow release: light behaves like loudness
    const rate = target > this.pulse ? 14 : 4.5;
    this.pulse += (target - this.pulse) * Math.min(1, rate * dt);
    this.energy += (this.pulse - this.energy) * Math.min(1, 2.2 * dt);
    this.kick += (this.kickTarget - this.kick) * Math.min(1, (this.kickTarget > this.kick ? 6 : 2.5) * dt);

    // entry scene timeline
    const tIntro = (now - this.t0) / 1000;
    let reveal = 1, burst = 1;
    if (tIntro < this.introFly) {
      const e = easeInOut(Math.min(1, tIntro / this.introFly));
      this.zoom = ZOOM_FAR + (ZOOM_HOME - ZOOM_FAR) * e;
      this.look.x = (1 - e) * 0.9;
      this.look.y = (1 - e) * -0.38;
      reveal = 0;
      burst = 0;
    } else {
      if (!this.revealTriggered) {
        this.revealTriggered = true;
        this.kick = Math.max(this.kick, 1.0); // the orb flares as it appears
        this.pendingShimmer = !this.playShimmer(); // chime now, or on first gesture
        this.hooks.onReveal?.();
      }
      reveal = easeOutBack(Math.min(1, (tIntro - this.introFly) / this.introReveal));
      burst = this.reduceMotion.matches ? 1 : Math.min(1, (tIntro - this.introFly) / 1.3);
      this.look.x += (this.look.tx - this.look.x) * Math.min(1, 3 * dt);
      this.look.y += (this.look.ty - this.look.y) * Math.min(1, 3 * dt);
      this.zoom += (this.zoomTarget - this.zoom) * Math.min(1, 4 * dt);
    }

    // expanded asset: the orb shrinks and parks at the panel header
    const dockTarget = this.expanded ? 1 : 0;
    this.dock += (dockTarget - this.dock) * Math.min(1, (this.reduceMotion.matches ? 30 : 6) * dt);

    const U = this.uniforms;
    gl.uniform2f(U.uRes!, this.canvas.width, this.canvas.height);
    gl.uniform1f(U.uTime!, t);
    gl.uniform1f(U.uPulse!, this.pulse);
    gl.uniform1f(U.uEnergy!, this.energy);
    gl.uniform2f(U.uLook!, this.look.x * (1 - this.dock), this.look.y * (1 - this.dock));
    gl.uniform1f(U.uKick!, this.kick);
    gl.uniform1f(U.uZoom!, this.zoom * (1 - this.dock) + ZOOM_HOME * this.dock);
    gl.uniform1f(U.uDock!, this.dock);
    gl.uniform1f(U.uReveal!, reveal * (1 - this.dock * 0.93)); // small enough for the porthole
    gl.uniform1f(U.uBurst!, burst);

    // panel open: the orb glides to the middle of the left two-thirds;
    // docked: to the porthole the host reports
    const minRes = Math.min(this.canvas.width, this.canvas.height);
    const openShiftX = this.chatOpen && window.innerWidth > 720
      ? -(this.canvas.width / 3) / minRes
      : 0;
    let wantX = openShiftX, wantY = 0;
    if (this.dock > 0.001) {
      const anchor = this.hooks.getDockAnchor?.();
      if (anchor) {
        const s = this.canvas.width / Math.max(1, this.canvas.clientWidth);
        const headX = (2 * anchor.x * s - this.canvas.width) / minRes;
        const headY = (2 * (this.canvas.clientHeight - anchor.y) * s - this.canvas.height) / minRes;
        wantX = openShiftX * (1 - this.dock) + headX * this.dock;
        wantY = headY * this.dock;
      }
    }
    this.sceneShift += (wantX - this.sceneShift) * Math.min(1, 5 * dt);
    this.sceneShiftY += (wantY - this.sceneShiftY) * Math.min(1, 5 * dt);
    gl.uniform1f(U.uShift!, this.sceneShift);
    gl.uniform1f(U.uShiftY!, this.sceneShiftY);

    // idle daydream: after a quiet minute in calm, wander into another shape.
    // Never while docked: the porthole avatar must stay the orb form.
    if (this.mode === 'calm' && this.revealTriggered && !this.expanded) {
      if (this.idleShape === 0 && this.shapeB === 0 && now - this.lastInteraction > 60000) {
        this.idleShape = 1 + Math.floor(Math.random() * 4);
        this.morphTo(this.idleShape);
        this.idleReturnAt = now + 10000 + MORPH_SECONDS * 1000;
      } else if (this.idleShape !== 0 && now >= this.idleReturnAt) {
        if (this.shapeB === this.idleShape) this.morphTo(0);
        this.idleShape = 0;
        this.lastInteraction = now; // a fresh quiet minute before the next one
      }
    } else if (this.idleShape !== 0) {
      if (this.shapeB === this.idleShape) this.morphTo(0);
      this.idleShape = 0;
    }

    this.morphT = Math.min(1, this.morphT + dt / MORPH_SECONDS);
    if (this.morphT >= 1) this.shapeA = this.shapeB; // settled: one SDF evaluation
    gl.uniform1f(U.uShapeA!, this.shapeA);
    gl.uniform1f(U.uShapeB!, this.shapeB);
    gl.uniform1f(U.uMorph!, easeInOut(this.morphT));

    gl.drawArrays(gl.TRIANGLES, 0, 3);
    this.raf = requestAnimationFrame((n) => this.frame(n));
  }
}
