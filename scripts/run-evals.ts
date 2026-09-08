/**
 * Runs the recruiter evaluation set (design doc §33).
 *
 * No model is called. That is deliberate: this suite asserts the properties
 * that must hold regardless of which model is configured — that closed topics
 * refuse, that injection is caught, that the right evidence is retrieved, and
 * that a question with no support comes back empty rather than half-matched.
 * Those are the regressions that quietly break a grounded agent.
 *
 * Answer *quality* needs an LLM-judged suite on top of this. This is the floor.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { loadKnowledge } from '@par/knowledge';
import { Agent } from '@par/agent';
import { createSession } from '@par/analytics';
import { agentConfig, identityConfig } from '@par/config';

interface EvalExpectation {
  policy: 'allow' | 'refuse' | 'injection';
  topic?: string;
  evidenceIncludesAny?: string[];
  evidenceExcludes?: string[];
  evidenceEmpty?: boolean;
}

interface EvalCase {
  id: string;
  question: string;
  note?: string;
  expect: EvalExpectation;
}

/**
 * Extra assertions for individual starter prompts, keyed by the prompt text.
 *
 * The prompts themselves are never written down here — they are read from
 * `identityConfig`, so every prompt the product ships is covered the moment
 * it is added, and none can drift out of test. This map only says what a
 * *particular* prompt must retrieve beyond "something".
 */
type StarterExpectations = Record<string, Omit<EvalExpectation, 'policy'>>;

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
}

/**
 * Builds one case per starter prompt in the opening script.
 *
 * These are the only questions the product itself puts in front of a visitor.
 * A starter prompt that retrieves nothing is not a weak answer, it is a
 * guaranteed first impression of an agent that knows nothing — so the floor
 * for every one of them is that it retrieves at all.
 */
function starterCases(extra: StarterExpectations): EvalCase[] {
  const cases: EvalCase[] = [];
  for (const variant of identityConfig.openings.variants) {
    for (const prompt of variant.starter_prompts) {
      cases.push({
        id: `starter_${variant.id}_${slug(prompt)}`,
        question: prompt,
        note: `Starter prompt on the "${variant.id}" opening, read from identityConfig.`,
        expect: { policy: 'allow', evidenceEmpty: false, ...(extra[prompt] ?? {}) },
      });
    }
  }
  return cases;
}

const root = process.cwd();

async function main(): Promise<void> {
  const { repository, warnings } = await loadKnowledge({ contentRoot: root });
  if (warnings.length) {
    console.log(`Knowledge loaded with ${warnings.length} warning(s).\n`);
  }

  const agent = new Agent(agentConfig, repository);
  const raw = await readFile(join(root, 'evals', 'recruiter-eval-set.json'), 'utf8');
  const { cases: fileCases, starterExpectations = {} } = JSON.parse(raw) as {
    cases: EvalCase[];
    starterExpectations?: StarterExpectations;
  };

  const derived = starterCases(starterExpectations);

  // An expectation keyed to a prompt that no longer exists is silent rot: the
  // assertion simply stops running and the suite still reports all green. Edit
  // a starter prompt and this says so, loudly, instead.
  const prompts = new Set(derived.map((c) => c.question));
  const orphaned = Object.keys(starterExpectations).filter((p) => !prompts.has(p));
  if (orphaned.length) {
    console.error(
      'starterExpectations refers to prompts that are not in identityConfig any more:\n' +
        orphaned.map((p) => `  ${JSON.stringify(p)}`).join('\n') +
        '\nUpdate the keys in evals/recruiter-eval-set.json to match the current prompts.',
    );
    process.exit(1);
  }

  const cases = [...fileCases, ...derived];

  let passed = 0;
  const failures: string[] = [];

  for (const testCase of cases) {
    const session = createSession(`eval_${testCase.id}`, new Date(0).toISOString());
    const plan = await agent.prepareTurn({ message: testCase.question, session });
    const problems: string[] = [];

    const actualPolicy =
      plan.shortCircuit?.reason === 'injection'
        ? 'injection'
        : plan.shortCircuit?.reason === 'policy_refusal'
          ? 'refuse'
          : 'allow';

    if (actualPolicy !== testCase.expect.policy) {
      problems.push(`policy: expected ${testCase.expect.policy}, got ${actualPolicy}`);
    }

    const retrievedIds = plan.bundle.ranked.map((r) => r.id);

    if (testCase.expect.evidenceIncludesAny) {
      const hit = testCase.expect.evidenceIncludesAny.some((id) => retrievedIds.includes(id));
      if (!hit) {
        problems.push(
          `evidence: expected any of [${testCase.expect.evidenceIncludesAny.join(', ')}], ` +
            `got [${retrievedIds.slice(0, 5).join(', ') || 'nothing'}]`,
        );
      }
    }

    if (testCase.expect.evidenceExcludes) {
      const leaked = testCase.expect.evidenceExcludes.filter((id) => retrievedIds.includes(id));
      if (leaked.length) problems.push(`evidence: should not have retrieved [${leaked.join(', ')}]`);
    }

    if (testCase.expect.evidenceEmpty === true && !plan.bundle.empty) {
      problems.push(`evidence: expected nothing to clear the relevance floor, got [${retrievedIds.join(', ')}]`);
    }

    // The mirror case, and the reason it is spelled out rather than left to
    // `evidenceIncludesAny`: for a broad question there is no single id that
    // must appear, only the requirement that *something* did. Asserting ids
    // there would encode today's ranking and break on every knowledge edit.
    if (testCase.expect.evidenceEmpty === false && plan.bundle.empty) {
      problems.push('evidence: expected the question to retrieve something, got nothing');
    }

    if (problems.length === 0) {
      passed += 1;
      console.log(`  PASS  ${testCase.id}`);
    } else {
      console.log(`  FAIL  ${testCase.id}`);
      for (const problem of problems) console.log(`          ${problem}`);
      failures.push(testCase.id);
    }
  }

  console.log(`\n${passed}/${cases.length} passed.`);
  if (failures.length) {
    console.error(`Failed: ${failures.join(', ')}`);
    process.exit(1);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : error);
  process.exit(1);
});
