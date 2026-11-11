import { test } from "node:test";
import assert from "node:assert/strict";
import { CONSENT_VERSION, accept, needsConsent, parseProfile } from "./profile.ts";
import { BUNDLES, LANGUAGES, resolveLanguage, translate } from "../i18n/strings.ts";

test("profile: broken or foreign values are ignored", () => {
  assert.deepEqual(parseProfile(null), { v: 1 });
  assert.deepEqual(parseProfile({ lang: "de", mode: "boss", accepted: { version: "1", at: "x" } }), { v: 1 });
  assert.deepEqual(parseProfile({ lang: "ro", mode: "coach", accepted: { version: 0, at: "2026-11-11T10:00:00.000Z" }, extra: 1 }),
    { v: 1, lang: "ro", mode: "coach", accepted: { version: 0, at: "2026-11-11T10:00:00.000Z" } });
});

test("consent: asked once, asked again when the terms version goes up", () => {
  const fresh = parseProfile(null);
  assert.ok(needsConsent(fresh));
  const ok = accept(fresh, new Date("2026-11-11T10:00:00Z"));
  assert.deepEqual(ok.accepted, { version: CONSENT_VERSION, at: "2026-11-11T10:00:00.000Z" });
  assert.ok(!needsConsent(ok));
  assert.ok(needsConsent({ ...ok, accepted: { version: CONSENT_VERSION - 1, at: ok.accepted!.at } }));
});

test("languages: Telegram codes map to ru/en/ro, everything else to English", () => {
  assert.equal(resolveLanguage("ru-RU"), "ru");
  assert.equal(resolveLanguage("mo"), "ro");
  assert.equal(resolveLanguage("ro_MD"), "ro");
  assert.equal(resolveLanguage(undefined, "de-DE"), "en");
  assert.equal(resolveLanguage(null, "ro"), "ro");
});

test("every language has every string with the same placeholders", () => {
  const keys = Object.keys(BUNDLES.ru).sort();
  for (const lang of LANGUAGES) {
    assert.deepEqual(Object.keys(BUNDLES[lang]).sort(), keys, lang);
    for (const k of keys) {
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      assert.equal(ph(BUNDLES[lang][k as keyof typeof BUNDLES.ru]), ph(BUNDLES.ru[k as keyof typeof BUNDLES.ru]), lang + " " + k);
      assert.ok(BUNDLES[lang][k as keyof typeof BUNDLES.ru].trim(), lang + " " + k + " is empty");
    }
  }
  assert.equal(translate("en", "received.count.b", { n: 24 }), "Strikes: 24");
});
