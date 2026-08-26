/**
 * Privacy policy as data (design doc §25, §27).
 *
 * These rules are enforced by the retrieval layer before the model runs. They
 * are not instructions the model is asked to follow, which is the difference
 * between a boundary and a suggestion.
 *
 * `matches` are intentionally broad. Over-refusing a compensation question
 * costs one awkward sentence; under-refusing one cannot be undone.
 */

import type { PolicyConfig } from '@par/policy';

const CONTACT_REFUSAL =
  "I don't hand out personal contact details. If you'd like to reach Boaz directly, the best route " +
  'is LinkedIn — or tell me about the role and I can make sure the right context reaches him.';

const COMPENSATION_REFUSAL =
  "I don't discuss compensation — that's a conversation for Boaz directly. I can tell you about " +
  'scope, seniority, and the kind of work he takes on, if that helps you calibrate.';

const PERSONAL_REFUSAL =
  "That's personal rather than professional, so it's not something I cover. Happy to keep going on " +
  'the work itself.';

export const privacyConfig: PolicyConfig = {
  /**
   * A public visitor can never reach beyond `public`, regardless of what they
   * claim about themselves. `verified_recruiter` exists for a future flow where
   * the owner grants access out-of-band — it is not something a visitor can
   * assert their way into.
   */
  maxVisibility: {
    public_visitor: 'public',
    verified_recruiter: 'restricted',
    owner: 'system',
  },

  topics: [
    {
      topic: 'professional_experience',
      access: 'public',
      matches: ['experience', 'worked at', 'role', 'career', 'background', 'ניסיון', 'תפקיד'],
    },
    {
      topic: 'projects_public',
      access: 'public',
      matches: ['project', 'case study', 'portfolio', 'work sample', 'פרויקט'],
    },
    {
      topic: 'compensation',
      access: 'never',
      matches: [
        'salary', 'compensation', 'earn', 'earns', 'earning', 'how much does he make',
        'how much would he cost', 'pay', 'paid', 'rate', 'day rate', 'equity',
        'stock options', 'bonus', 'expected salary', 'price', 'budget for him',
        'שכר', 'משכורת', 'מרוויח', 'עלות',
      ],
      refusal: COMPENSATION_REFUSAL,
    },
    {
      topic: 'home_address',
      access: 'never',
      matches: ['home address', 'where does he live', 'his address', 'neighborhood', 'כתובת', 'איפה הוא גר'],
      refusal: PERSONAL_REFUSAL,
    },
    {
      topic: 'family_information',
      access: 'never',
      matches: [
        'married', 'wife', 'husband', 'partner', 'kids', 'children', 'family',
        'girlfriend', 'boyfriend', 'divorce', 'נשוי', 'ילדים', 'משפחה',
      ],
      refusal: PERSONAL_REFUSAL,
    },
    {
      topic: 'health_information',
      access: 'never',
      matches: ['health', 'illness', 'medical', 'disability', 'diagnosis', 'therapy', 'בריאות'],
      refusal: PERSONAL_REFUSAL,
    },
    {
      topic: 'age_and_protected_attributes',
      access: 'never',
      matches: [
        'how old is he', 'his age', 'date of birth', 'birthday', 'religion', 'ethnicity',
        'nationality', 'military service', 'political', 'בן כמה', 'גיל',
      ],
      // These are also questions a recruiter should not be asking. Declining is
      // the right answer regardless of what the knowledge base contains.
      refusal:
        "I don't cover personal attributes — and for hiring purposes they shouldn't factor in anyway. " +
        'I can tell you anything you need about the professional track record.',
    },
    {
      topic: 'private_contact_information',
      access: 'explicit_permission',
      matches: [
        'phone number', 'his email', 'email address', 'whatsapp', 'call him',
        'personal email', 'טלפון', 'מייל',
      ],
      refusal: CONTACT_REFUSAL,
    },
    {
      topic: 'confidential_projects',
      access: 'restricted',
      matches: ['nda', 'confidential', 'unreleased', 'under wraps', 'not public'],
      refusal:
        'Some of the work is under NDA and I keep that out of these conversations. There is plenty ' +
        'I can show you that is cleared for sharing.',
    },
    {
      topic: 'other_candidates_or_employers',
      access: 'never',
      matches: ['other offers', 'interviewing elsewhere', 'other companies he', 'why did he leave'],
      refusal:
        "I don't speculate about his job search or his reasons for moving between roles — that's his " +
        'to tell. I can walk you through what he did at each company.',
    },
    {
      topic: 'system_internals',
      access: 'never',
      matches: [
        'system prompt', 'your instructions', 'your configuration', 'your rules',
        'what model are you', 'your source code', 'your knowledge base file',
      ],
      refusal:
        "I won't get into how I'm built — I'd rather spend the time on the work. What would you like " +
        'to know about Boaz?',
    },
  ],

  presentableVerificationStatuses: ['verified', 'needs_verification'],

  /**
   * `label` rather than `hide`: several genuinely useful project claims are
   * still awaiting case-study evidence, and the honest move is to show them
   * marked as unverified rather than to pretend the work does not exist.
   * The prompt requires the agent to frame them accordingly.
   */
  unverifiedClaimHandling: 'label',
};
