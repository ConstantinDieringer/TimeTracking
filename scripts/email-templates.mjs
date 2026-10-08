/**
 * Erzeugt die E-Mail-Vorlagen für Supabase Auth unter `supabase/templates/`.
 *
 * Supabase kennt keine gemeinsamen Bausteine für Vorlagen; jede Datei muss
 * vollständig sein. Damit Layout, Farben und Fußzeile trotzdem nur an einer
 * Stelle stehen, entstehen alle Dateien aus diesem Skript:
 *
 *   npm run emails
 *
 * Gestaltung nach `web/src/styles/tokens.css`. E-Mail-Programme verstehen nur
 * einen Bruchteil von CSS: daher Tabellen statt Flexbox, Stile direkt am
 * Element, Systemschriften und keine Bilder von fremden Servern — die blockieren
 * viele Programme, und sie verrieten das Öffnen der Mail.
 *
 * Platzhalter wie {{ .ConfirmationURL }} füllt Supabase beim Versand. In
 * Vorlagen stehen bewusst keine Felder, die Benutzer selbst setzen können
 * (etwa der Anzeigename aus user_metadata) — ausgenommen die Einladung, deren
 * Daten die Edge Function serverseitig mitgibt.
 */

import { mkdirSync, writeFileSync } from 'node:fs';

const BRAND = 'Zeiterfassung';
const DIR = 'supabase/templates';

const C = {
  bg: '#f6f7f9',
  surface: '#ffffff',
  muted: '#f1f3f6',
  ink: '#111827',
  inkMuted: '#5b6474',
  inkFaint: '#6b7280',
  hairline: '#e6e9ee',
  accent: '#047857',
  accentSoft: '#ecfdf5',
  warnSoft: '#fffbeb',
  warnLine: '#fcd34d',
  warn: '#92400e',
};

const FONT =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

// --- Bausteine ---------------------------------------------------------------

const p = (html, extra = '') =>
  `<p style="margin:0 0 16px;font-family:${FONT};font-size:15px;line-height:24px;color:${C.ink};${extra}">${html}</p>`;

const small = (html) =>
  `<p style="margin:0 0 8px;font-family:${FONT};font-size:13px;line-height:20px;color:${C.inkMuted};">${html}</p>`;

/** Schaltfläche, die auch in Outlook als Fläche erscheint. */
const button = (href, label) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px;">
  <tr>
    <td align="center" bgcolor="${C.accent}" style="border-radius:8px;">
      <a href="${href}" target="_blank" style="display:inline-block;padding:13px 26px;font-family:${FONT};font-size:15px;font-weight:600;line-height:20px;color:#ffffff;text-decoration:none;border-radius:8px;">${label}</a>
    </td>
  </tr>
</table>`;

/** Der Link noch einmal als Text, falls die Schaltfläche nicht funktioniert. */
const fallbackLink = (href) => `
${small("Button not working? Copy and paste this link into your browser:")}
<p style="margin:0 0 24px;font-family:${FONT};font-size:13px;line-height:20px;word-break:break-all;"><a href="${href}" target="_blank" style="color:${C.accent};text-decoration:underline;">${href}</a></p>`;

/** Einmalcode, groß und gut abzuschreiben. */
const code = (token) => `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 24px;">
  <tr>
    <td align="center" bgcolor="${C.accentSoft}" style="padding:20px;border-radius:10px;font-family:'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, monospace;font-size:30px;font-weight:600;letter-spacing:8px;color:${C.ink};">${token}</td>
  </tr>
</table>`;

/** Ruhiger Kasten für Sicherheitshinweise. */
const note = (html, tone = 'muted') => {
  const [bg, border, color] =
    tone === 'warn' ? [C.warnSoft, C.warnLine, C.warn] : [C.muted, C.hairline, C.inkMuted];
  return `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin:8px 0 0;">
  <tr>
    <td bgcolor="${bg}" style="padding:14px 16px;border:1px solid ${border};border-radius:8px;font-family:${FONT};font-size:13px;line-height:20px;color:${color};">${html}</td>
  </tr>
</table>`;
};

/** Gemeinsames Gerüst: Kopf mit Bildmarke, Karte, Fußzeile. */
function layout({ preheader, title, body }) {
  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="color-scheme" content="light">
  <meta name="supported-color-schemes" content="light">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background-color:${C.bg};-webkit-text-size-adjust:100%;">
  <!-- Vorschautext im Posteingang, im Inhalt unsichtbar -->
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${preheader}&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;&#8203;&nbsp;</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${C.bg}" style="background-color:${C.bg};">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="max-width:560px;">
          <!-- Kopf -->
          <tr>
            <td style="padding:0 0 20px;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td width="36" height="36" align="center" valign="middle" bgcolor="${C.accent}" style="width:36px;height:36px;border-radius:9px;">
                    <div style="width:16px;height:16px;border:2.5px solid #ffffff;border-radius:50%;line-height:0;font-size:0;">&nbsp;</div>
                  </td>
                  <td style="padding-left:12px;font-family:${FONT};font-size:18px;font-weight:600;color:${C.ink};">${BRAND}</td>
                </tr>
              </table>
            </td>
          </tr>
          <!-- Karte -->
          <tr>
            <td bgcolor="${C.surface}" style="padding:32px 28px 28px;border:1px solid ${C.hairline};border-radius:12px;">
              <h1 style="margin:0 0 16px;font-family:${FONT};font-size:22px;line-height:30px;font-weight:600;color:${C.ink};">${title}</h1>
${body}
            </td>
          </tr>
          <!-- Fußzeile -->
          <tr>
            <td style="padding:24px 8px 0;font-family:${FONT};font-size:12px;line-height:18px;color:${C.inkFaint};text-align:center;">
              ${BRAND} &middot; Working-time records under &sect;&nbsp;26 AZG &middot; Data stored in the EU<br>
              This is an automated message. Please do not reply to this email.<br>
              We will never ask for your password by email.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`;
}

const IGNORE =
  "Didn't request this? You can safely ignore this email &mdash; nothing will change on your account.";

// --- Vorlagen ----------------------------------------------------------------
//
// Die Gültigkeitsdauer der Links folgt `otp_expiry` in config.toml (3600 s).
// Wer den Wert ändert, passt die Texte hier an.

const templates = {
  // Ablauf-Mails ------------------------------------------------------------
  invite: {
    kind: 'template',
    subject: `You've been invited to ${BRAND}`,
    preheader: 'Set your password to start recording your working hours.',
    title: `You've been invited to ${BRAND}`,
    body: [
      p(
        `{{ if .Data.organization_name }}<strong>{{ .Data.organization_name }}</strong> has invited you{{ else }}You have been invited{{ end }} to record your working hours with ${BRAND}.`,
      ),
      p('To activate your account, choose your own password. Nobody else will know it &mdash; not even your administrator.'),
      button('{{ .ConfirmationURL }}', 'Accept invitation'),
      fallbackLink('{{ .ConfirmationURL }}'),
      note(
        `This invitation was sent to <strong>{{ .Email }}</strong> and can be used once within the next hour. If it has expired, ask your administrator to send a new one.<br><br>Not expecting this invitation? Ignore this email and no account will be activated.`,
      ),
    ],
  },

  confirmation: {
    kind: 'template',
    subject: 'Confirm your email address',
    preheader: `One click to finish setting up your ${BRAND} account.`,
    title: 'Confirm your email address',
    body: [
      p(`Thanks for signing up for ${BRAND}. Please confirm that <strong>{{ .Email }}</strong> belongs to you.`),
      button('{{ .ConfirmationURL }}', 'Confirm email address'),
      fallbackLink('{{ .ConfirmationURL }}'),
      note(`This link can be used once within the next hour.<br><br>${IGNORE}`),
    ],
  },

  recovery: {
    kind: 'template',
    subject: `Reset your ${BRAND} password`,
    preheader: 'Use this link to choose a new password.',
    title: 'Reset your password',
    body: [
      p(`We received a request to reset the password for <strong>{{ .Email }}</strong>.`),
      button('{{ .ConfirmationURL }}', 'Choose a new password'),
      fallbackLink('{{ .ConfirmationURL }}'),
      note(
        `This link can be used once within the next hour. After you set a new password, you will be signed out on all other devices.<br><br>Didn't request a reset? Ignore this email &mdash; your password stays the same. If you receive these emails repeatedly, let your administrator know.`,
      ),
    ],
  },

  email_change: {
    kind: 'template',
    subject: 'Confirm your new email address',
    preheader: 'Confirm the change of the email address on your account.',
    title: 'Confirm your new email address',
    body: [
      p(
        `A request was made to change the email address of your ${BRAND} account from <strong>{{ .Email }}</strong> to <strong>{{ .NewEmail }}</strong>.`,
      ),
      p('For your security, the change only takes effect once it has been confirmed from both addresses.'),
      button('{{ .ConfirmationURL }}', 'Confirm change'),
      fallbackLink('{{ .ConfirmationURL }}'),
      note(
        "Didn't request this change? Do not click the button. Change your password and inform your administrator right away &mdash; someone else may have access to your account.",
        'warn',
      ),
    ],
  },

  magic_link: {
    kind: 'template',
    subject: `Your ${BRAND} sign-in link`,
    preheader: 'Sign in with one click.',
    title: 'Sign in to your account',
    body: [
      p(`Use the button below to sign in as <strong>{{ .Email }}</strong>.`),
      button('{{ .ConfirmationURL }}', 'Sign in'),
      small('Or enter this code on the sign-in page:'),
      code('{{ .Token }}'),
      note(`The link and code can be used once within the next hour.<br><br>${IGNORE}`),
    ],
  },

  reauthentication: {
    kind: 'template',
    subject: `Your ${BRAND} verification code`,
    preheader: 'Confirm it is really you.',
    title: 'Confirm it’s you',
    body: [
      p('Enter this code to confirm a security-sensitive change to your account:'),
      code('{{ .Token }}'),
      note(
        "The code is valid for one hour. Didn't try to change anything? Someone may know your password &mdash; change it and inform your administrator.",
        'warn',
      ),
    ],
  },

  // Sicherheitsbenachrichtigungen --------------------------------------------
  // Gehen nach der Änderung hinaus, an die bisherige Adresse. Sie sind die
  // einzige Spur, wenn jemand anderes ein Konto übernommen hat.

  password_changed: {
    kind: 'notification',
    file: 'password_changed_notification',
    subject: `Your ${BRAND} password was changed`,
    preheader: 'The password for your account has just been changed.',
    title: 'Your password was changed',
    body: [
      p(`The password for <strong>{{ .Email }}</strong> has just been changed.`),
      p('If you made this change, no further action is needed.'),
      note(
        "Didn't change your password? Contact your administrator immediately so they can lock the account and reset the password.",
        'warn',
      ),
    ],
  },

  email_changed: {
    kind: 'notification',
    file: 'email_changed_notification',
    subject: `The email address of your ${BRAND} account was changed`,
    preheader: 'Your account now uses a different email address.',
    title: 'Your email address was changed',
    body: [
      p(
        `The email address of your account was changed from <strong>{{ .OldEmail }}</strong> to <strong>{{ .Email }}</strong>.`,
      ),
      p('Sign-in links and notifications will go to the new address from now on.'),
      note(
        "Didn't make this change? Contact your administrator immediately &mdash; someone else may have taken over your account.",
        'warn',
      ),
    ],
  },

  mfa_factor_enrolled: {
    kind: 'notification',
    file: 'mfa_factor_enrolled_notification',
    subject: 'Two-factor authentication was turned on',
    preheader: 'A new sign-in method was added to your account.',
    title: 'Two-factor authentication added',
    body: [
      p(
        `A new two-factor method (<strong>{{ .FactorType }}</strong>) was added to <strong>{{ .Email }}</strong>. From now on, signing in requires a code from that device.`,
      ),
      note(
        "Didn't set this up? Contact your administrator immediately &mdash; someone may be trying to lock you out of your account.",
        'warn',
      ),
    ],
  },

  mfa_factor_unenrolled: {
    kind: 'notification',
    file: 'mfa_factor_unenrolled_notification',
    subject: 'Two-factor authentication was removed',
    preheader: 'A sign-in method was removed from your account.',
    title: 'Two-factor authentication removed',
    body: [
      p(
        `A two-factor method (<strong>{{ .FactorType }}</strong>) was removed from <strong>{{ .Email }}</strong>. Your account is now less protected.`,
      ),
      note(
        "Didn't remove it? Change your password and contact your administrator immediately.",
        'warn',
      ),
    ],
  },

  identity_linked: {
    kind: 'notification',
    file: 'identity_linked_notification',
    subject: `A new sign-in method was linked to your ${BRAND} account`,
    preheader: 'Your account can now be accessed with an additional sign-in method.',
    title: 'New sign-in method linked',
    body: [
      p(`<strong>{{ .Provider }}</strong> was linked to <strong>{{ .Email }}</strong> and can now be used to sign in.`),
      note("Didn't do this? Contact your administrator immediately.", 'warn'),
    ],
  },

  identity_unlinked: {
    kind: 'notification',
    file: 'identity_unlinked_notification',
    subject: `A sign-in method was removed from your ${BRAND} account`,
    preheader: 'A sign-in method was removed from your account.',
    title: 'Sign-in method removed',
    body: [
      p(`<strong>{{ .Provider }}</strong> was removed from <strong>{{ .Email }}</strong> and can no longer be used to sign in.`),
      note("Didn't do this? Contact your administrator immediately.", 'warn'),
    ],
  },
};

mkdirSync(DIR, { recursive: true });

for (const [name, t] of Object.entries(templates)) {
  const file = `${DIR}/${t.file ?? name}.html`;
  writeFileSync(
    file,
    layout({ preheader: t.preheader, title: t.title, body: t.body.join('\n') }).replace(/\r?\n/g, '\n'),
  );
}

// Für config.toml: Betreff und Pfad je Vorlage.
if (process.argv.includes('--toml')) {
  for (const [name, t] of Object.entries(templates)) {
    const section =
      t.kind === 'template' ? `auth.email.template.${name}` : `auth.email.notification.${name}`;
    console.log(`[${section}]`);
    if (t.kind === 'notification') console.log('enabled = true');
    console.log(`subject = ${JSON.stringify(t.subject)}`);
    console.log(`content_path = "./${DIR}/${t.file ?? name}.html"\n`);
  }
} else {
  console.log(`${Object.keys(templates).length} Vorlagen nach ${DIR}/ geschrieben.`);
}
