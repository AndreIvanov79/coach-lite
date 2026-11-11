// `profile` key in CloudStorage (SPEC 8.5): language, mode, acceptance of the terms.
import type { Language } from "../i18n/strings.ts";
import { LANGUAGES } from "../i18n/strings.ts";

/**
 * Version of the terms the "Accept" screen refers to. 0 = the short drafts published with the skeleton;
 * step 7 publishes the full documents as 1 and everyone who accepted 0 sees the screen again (SPEC 10.4).
 */
export const CONSENT_VERSION = 0;
export const PROFILE_KEY = "profile";

export type Mode = "self" | "coach";
export type Profile = { v: 1; lang?: Language; mode?: Mode; accepted?: { version: number; at: string } };

/** Tolerant: anything broken or unknown becomes "not set" rather than an error. */
export function parseProfile(value: unknown): Profile {
  const p: Profile = { v: 1 };
  if (!value || typeof value !== "object") return p;
  const o = value as Record<string, unknown>;
  if (typeof o.lang === "string" && (LANGUAGES as readonly string[]).includes(o.lang)) p.lang = o.lang as Language;
  if (o.mode === "self" || o.mode === "coach") p.mode = o.mode;
  const a = o.accepted as Record<string, unknown> | undefined;
  if (a && Number.isInteger(a.version) && typeof a.at === "string" && !Number.isNaN(Date.parse(a.at))) p.accepted = { version: a.version as number, at: a.at };
  return p;
}

export const needsConsent = (p: Profile) => !p.accepted || p.accepted.version < CONSENT_VERSION;
export const accept = (p: Profile, now = new Date()): Profile => ({ ...p, accepted: { version: CONSENT_VERSION, at: now.toISOString() } });
