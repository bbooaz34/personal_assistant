'use client';

/**
 * Direct contact methods on the main screen.
 *
 * The agent answers questions about the work; these are the exits for the
 * visitor who is done asking and wants the person. A row of round Liquid Glass
 * buttons under the wordmark — the same glass as the chat capsule's mic and
 * send buttons, so they read as part of one system rather than a footer bolted
 * on. Only configured methods render: the config is the single switch.
 *
 * Email and phone also copy their value on click, with a visible confirmation.
 * A mailto:/tel: link is a silent no-op on any machine without a registered
 * handler — most desktops — and a contact button that does nothing is worse
 * than none. The navigation still fires, so a configured mail app opens too.
 */

import { useEffect, useRef, useState } from 'react';

interface OwnerContact {
  linkedin?: string;
  email?: string;
  phone?: string;
}

const ICONS = {
  linkedin: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16 8a6 6 0 0 1 6 6v7h-4v-7a2 2 0 0 0-2-2 2 2 0 0 0-2 2v7h-4V8h4v2a6 6 0 0 1 2-2z" />
      <rect x="2" y="9" width="4" height="12" />
      <circle cx="4" cy="4" r="2" />
    </svg>
  ),
  phone: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
    </svg>
  ),
  email: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" />
      <path d="m22 7-10 6L2 7" />
    </svg>
  ),
  check: (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M20 6 9 17l-5-5" />
    </svg>
  ),
};

export function ContactMethods({ owner, contact }: { owner: string; contact?: OwnerContact }) {
  const [copied, setCopied] = useState<{ key: string; text: string } | null>(null);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(copiedTimer.current), []);

  if (!contact) return null;

  const copy = (key: string, value: string, noun: string) => {
    // The mailto:/tel: navigation proceeds untouched; the copy is the part
    // that works everywhere. Clipboard access can be denied — then the value
    // itself is shown, which the visitor can at least read and retype.
    navigator.clipboard
      ?.writeText(value)
      .then(() => showCopied(key, `${noun} copied`))
      .catch(() => showCopied(key, value));
  };
  const showCopied = (key: string, text: string) => {
    clearTimeout(copiedTimer.current);
    setCopied({ key, text });
    copiedTimer.current = setTimeout(() => setCopied(null), 2600);
  };

  const methods = [
    contact.linkedin
      ? {
          key: 'linkedin',
          href: contact.linkedin,
          label: `${owner} on LinkedIn`,
          external: true,
          icon: ICONS.linkedin,
          onClick: undefined,
        }
      : null,
    contact.phone
      ? {
          key: 'phone',
          href: `tel:${contact.phone}`,
          label: `Call ${owner}`,
          external: false,
          icon: ICONS.phone,
          onClick: () => copy('phone', contact.phone!, 'number'),
        }
      : null,
    contact.email
      ? {
          key: 'email',
          href: `mailto:${contact.email}`,
          label: `Email ${owner}`,
          external: false,
          icon: ICONS.email,
          onClick: () => copy('email', contact.email!, 'address'),
        }
      : null,
  ].filter((m): m is NonNullable<typeof m> => m !== null);

  if (methods.length === 0) return null;

  return (
    <nav id="contact" aria-label={`Contact ${owner}`}>
      {methods.map((method) => (
        <a
          key={method.key}
          href={method.href}
          aria-label={method.label}
          title={method.label}
          onClick={method.onClick}
          {...(method.external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          {copied?.key === method.key ? ICONS.check : method.icon}
        </a>
      ))}
      <span id="contactCopied" role="status" className={copied ? 'shown' : undefined}>
        {copied?.text}
      </span>
    </nav>
  );
}
