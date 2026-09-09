/**
 * Contact-detail redaction for stored conversation text (docs/DATA-COLLECTION.md).
 *
 * Applied inside the store rather than by its callers. A rule that every write
 * site has to remember is a rule that eventually gets forgotten at one of them;
 * this way there is no way to persist a turn without it having run.
 *
 * The bias matches `privacy.config.ts`: over-redacting costs a slightly odd
 * transcript, under-redacting cannot be undone. A visitor who types their own
 * phone number is the case this exists for, and the agent already refuses to
 * discuss contact details, so nothing of value is lost by scrubbing them.
 */

const EMAIL = /\b[\w.+-]+@[\w-]+(?:\.[\w-]+)+\b/g;

/**
 * Deliberately loose: any run of digits with common separators. The digit count
 * is checked in the callback, because a regex tight enough to match every real
 * phone format is also tight enough to miss several of them.
 */
const PHONE_CANDIDATE = /\+?\(?\d[\d\s()./-]{5,}\d/g;

export const EMAIL_PLACEHOLDER = '[email redacted]';
export const PHONE_PLACEHOLDER = '[phone redacted]';

/**
 * Removes emails and phone numbers from visitor-supplied text.
 *
 * Emails go first: an address containing digits would otherwise leave a
 * fragment behind that the phone pass could match.
 */
export function redactContactDetails(text: string): string {
  return text.replace(EMAIL, EMAIL_PLACEHOLDER).replace(PHONE_CANDIDATE, (match) => {
    const digits = match.replace(/\D/g, '');

    // A leading '+' is unambiguous; without one, require enough digits to rule
    // out the things a conversation about someone's career is full of. At a
    // seven-digit floor, "2020-2024" and "10.2.2024" both read as phone
    // numbers — and silently redacting every date range would cost more than
    // the rare local number missed by this threshold. Every real mobile format
    // carries at least nine.
    const floor = match.trimStart().startsWith('+') ? 7 : 9;

    // Above 15 exceeds what E.164 permits: more likely an id or a hash.
    return digits.length >= floor && digits.length <= 15 ? PHONE_PLACEHOLDER : match;
  });
}
