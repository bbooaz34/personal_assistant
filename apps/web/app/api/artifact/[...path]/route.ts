/**
 * Serves real project artifacts for embedding (design doc §9).
 *
 * These are the actual files produced during the work — the platform at each
 * stage of its visual evolution — not screenshots of them. Rendering the real
 * thing inside the conversation is the difference between describing a
 * redesign and letting someone click through it.
 *
 * Serving arbitrary HTML from your own origin is the dangerous part, so:
 *
 *   - Paths are resolved and checked to stay inside a project's `artifacts`
 *     directory. A `..` segment cannot walk out into the knowledge base.
 *   - Only known extensions are served, with fixed content types.
 *   - A CSP restricts what the artifact can reach, and `frame-ancestors 'self'`
 *     stops anyone else embedding it.
 *   - The embedding iframe sandboxes without `allow-same-origin`, so the
 *     document runs in an opaque origin and cannot touch the app around it.
 */

import { readFile, stat } from 'node:fs/promises';
import { join, resolve, extname } from 'node:path';
import { contentRoot } from '@/lib/agent';

export const runtime = 'nodejs';

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.jsx': 'text/plain; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.json': 'application/json',
};

/**
 * The artifacts are self-contained apart from Google Fonts. Everything else is
 * denied — notably `connect-src 'none'`, so an artifact cannot phone home with
 * anything it observes.
 */
/**
 * Built per-request against the serving origin rather than using `'self'`.
 *
 * The embedding iframe sandboxes without `allow-same-origin`, so the artifact
 * document runs in an *opaque* origin — and inside it, `'self'` resolves to
 * that opaque origin, not to this server. A `script-src 'self'` therefore
 * blocks the artifact from loading its own runtime, and the frame renders
 * blank. Naming the origin explicitly is what makes the sandbox and the CSP
 * work together.
 */
function buildCsp(origin: string): string {
  return [
    "default-src 'none'",
    `script-src ${origin} 'unsafe-inline' 'unsafe-eval'`,
    `style-src ${origin} 'unsafe-inline' https://fonts.googleapis.com`,
    `font-src ${origin} data: https://fonts.gstatic.com`,
    `img-src ${origin} data: blob:`,
    `media-src ${origin} data: blob:`,
    // The runtime fetches its own document to parse the <x-dc> source, so a
    // blanket 'none' breaks it. Restricting to this origin keeps the property
    // that matters: the artifact can read its own files and cannot send
    // anything it observes to a third party.
    `connect-src ${origin}`,
    // Only the app may frame an artifact. When ARTIFACT_ORIGIN puts artifacts
    // on their own host, this is what stops anyone else embedding them.
    `frame-ancestors 'self' ${process.env.APP_ORIGIN ?? ''}`.trim(),
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
}

export async function GET(
  request: Request,
  context: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path: segments } = await context.params;

  if (!segments || segments.length < 2) {
    return new Response('Not found', { status: 404 });
  }

  const [projectDir, ...rest] = segments;
  const artifactsRoot = resolve(contentRoot(), 'content', 'projects', projectDir!, 'artifacts');
  const target = resolve(join(artifactsRoot, ...rest));

  // Containment check. `resolve` has already collapsed any `..`, so this
  // comparison is the whole guard — it must run before any read.
  if (target !== artifactsRoot && !target.startsWith(`${artifactsRoot}/`)) {
    return new Response('Not found', { status: 404 });
  }

  const extension = extname(target).toLowerCase();
  const contentType = CONTENT_TYPES[extension];
  if (!contentType) {
    return new Response('Unsupported artifact type', { status: 415 });
  }

  try {
    const info = await stat(target);
    if (!info.isFile()) return new Response('Not found', { status: 404 });
  } catch {
    return new Response('Not found', { status: 404 });
  }

  const body = await readFile(target);
  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': contentType,
      'content-security-policy': buildCsp(new URL(request.url).origin),
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      // Artifacts are immutable in a deployed build, but during development
      // a cached runtime silently hides re-imports — the page keeps booting
      // the previous support.js and looks broken for no visible reason.
      'cache-control':
        process.env.NODE_ENV === 'production' ? 'public, max-age=3600' : 'no-store',
    },
  });
}
