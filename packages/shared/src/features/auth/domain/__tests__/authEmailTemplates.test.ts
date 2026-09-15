import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import type { EmailOtpType } from "@supabase/supabase-js";
import { SUPPORTED_EMAIL_OTP_TYPES } from "@shared/features/auth/domain";

/**
 * The auth emails live in Supabase's dashboard; `supabase/templates/*.html` is
 * the version-controlled original they're pasted from. These tests can't reach
 * the live copy — they hold the source files to the contract the app relies on:
 * a `token_hash` link, on our own landing page, with a type the client can
 * actually verify.
 */
const TEMPLATE_DIR = path.join(process.cwd(), "supabase", "templates");

const TEMPLATES: ReadonlyArray<[string, EmailOtpType]> = [
  ["confirmation.html", "signup"],
  ["recovery.html", "recovery"],
  ["invite.html", "invite"],
  ["magic_link.html", "magiclink"],
  ["email_change.html", "email_change"],
];

const read = (file: string) =>
  readFileSync(path.join(TEMPLATE_DIR, file), "utf8");

describe("auth email templates", () => {
  it.each(TEMPLATES)(
    "%s links to the landing page with a token_hash",
    (file, type) => {
      const html = read(file);
      expect(html).toContain(
        `{{ if .RedirectTo }}{{ .RedirectTo }}{{ else }}{{ .SiteURL }}/auth/confirm/web{{ end }}?token_hash={{ .TokenHash }}&type=${type}`,
      );
    },
  );

  it.each(TEMPLATES)(
    "%s asks for a type the client can verify",
    (_file, type) => {
      expect(SUPPORTED_EMAIL_OTP_TYPES.has(type)).toBe(true);
    },
  );

  it.each(TEMPLATES)(
    "%s never uses ConfirmationURL — it verifies on the first GET, so a scanner spends it",
    (file) => {
      expect(read(file)).not.toContain(".ConfirmationURL");
    },
  );

  it.each(TEMPLATES)(
    "%s never puts a haven:// link in a template variable (renders as #ZgotmplZ)",
    (file) => {
      expect(read(file)).not.toContain("haven://");
    },
  );

  it.each(TEMPLATES)(
    "%s keeps the copyable address on one line — wrapped, it renders with spaces in it",
    (file, type) => {
      const link = `{{ if .RedirectTo }}{{ .RedirectTo }}{{ else }}{{ .SiteURL }}/auth/confirm/web{{ end }}?token_hash={{ .TokenHash }}&type=${type}`;
      // The text of the fallback link, not just its href: a formatter that
      // rewraps the element breaks the address people paste.
      expect(read(file)).toContain(`>${link}</a>`);
    },
  );

  it.each(TEMPLATES)("%s declares both colour-scheme metas", (file) => {
    const html = read(file);
    // Without these, iOS Mail inverts the light palette itself and can leave
    // text unreadable — the bug these templates replace.
    expect(html).toContain('name="color-scheme" content="light dark"');
    expect(html).toContain(
      'name="supported-color-schemes" content="light dark"',
    );
    expect(html).toContain("prefers-color-scheme: dark");
  });
});
