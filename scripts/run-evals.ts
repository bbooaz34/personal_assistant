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
import { agentConfig } from '@par/config';

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

const root = process.cwd();

async function main(): Promise<void> {
  const { repository, warnings } = await loadKnowledge({ contentRoot: root });
  if (warnings.length) {
    console.log(`Knowledge loaded with ${warnings.length} warning(s).\n`);
  }

  const agent = new Agent(agentConfig, repository);
  const raw = await readFile(join(root, 'evals', 'recruiter-eval-set.json'), 'utf8');
  const { cases } = JSON.parse(raw) as { cases: EvalCase[] };

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
