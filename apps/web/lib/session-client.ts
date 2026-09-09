/**
 * The browser half of session identity (docs/DATA-COLLECTION.md).
 *
 * `sessionStorage`, deliberately, and not a cookie: the id dies with the tab,
 * so two visits by the same person are two unrelated rows. That is what makes
 * "anonymous session" true rather than aspirational, and it is the reason this
 * needs no consent banner beyond the recording notice.
 */

export interface ClientSession {
  id: string;
  startedAt: string;
}

const STORAGE_KEY = 'par.session';

/**
 * Used when storage is unavailable — Safari private mode and browsers set to
 * block site data both throw on access. The session then lives for as long as
 * the page does, which is still enough to keep one conversation's turns
 * together.
 */
let fallback: ClientSession | null = null;

function randomId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();

  // `crypto.randomUUID` is unavailable outside a secure context, which a LAN
  // preview over plain http is not. Generate a v4 by hand rather than lose the
  // session id in exactly the setup used for testing on a phone.
  const bytes = new Uint8Array(16);
  if (typeof c?.getRandomValues === 'function') c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function mint(): ClientSession {
  return { id: randomId(), startedAt: new Date().toISOString() };
}

function isSession(value: unknown): value is ClientSession {
  const v = value as ClientSession | null;
  return !!v && typeof v.id === 'string' && typeof v.startedAt === 'string';
}

/**
 * The session for this tab, minted on first call. Safe to call during render
 * or from an event handler; on the server it returns a throwaway that is never
 * sent anywhere, because every caller runs after hydration.
 */
export function getClientSession(): ClientSession {
  if (typeof window === 'undefined') return fallback ?? (fallback = mint());

  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: unknown = JSON.parse(stored);
      if (isSession(parsed)) return parsed;
    }
    const created = mint();
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(created));
    return created;
  } catch {
    // Storage blocked, or a corrupt value. Neither is worth failing a turn for.
    return fallback ?? (fallback = mint());
  }
}
