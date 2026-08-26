/**
 * Imports real project artifacts out of a source bundle and into `/content`.
 *
 *   npm run artifacts:import -- "<path-to-bundle.zip>" <project-dir-name>
 *
 * Two things make this a committed script rather than a one-off command:
 *
 *   - **Auditability.** It prints every substitution it makes. When someone
 *     later asks "is there intern data in the published portfolio?", the answer
 *     is a reproducible command, not a memory.
 *   - **Repeatability.** New artifacts arrive; the sanitisation rules should
 *     not have to be reconstructed each time.
 *
 * Sanitisation is deliberately allowlist-shaped: it replaces a fixed, reviewed
 * map of names and addresses. It does not try to be a general PII detector,
 * because a general detector that misses one name is worse than no detector —
 * it produces false confidence. If the bundle contains a person this map does
 * not know about, the verification pass at the end fails loudly.
 */

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

/**
 * Reviewed substitutions.
 *
 * Personas are obviously fictional but natural, so the artifact still reads as
 * a real product rather than a redacted document — which matters, because this
 * is portfolio evidence. Placeholder first names are chosen not to collide with
 * any real first name in the set, so a partial replacement cannot hide behind a
 * name that looks already-substituted.
 *
 * A person appears in the artifacts in four places, and missing any one of them
 * leaks the identity: the display name, the avatar initials in a `users` data
 * array, the rendered avatar text, and the email address.
 */
interface Persona {
  name: string;
  initials: string;
  handle: string;
}

const PEOPLE: Array<{ real: Persona; fake: Persona }> = [
  { real: { name: 'Noa Levi', initials: 'NL', handle: 'noa' }, fake: { name: 'Lena Ortiz', initials: 'LO', handle: 'lena' } },
  { real: { name: 'Maya Ron', initials: 'MR', handle: 'maya' }, fake: { name: 'Priya Raman', initials: 'PR', handle: 'priya' } },
  { real: { name: 'Daniel Cohen', initials: 'DC', handle: 'daniel' }, fake: { name: 'Marcus Webb', initials: 'MW', handle: 'marcus' } },
  { real: { name: 'Shira Ben-David', initials: 'SB', handle: 'shira' }, fake: { name: 'Elena Duarte', initials: 'ED', handle: 'elena' } },
  { real: { name: 'Tomer Katz', initials: 'TK', handle: 'tomer' }, fake: { name: 'Victor Hale', initials: 'VH', handle: 'victor' } },
  { real: { name: 'Boaz Aviv', initials: 'BA', handle: 'boaz' }, fake: { name: 'Sam Okafor', initials: 'SO', handle: 'sam' } },
  { real: { name: 'Amit Shapira', initials: 'AS', handle: 'amit' }, fake: { name: 'Nadia Farouk', initials: 'NF', handle: 'nadia' } },
];

/**
 * Capitalised two-word phrases that are not people. Everything person-shaped
 * that is not here and not a persona fails the import.
 *
 * This inversion is the point. An allowlist of *names to replace* silently
 * passes anyone it does not know about — which is exactly what happened on the
 * first pass here: three people were missed because the detection regex could
 * not match a hyphenated surname, and the verifier only checked the names that
 * same regex had found.
 */
const NOT_PEOPLE = new Set([
  'Team Leader', 'Welcome Day', 'Figma Alignment', 'Helvetica Neue', 'Concept Brief',
  'Presentation Day', 'Internship Summary', 'Internship Program', 'Internship Platform',
  'Pro Text', 'Pro Display', 'Frank Ruhl', 'The Making', 'Liquid Glass', 'The Zemingo',
  'Ken Burns', 'Reusable Tweaks', 'The Tweak', 'Sign In', 'Google Workspace',
  'Program Overview', 'My Interns', 'My Dashboard', 'Design Canvas',
  'Design Component',
]);

/** Matches a person-shaped name, including hyphenated and apostrophised surnames. */
const NAME_SHAPED = /\b[A-Z][a-z]+(?:['-][A-Z][a-z]+)*\s+[A-Z][a-z]+(?:['-][A-Z][a-z]+)*\b/g;

const EMAIL_DOMAIN = 'zemingo.com';
const PLACEHOLDER_DOMAIN = 'example.com';

/** Files copied verbatim: the runtime and component code the artifacts import. */
const RUNTIME_FILES = ['support.js', 'animations-v2.jsx', 'making-of.jsx', 'tweaks-panel.jsx'];

/**
 * The artifact runtime pulls React and Babel from unpkg. Those are rewritten to
 * vendored copies under `artifacts/vendor/`.
 *
 * Not a security nicety — a reliability one. A portfolio that renders a blank
 * frame because a CDN is slow or blocked has failed at the moment it matters,
 * and embedding third-party scripts would also leak every visitor's IP to
 * unpkg. Vendoring keeps `connect-src 'none'` honest.
 */
const CDN_REWRITES: Array<[string, string]> = [
  ['https://unpkg.com/react@18.3.1/umd/react.production.min.js', './vendor/react.production.min.js'],
  ['https://unpkg.com/react-dom@18.3.1/umd/react-dom.production.min.js', './vendor/react-dom.production.min.js'],
  ['https://unpkg.com/@babel/standalone@7.29.0/babel.min.js', './vendor/babel.min.js'],
];

function rewriteCdnUrls(contents: string, file: string, log: Substitution[]): string {
  let output = contents;
  for (const [from, to] of CDN_REWRITES) {
    const count = output.split(from).length - 1;
    if (count > 0) {
      output = output.split(from).join(to);
      log.push({ file, from, to, count });
    }
  }
  return output;
}

const ARTIFACTS = [
  'Internship Platform.dc.html',
  'Internship Platform - Zemingo x iOS26.dc.html',
  'Internship Platform - Zemingo.dc.html',
  'Making Of.dc.html',
];

/** Slugs the app refers to them by. Stable ids, unlike the display filenames. */
const SLUGS: Record<string, string> = {
  'Internship Platform.dc.html': 'stage-prototype.html',
  'Internship Platform - Zemingo x iOS26.dc.html': 'stage-ios26.html',
  'Internship Platform - Zemingo.dc.html': 'stage-zemingo.html',
  'Making Of.dc.html': 'making-of.html',
};

interface Substitution {
  file: string;
  from: string;
  to: string;
  count: number;
}

function sanitize(contents: string, file: string, log: Substitution[]): string {
  let output = contents;

  const swap = (from: string, to: string) => {
    const count = output.split(from).length - 1;
    if (count === 0) return;
    output = output.split(from).join(to);
    log.push({ file, from, to, count });
  };

  for (const { real, fake } of PEOPLE) {
    swap(real.name, fake.name);
    swap(`${real.handle}@${EMAIL_DOMAIN}`, `${fake.handle}@${PLACEHOLDER_DOMAIN}`);
    // The `users` data array.
    swap(`initials: "${real.initials}"`, `initials: "${fake.initials}"`);
    swap(`initials: '${real.initials}'`, `initials: '${fake.initials}'`);
    // Rendered avatar text.
    for (const tag of ['div', 'span']) {
      swap(`>${real.initials}</${tag}>`, `>${fake.initials}</${tag}>`);
    }
  }

  // Catch-all for any address on the real domain a handle mapping missed.
  output = output.replace(
    new RegExp(`([A-Za-z0-9._%+-]+)@${EMAIL_DOMAIN.replace('.', '\\.')}`, 'g'),
    (_match, local: string) => {
      log.push({ file, from: `${local}@${EMAIL_DOMAIN}`, to: `${local}@${PLACEHOLDER_DOMAIN}`, count: 1 });
      return `${local}@${PLACEHOLDER_DOMAIN}`;
    },
  );

  return output;
}

/**
 * Fails the import if personal data survives.
 *
 * Two checks. The first is targeted: no address on the real domain, no known
 * real name. The second is the important one — *any* unrecognised person-shaped
 * phrase fails, whether or not this script knew about it. A new bundle
 * containing a new colleague stops the import rather than publishing them.
 *
 * A bare mention of the company domain is not personal data: the artifacts
 * legitimately contain "Restricted to the zemingo.com workspace" on the SSO
 * screen and a mock browser URL, both product copy for a cleared project.
 */
function verify(contents: string, file: string): string[] {
  const problems: string[] = [];

  const onRealDomain = contents.match(
    new RegExp(`[A-Za-z0-9._%+-]+@${EMAIL_DOMAIN.replace('.', '\\.')}`, 'g'),
  );
  if (onRealDomain) {
    problems.push(`${file}: personal address(es) remain: ${[...new Set(onRealDomain)].join(', ')}`);
  }

  for (const { real } of PEOPLE) {
    if (contents.includes(real.name)) problems.push(`${file}: still contains the name "${real.name}"`);
  }

  // Ignore package specifiers like `@babel/standalone@7.29.0`, which are not addresses.
  const stray = contents
    .replace(/https?:\/\/[^\s"'<>]+/g, '')
    .match(/[A-Za-z0-9._%+-]+@(?!example\.com)[A-Za-z0-9.-]+\.[a-z]{2,}/g);
  if (stray) problems.push(`${file}: address(es) on an unexpected domain: ${[...new Set(stray)].join(', ')}`);

  const personas = new Set(PEOPLE.map((p) => p.fake.name));
  const unrecognised = new Set(
    (contents.match(NAME_SHAPED) ?? []).filter((n) => !personas.has(n) && !NOT_PEOPLE.has(n)),
  );
  if (unrecognised.size > 0) {
    problems.push(
      `${file}: unrecognised person-shaped name(s): ${[...unrecognised].join(', ')}. ` +
        `Add each to PEOPLE (if a person) or NOT_PEOPLE (if not) and re-run.`,
    );
  }

  return problems;
}

function main(): void {
  const [bundlePath, projectDir] = process.argv.slice(2);
  if (!bundlePath || !projectDir) {
    console.error('usage: import-artifacts <bundle.zip> <project-dir-name>');
    process.exit(1);
  }

  const destination = resolve(process.cwd(), 'content', 'projects', projectDir, 'artifacts');
  mkdirSync(destination, { recursive: true });

  const workspace = mkdtempSync(join(tmpdir(), 'par-artifacts-'));
  execFileSync('unzip', ['-o', '-q', resolve(bundlePath), '-d', workspace]);

  const log: Substitution[] = [];
  const problems: string[] = [];

  // Runtime first: the artifacts reference it by a content-versioned URL, so
  // its final bytes have to exist before they are written.
  let supportVersion = '';
  for (const runtime of RUNTIME_FILES) {
    const source = join(workspace, runtime);
    if (!existsSync(source)) continue;
    // Runtime code is sanitised too — component files can carry sample data.
    const contents = readFileSync(source, 'utf8');
    const processed = rewriteCdnUrls(sanitize(contents, runtime, log), runtime, log);
    problems.push(...verify(processed, runtime));
    if (processed === contents) copyFileSync(source, join(destination, runtime));
    else writeFileSync(join(destination, runtime), processed, 'utf8');
    if (runtime === 'support.js') {
      supportVersion = createHash('sha256').update(processed).digest('hex').slice(0, 12);
    }
  }

  for (const artifact of ARTIFACTS) {
    const source = join(workspace, artifact);
    if (!existsSync(source)) {
      console.warn(`  skipped (not in bundle): ${artifact}`);
      continue;
    }
    let contents = rewriteCdnUrls(sanitize(readFileSync(source, 'utf8'), artifact, log), artifact, log);

    // Content-version the runtime reference. Without this the browser holds a
    // cached support.js across re-imports and boots the previous runtime — the
    // artifact renders blank with no error that points at the cause.
    if (supportVersion) {
      contents = contents.replace(/(["'])\.\/support\.js(["'])/g, `$1./support.js?v=${supportVersion}$2`);
    }

    problems.push(...verify(contents, artifact));
    writeFileSync(join(destination, SLUGS[artifact] ?? artifact), contents, 'utf8');
  }

  console.log(`\nImported into content/projects/${projectDir}/artifacts\n`);
  const byFile = new Map<string, Substitution[]>();
  for (const entry of log) {
    const existing = byFile.get(entry.file);
    if (existing) existing.push(entry);
    else byFile.set(entry.file, [entry]);
  }
  if (byFile.size === 0) {
    console.log('No substitutions were necessary.');
  } else {
    console.log('Substitutions:');
    for (const [file, entries] of byFile) {
      console.log(`  ${file}`);
      const merged = new Map<string, number>();
      for (const e of entries) merged.set(`${e.from} -> ${e.to}`, (merged.get(`${e.from} -> ${e.to}`) ?? 0) + e.count);
      for (const [change, count] of merged) console.log(`    ${change}  (${count}x)`);
    }
  }

  if (problems.length > 0) {
    console.error('\nVERIFICATION FAILED — artifacts were NOT left in a publishable state:');
    for (const problem of problems) console.error(`  ${problem}`);
    process.exit(1);
  }
  console.log('\nVerification passed: no known names and no real-domain addresses remain.');
}

main();
