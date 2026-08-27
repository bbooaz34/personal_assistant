/**
 * The orb's shaders, lifted verbatim from the External Brain OS orb
 * (`orb/src/vox-orb.html`, provided by the owner as the new interface).
 *
 * One fullscreen triangle; the fragment shader raymarches the whole scene —
 * the translucent body SDF (five morphable shapes), interior light vines via a
 * confined volumetric march, a daylight cloudscape with a one-tap sun shadow,
 * and the orb as the frame's only coloured light. See docs/ARCHITECTURE.md
 * ("The face") for how the uniforms are driven.
 *
 * Deliberately untouched: this file is the design. Behavioural integration
 * happens in engine.ts, which only writes uniforms.
 */

export const VERT = `#version 300 es
  void main() {
    // fullscreen triangle from gl_VertexID, no buffers needed
    vec2 p = vec2((gl_VertexID << 1) & 2, gl_VertexID & 2);
    gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
  }`;

export const FRAG = `#version 300 es
  precision highp float;

  uniform vec2  uRes;
  uniform float uTime;
  uniform float uPulse;    // fast rhythm envelope, 0..1
  uniform float uEnergy;   // slow smoothed energy, 0..1
  uniform vec2  uLook;     // pointer parallax, -1..1
  uniform float uKick;     // press-and-hold excitement, 0..1
  uniform float uZoom;     // camera distance from the orb
  uniform float uShapeA;   // shape ids: 0 orb, 1 question, 2 ball, 3 lava, 4 heart
  uniform float uShapeB;
  uniform float uMorph;    // 0 -> shape A, 1 -> shape B, eased in JS
  uniform float uReveal;   // entry scene: body scale, 0 hidden -> 1 present
  uniform float uBurst;    // entry scene: reveal shockwave progress, 0 -> 1
  uniform float uShift;    // uv-x of the scene centre: chat open moves the
                           // orb to the middle of the left two-thirds
  uniform float uShiftY;   // uv-y companion: the expanded-asset dock parks
                           // the shrunken orb at the chat header
  uniform float uDock;     // 1 while docked: damps bob and displacement so
                           // the mini orb stays inside its porthole

  out vec4 outColor;

  // --- value noise ---------------------------------------------------------
  float hash(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.71, 0.113, 0.419));
    p *= 17.0;
    return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
  }
  float noise(vec3 x) {
    vec3 i = floor(x);
    vec3 f = fract(x);
    f = f * f * (3.0 - 2.0 * f);
    float n000 = hash(i + vec3(0,0,0)), n100 = hash(i + vec3(1,0,0));
    float n010 = hash(i + vec3(0,1,0)), n110 = hash(i + vec3(1,1,0));
    float n001 = hash(i + vec3(0,0,1)), n101 = hash(i + vec3(1,0,1));
    float n011 = hash(i + vec3(0,1,1)), n111 = hash(i + vec3(1,1,1));
    return mix(mix(mix(n000, n100, f.x), mix(n010, n110, f.x), f.y),
               mix(mix(n001, n101, f.x), mix(n011, n111, f.x), f.y), f.z);
  }
  float fbm(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 4; i++) {
      v += a * (noise(p) * 2.0 - 1.0);
      p = p * 2.03 + vec3(1.7, 9.2, 4.1);
      a *= 0.5;
    }
    return v; // roughly -1..1
  }
  float fbm3(vec3 p) {
    float v = 0.0, a = 0.5;
    for (int i = 0; i < 3; i++) {
      v += a * (noise(p) * 2.0 - 1.0);
      p = p * 2.03 + vec3(1.7, 9.2, 4.1);
      a *= 0.5;
    }
    return v;
  }

  // --- shape SDFs for the morph state machine ------------------------------
  float sdSeg2(vec2 p, vec2 a, vec2 b) {
    vec2 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h);
  }
  // arc symmetric about +y covering |angle| < aperture; sc = (sin, cos)
  float sdArc(vec2 p, vec2 sc, float ra, float rb) {
    p.x = abs(p.x);
    return ((sc.y * p.x > sc.x * p.y) ? length(p - sc * ra)
                                      : abs(length(p) - ra)) - rb;
  }
  float sdQuestion(vec3 p) {
    vec2 q = p.xy * 1.15;
    // hook: 250-degree arc, midpoint rotated onto +y
    vec2 hp = q - vec2(0.0, 0.42);
    float ca = cos(0.6109), sa = sin(0.6109);
    hp = mat2(ca, sa, -sa, ca) * hp;
    float dHook = sdArc(hp, vec2(sin(2.18), cos(2.18)), 0.45, 0.14);
    float dStem = sdSeg2(q, vec2(0.02, 0.0), vec2(0.0, -0.22)) - 0.13;
    float dDot  = length(q - vec2(0.0, -0.66)) - 0.16;
    float d2 = min(dHook, min(dStem, dDot)) / 1.15;
    vec2 w = vec2(d2, abs(p.z) - 0.16);
    return min(max(w.x, w.y), 0.0) + length(max(w, 0.0)) - 0.10;
  }
  float sdCapsule3(vec3 p, vec3 a, vec3 b, float r) {
    vec3 pa = p - a, ba = b - a;
    float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
    return length(pa - ba * h) - r;
  }
  float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
    return mix(b, a, h) - k * h * (1.0 - h);
  }
  float sdEllipsoid(vec3 p, vec3 r) {
    float k0 = length(p / r);
    float k1 = length(p / (r * r));
    return k0 * (k0 - 1.0) / k1;
  }
  // a ball on a loop: parabolic arc, squashed on impact, stretched in flight
  float jumpY() {
    float ph = fract(uTime * 0.9);
    return -0.48 + 1.05 * 4.0 * ph * (1.0 - ph);
  }
  float sdJumpy(vec3 p) {
    float ph = fract(uTime * 0.9);
    float h = 4.0 * ph * (1.0 - ph);          // 0 at the floor, 1 at the peak
    float impact = exp(-14.0 * h);            // spikes at takeoff and landing
    float stretch = clamp(abs(1.0 - 2.0 * ph) * 0.9, 0.0, 0.7) * (1.0 - impact);
    vec3 r = vec3(0.44 * (1.0 + 0.30 * impact - 0.08 * stretch),
                  0.44 * (1.0 - 0.28 * impact + 0.18 * stretch),
                  0.44 * (1.0 + 0.30 * impact - 0.08 * stretch));
    return sdEllipsoid(p - vec3(0.0, jumpY(), 0.0), r);
  }
  // lava lamp: five blobs on slow independent cycles, merging as they pass
  float sdLava(vec3 p) {
    float d = 1e5;
    for (int i = 0; i < 5; i++) {
      float fi = float(i);
      float ph = uTime * (0.30 + 0.06 * fi) + fi * 2.4;
      vec3 c = vec3(0.26 * sin(fi * 2.1 + uTime * 0.20),
                    0.60 * sin(ph),
                    0.10 * sin(fi * 1.7 + uTime * 0.16));
      float r = 0.20 + 0.08 * sin(fi * 3.3 + uTime * 0.45);
      d = smin(d, length(p - c) - r, 0.22);
    }
    return d;
  }
  // a heart traced as a tube: both lobes draw together, symmetrically,
  // rising from the tip and meeting at the notch, then erase back down
  float sdHeart(vec3 p) {
    float cyc = fract(uTime * 0.09);
    float drawn = smoothstep(0.0, 1.0, 1.0 - abs(1.0 - 2.0 * cyc));
    float fEnd = max(drawn, 0.06);            // never fully vanishes
    vec3 q = vec3(abs(p.x), p.y, p.z);        // the mirror is the symmetry
    float d = 1e5;
    vec3 prev = vec3(0.0);
    for (int i = 0; i <= 26; i++) {
      float f = float(i) / 26.0;
      if (f > fEnd) break;
      float u = 3.14159 * (1.0 - f);          // tip (u=pi) up to the notch (u=0)
      float s = sin(u);
      vec2 hc = vec2(16.0 * s * s * s,
                     13.0 * cos(u) - 5.0 * cos(2.0 * u) - 2.0 * cos(3.0 * u) - cos(4.0 * u));
      vec3 cur = vec3(hc.x / 16.0 * 0.74, hc.y / 17.0 * 0.82 + 0.06, 0.0);
      if (i > 0) d = min(d, sdCapsule3(q, prev, cur, 0.105));
      prev = cur;
    }
    return d;
  }
  float shapeSDF(vec3 p, float id) {
    if (id < 0.5) return length(p) - (0.80 + 0.05 * uPulse); // the orb
    if (id < 1.5) return sdQuestion(p);
    if (id < 2.5) return sdJumpy(p);
    if (id < 3.5) return sdLava(p);
    return sdHeart(p);
  }
  // the analytic body of the current blend, noise-free: what the glass
  // interior and the vines fill
  float bodySDF(vec3 lp) {
    float scl = max(uReveal, 0.02);
    lp /= scl;
    float d = shapeSDF(lp, uShapeA);
    if (abs(uShapeB - uShapeA) > 0.5) d = mix(d, shapeSDF(lp, uShapeB), uMorph);
    return d * scl;
  }
  // how much of the noise displacement each shape keeps
  float ampFor(float id) {
    if (id < 0.5) return 1.0;
    if (id < 1.5) return 0.18;  // question mark
    if (id < 2.5) return 0.06;  // jumpy ball stays clean
    if (id < 3.5) return 0.30;  // lava enjoys extra goo
    return 0.08;                // the heart line must stay a line
  }
  // where the shape's body currently is: the noise and the vines ride this,
  // so the bouncing ball carries its texture instead of sliding through it
  vec3 anchorFor(float id) {
    if (id > 1.5 && id < 2.5) return vec3(0.0, jumpY(), 0.0);
    return vec3(0.0);
  }
  // how far the dense glass core sits inside the shell: the frosted gap
  float insetFor(float id) {
    if (id < 0.5) return 0.14;  // the orb's signature fringe
    if (id < 1.5) return 0.07;
    if (id < 2.5) return 0.10;
    if (id < 3.5) return 0.05;
    return 0.02;                // a thin tube has no room for a gap
  }

  mat3 rotY(float a) {
    float c = cos(a), s = sin(a);
    return mat3(c, 0, -s, 0, 1, 0, s, 0, c);
  }
  mat3 rotX(float a) {
    float c = cos(a), s = sin(a);
    return mat3(1, 0, 0, 0, c, s, 0, -s, c);
  }

  // --- the morphing mass ---------------------------------------------------
  // Shared motion: the bob and the tumble, computed once in main so the
  // surface and the vines inside it move as one body.
  vec3 gBob;
  mat3 gTumble;

  // Returns distance; also outputs the displacement so shading can use it.
  float map(vec3 p, out float disp) {
    // gentle float: the whole mass bobs and sways
    p -= gBob;

    // entry reveal: the whole body scales up from nothing around its centre
    float scl = max(uReveal, 0.02);
    p /= scl;

    // slow tumble of the noise domain, so the surface flows. The noise is
    // anchored to the shape's animated centre so its texture travels along.
    vec3 anchor = mix(anchorFor(uShapeA), anchorFor(uShapeB), uMorph);
    vec3 q = gTumble * (p - anchor);

    float amp = 0.10 + 0.16 * uPulse + 0.22 * uKick;
    // shapes hold most of their displacement back, or they stop reading;
    // the docked avatar calms down so it never breaches the porthole
    amp *= mix(ampFor(uShapeA), ampFor(uShapeB), uMorph) * (1.0 - uDock * 0.55);
    float n = fbm(q * 1.7 + vec3(0.0, uTime * 0.30, uTime * 0.12));
    // a second, finer ripple that only shows when it is excited
    n += (0.10 + 0.55 * uKick) * 0.35 * fbm(q * 4.6 - vec3(uTime * 0.5, 0.0, 0.0));

    disp = n;
    float d = shapeSDF(p, uShapeA);
    if (abs(uShapeB - uShapeA) > 0.5) {
      d = mix(d, shapeSDF(p, uShapeB), uMorph);
    }
    return (d - amp * n) * scl;
  }
  float mapD(vec3 p) { float d; return map(p, d); }

  // --- light vines -----------------------------------------------------------
  // Two independent noise fields; where both pass through zero is a curve in
  // 3D, and exp(-w^2) turns the distance to that curve into a thin filament.
  float vineField(vec3 lp, out float hue) {
    vec3 q = gTumble * lp;
    float t = uTime * 0.22;
    float a = fbm3(q * 2.9 + vec3(0.0, t, 0.0));
    float b = fbm3(q * 2.9 + vec3(5.2, -t * 0.7, 1.7));
    hue = 0.5 + 0.5 * sin(b * 6.0 + uTime * 0.4);
    float w = length(vec2(a, b));
    // Lorentzian, not gaussian: the 1/w^2 tails keep a hairline continuous
    // between march samples, where a sharp falloff breaks into dots
    return 0.001 / (0.001 + w * w);
  }

  vec3 normalAt(vec3 p) {
    const vec2 e = vec2(0.004, -0.004);
    return normalize(
      e.xyy * mapD(p + e.xyy) + e.yyx * mapD(p + e.yyx) +
      e.yxy * mapD(p + e.yxy) + e.xxx * mapD(p + e.xxx));
  }

  void main() {
    vec2 uv = (gl_FragCoord.xy * 2.0 - uRes) / min(uRes.x, uRes.y);
    uv.x -= uShift;
    uv.y -= uShiftY;

    gBob = vec3(0.04 * sin(uTime * 0.37 + 1.6), 0.07 * sin(uTime * 0.55), 0.0)
         * (1.0 - uDock * 0.92);
    gTumble = rotY(uTime * 0.16) * rotX(0.35 * sin(uTime * 0.11));

    // camera with a whisper of pointer parallax
    mat3 look = rotY(uLook.x * 0.38) * rotX(-uLook.y * 0.26);
    vec3 ro = look * vec3(0.0, 0.0, uZoom);
    vec3 rd = look * normalize(vec3(uv, -2.05));

    // march
    float t = 0.0, glow = 0.0, disp = 0.0, hitDisp = 0.0;
    bool hit = false;
    vec3 pos = ro;
    for (int i = 0; i < 88; i++) {
      pos = ro + rd * t;
      float d = map(pos, disp);
      glow += exp(-abs(d) * 7.0) * 0.016;
      if (d < 0.0025 * t) { hit = true; hitDisp = disp; break; }
      t += d * 0.55;              // conservative: the field is displaced
      if (t > uZoom + 3.5) break; // the entry flight starts far out
    }

    // palette: hot magenta / violet / cyan, dimming with the rhythm
    vec3 cPink   = vec3(1.00, 0.18, 0.62);
    vec3 cViolet = vec3(0.50, 0.28, 1.00);
    vec3 cCyan   = vec3(0.20, 0.92, 1.00);

    float bright = 0.30 + 0.62 * uEnergy + 0.7 * uKick;

    // the orb's light on its surroundings, shared by clouds, sky and the
    // screen-edge wash
    vec3 orbLight = mix(cViolet, cPink, 0.4 + 0.4 * uPulse)
                  * (0.6 + 2.4 * uEnergy + 2.0 * uKick);

    // daylight sky: pre-tonemap values above 1 so the roll-off lands on
    // white at the zenith and a faint cool lavender at the horizon
    float r2 = dot(uv, uv);
    vec3 col = mix(vec3(1.40, 1.56, 2.10), vec3(2.30, 2.45, 2.85),
                   smoothstep(-0.35, 0.75, rd.y));
    col *= 1.0 - 0.05 * min(r2, 1.4);

    if (hit) {
      vec3 skyBehind = col;
      vec3 n = normalAt(pos);
      float fres = pow(1.0 - max(dot(n, -rd), 0.0), 3.0);

      // color drifts across the surface with the same noise that shapes it
      float mixA = smoothstep(-0.7, 0.7, hitDisp);
      float mixB = 0.5 + 0.5 * sin(pos.y * 3.1 + pos.x * 1.3 + uTime * 0.5);
      vec3 skin = mix(cViolet, cPink, mixA);
      skin = mix(skin, cCyan, 0.35 * mixB * mixB);

      vec3 pl = pos - gBob;

      // dark translucent core, luminous rim
      vec3 core = skin * 0.015;
      vec3 rim  = skin * (0.10 + 2.4 * fres);

      // ridges (positive displacement) glow like filaments
      float filament = smoothstep(0.25, 0.85, hitDisp);
      rim += cPink * filament * (0.35 + 1.3 * uPulse);

      vec3 lightDir = look * normalize(vec3(0.55, 0.7, 0.5));
      float diff = max(dot(n, lightDir), 0.0);

      // translucency: the sky transmits through the body like coloured
      // glass. Interior depth is sampled from the analytic body of the
      // current shape blend, so the glass fills a question mark's hook or
      // a thumb to its edges exactly as it fills the sphere.
      float inset = mix(insetFor(uShapeA), insetFor(uShapeB), uMorph);
      float thick = 0.0;
      for (int i = 0; i < 8; i++) {
        vec3 sp2 = pl + rd * (0.06 + float(i) * 0.19);
        // the inset holds the dense core off the shell, leaving the
        // frosted translucent gap between the two layers
        thick += smoothstep(0.02, -0.10, bodySDF(sp2) + inset) * 0.19;
      }
      vec3 tint = skin / (max(max(skin.r, skin.g), skin.b) + 1e-3);
      // the 0.8 keeps the outer layer 20% less transparent than raw glass
      vec3 through = skyBehind * pow(tint, vec3(thick * 2.0 + 0.3)) * exp(-thick * 1.1) * 0.8;

      col = core + rim * bright + skin * diff * 0.04 + through;
      // soft self-light through the thin edges
      col += cCyan * fres * fres * fres * 0.8 * bright;

      // interior: march on through the translucent body accumulating light
      // from the vines, self-shadowed by absorption so depth reads
      vec3 anchor2 = mix(anchorFor(uShapeA), anchorFor(uShapeB), uMorph);
      float vineGain = 0.75 + 1.7 * uPulse + 2.0 * uKick;
      float dt = 1.5 / 38.0;
      // no per-pixel jitter: neighbouring rays must sample at the same
      // depths or the decorrelation paints stipple across the interior.
      // The filament profile's wide tails are what keep uniform sampling
      // free of banding.
      float trans = 1.0;
      vec3 vines = vec3(0.0);
      for (int i = 0; i < 38; i++) {
        vec3 vp = pos + rd * (float(i) + 0.5) * dt - gBob;
        if (length(vp) > 1.6) break;
        // vines live wherever the current body is: the analytic shape SDF
        // confines them, held slightly inside so the frosted gap stays clear
        float shell = smoothstep(0.02, -0.16, bodySDF(vp) + inset * 0.6);
        float hue;
        float v = vineField(vp - anchor2, hue) * shell;
        vec3 em = mix(cPink * 2.6, cCyan * 1.9, hue * hue);
        // the core term rides v^2, so only the filament centre burns white
        em += vec3(1.0, 0.80, 0.95) * v * v * 1.6;
        vines += trans * em * v * dt;
        trans *= exp(-v * dt * 2.0);
      }
      col += vines * vineGain;

    }

    // accumulated halo: kept gentle, since additive glow mostly saturates
    // against a bright sky and reads best where the clouds catch it
    vec3 haloTint = mix(cViolet, cPink, 0.45 + 0.45 * uPulse);
    haloTint = mix(haloTint, cCyan, 0.25 * uKick);
    float haloGain = hit ? 0.25 : 0.55;
    col += haloTint * glow * haloGain * (0.55 + 1.6 * uEnergy + 1.2 * uKick);

    // clouds on the rays that miss the orb only: they surround it, but a
    // cloud is never allowed between the camera and the orb itself
    if (!hit) {
      vec3 wind = vec3(uTime * 0.045, uTime * 0.012, uTime * 0.028);
      float t0 = 0.35;
      float tEnd = uZoom + 4.2;
      float cdt = (tEnd - t0) / 22.0;
      float ctrans = 1.0;
      vec3 cloudAcc = vec3(0.0);
      vec3 sunDir = normalize(vec3(0.35, 0.8, 0.3));
      for (int i = 0; i < 22; i++) {
        vec3 cp = ro + rd * (t0 + (float(i) + 0.5) * cdt);
        float den = fbm(cp * 0.5 + wind) + 0.45 * fbm3(cp * 1.8 - wind * 1.3);
        den = smoothstep(0.22, 0.85, den) * 0.9;
        // keep a clear pocket around the orb so it floats in a cavity
        float dOrb = length(cp - gBob);
        den *= smoothstep(1.25, 1.9, dOrb);
        if (den > 0.003) {
          // one density sample toward the sun: this shadow is what makes a
          // white cloud readable against a white sky
          float sden = smoothstep(0.22, 0.85, fbm3((cp + sunDir * 0.6) * 0.5 + wind));
          float light = exp(-sden * 3.2);
          vec3 cloudCol = mix(vec3(0.85, 1.02, 1.50), vec3(3.10, 3.06, 3.00), light);
          // the orb lights the clouds: slow falloff so even banks at the
          // frame edge pick up its colour
          cloudCol += orbLight / (1.0 + dOrb * dOrb * 0.4);
          float a = 1.0 - exp(-den * cdt * 9.0);
          cloudAcc += ctrans * cloudCol * a;
          ctrans *= 1.0 - a;
          if (ctrans < 0.02) break;
        }
      }
      col = cloudAcc + col * ctrans;

      // the screen edges reflect the orb: white vapour takes a pink cast
      // that strengthens with every pulse. Multiplicative, because additive
      // light disappears against a white sky.
      float bCA = max(dot(gBob - ro, rd), 0.0);
      float dRay = length(gBob - ro - rd * bCA);
      float wash = (0.30 + 0.85 * uPulse + 0.7 * uKick) / (1.0 + dRay * dRay * 0.55);
      wash = min(wash, 1.0);
      col = mix(col, col * vec3(1.05, 0.74, 0.96) + orbLight * 0.12, wash);
    }

    // entry shockwave: an expanding ring of light through the clouds,
    // fading as it travels, announcing the orb
    if (uBurst > 0.001 && uBurst < 0.999) {
      float bCA2 = max(dot(gBob - ro, rd), 0.0);
      float dR = length(gBob - ro - rd * bCA2);
      float radius = uBurst * 3.2;
      float ring = exp(-pow((dR - radius) * 6.0, 2.0));
      col += mix(cPink, cCyan, uBurst) * ring * (1.0 - uBurst) * 1.8;
    }

    // filmic-ish tonemap + gamma, then a saturation nudge so the
    // neon survives the roll-off
    col = 1.0 - exp(-col * 1.3);
    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = clamp(mix(vec3(luma), col, 1.5), 0.0, 1.0);
    col = pow(col, vec3(1.0 / 2.2));

    // dither to kill banding in the halo
    col += (hash(vec3(gl_FragCoord.xy, uTime)) - 0.5) / 255.0;

    outColor = vec4(col, 1.0);
  }`;
