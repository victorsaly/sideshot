// What SideShot hides on every picture before it is kept: what it can tell is private from the words alone (an
// email address, a card number, a key), a filled form field whose autocomplete says it holds something private,
// and what the project marks to hide. Worked out here, without a browser; the command finds where each sits on the
// page and covers it there, so it never reaches a picture on disk, a table, or a pull request.
import { UsageError } from './lib.mjs';

/** A card number passes the Luhn check: a run of digits that fails it is an order number, not a card. */
const isCard = (digits) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) d = d * 2 > 9 ? d * 2 - 9 : d * 2;
    sum += d;
  }
  return sum % 10 === 0;
};

/** An IBAN passes its own check (ISO 13616, mod 97): its first four moved to the end, letters as numbers. */
const isIban = (text) => {
  const s = text.slice(4) + text.slice(0, 4);
  let rest = 0;
  for (const c of s) rest = Number(`${String(rest)}${String(parseInt(c, 36))}`) % 97;
  return rest === 1;
};

// What is found in words, each by its shape. Names, street addresses and free text have none, and are left to the
// project to mark (data-sideshot-mask, --mask) or to stand in for (--setup).
// Between a number's groups, a space, a dash, or what a page's source puts between the elements of each group: a
// line break and its indent, which the page shows as one space.
const gap = String.raw`(?:\s{1,12}|-)?`;

/** The groups of m (its runs of letters and digits, between the gaps) as [start, end, text]. */
const groupsOf = (m) => [...m.matchAll(/[A-Z0-9]+/g)].map((g) => [g.index, g.index + g[0].length, g[0]]);

/** Where in a run of digits (m) a card number is, as [start, end] in m: the most groups that pass the check, so a
 * card with a code or a reference beside it is still found. A group is never cut, or a card could be found by chance
 * inside any long number. Null when none does. */
const cardIn = (m) => {
  const groups = groupsOf(m);
  for (let n = groups.length; n >= 1; n--)
    for (let s = 0; s + n <= groups.length; s++) {
      const digits = groups.slice(s, s + n).map((g) => g[2]).join('');
      if (digits.length >= 13 && digits.length <= 19 && isCard(digits)) return [groups[s][0], groups[s + n - 1][1]];
    }
  return null;
};

/** Where in m an IBAN is, from its start: the most groups that pass the check, so a currency or a word after it is
 * not taken for part of it. Null when none does. */
const ibanIn = (m) => {
  const groups = groupsOf(m);
  for (let n = groups.length; n >= 1; n--)
    if (groups.slice(0, n).map((g) => g[2]).join('').length >= 15 && isIban(groups.slice(0, n).map((g) => g[2]).join(''))) return [0, groups[n - 1][1]];
  return null;
};

const shapes = [
  { kind: 'email', pattern: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g },
  { kind: 'card', pattern: new RegExp(String.raw`\b\d(?:${gap}\d){12,22}\b`, 'g'), within: cardIn },
  { kind: 'iban', pattern: new RegExp(String.raw`\b[A-Z]{2}\d{2}(?:${gap}[A-Z0-9]{4}){2,7}(?:${gap}[A-Z0-9]{1,3})?\b`, 'g'), within: ibanIn },
  // Keys and tokens as their makers shape them: Stripe, GitHub, AWS, Slack, Google, OpenAI and Anthropic, a JWT,
  // and a private key, whole.
  {
    kind: 'key',
    pattern: new RegExp(
      [
        String.raw`\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{16,}`,
        String.raw`\bgh[pousr]_[A-Za-z0-9]{30,}`,
        String.raw`\bgithub_pat_\w{30,}`,
        String.raw`\b(?:AKIA|ASIA)[0-9A-Z]{16}\b`,
        String.raw`\bxox[abprs]-[A-Za-z0-9-]{10,}`,
        String.raw`\bAIza[\w-]{35}`,
        String.raw`\bsk-[A-Za-z0-9_-]{20,}`,
        String.raw`\beyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{8,}`,
        String.raw`-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)`,
      ].join('|'),
      'g',
    ),
  },
];

/** Where in these words something private is, and what: [{ start, end, kind }], in order, none overlapping. */
export function sensitiveIn(text) {
  const found = shapes.flatMap(({ kind, pattern, within }) =>
    [...text.matchAll(pattern)].flatMap((m) => {
      const [start, end] = within ? (within(m[0]) ?? [-1, -1]) : [0, m[0].length];
      return start === -1 ? [] : [{ start: m.index + start, end: m.index + end, kind }];
    }),
  );
  found.sort((a, b) => a.start - b.start || b.end - a.end);
  return found.filter((m, i) => i === 0 || found.slice(0, i).every((o) => o.end <= m.start));
}

// What a form field holds, by its autocomplete token (the HTML standard's names), when it says.
/** @type {[RegExp, string][]} */
const fieldKinds = [
  [/^email$/, 'email'],
  [/^tel/, 'phone'],
  [/^cc-(?!type$)/, 'card'],
  [/^(?:street-address|address-line\d|address-level\d|postal-code)$/, 'address'],
  [/^(?:name|given-name|additional-name|family-name|nickname|honorific-prefix|honorific-suffix)$/, 'name'],
  [/^one-time-code$/, 'code'],
  [/^bday/, 'birthday'],
  [/^(?:current|new)-password$/, 'password'],
];

/** What a form field shows that is private, or null: by its autocomplete, else by its value as words. An empty
 * field shows only its placeholder, and is left as it is. */
export function fieldKindOf({ value, autocomplete }) {
  if (value === '') return null;
  for (const token of autocomplete.toLowerCase().split(/\s+/).reverse())
    for (const [pattern, kind] of fieldKinds) if (pattern.test(token)) return kind;
  return sensitiveIn(value)[0]?.kind ?? null;
}

/** The words with each private thing in them put as [hidden], for the table, which says what the words now say. */
export const hiddenIn = (text) => {
  let shown = '';
  let from = 0;
  for (const { start, end } of sensitiveIn(text)) {
    shown += `${text.slice(from, start)}[hidden]`;
    from = end;
  }
  return shown + text.slice(from);
};

const said = {
  email: ['email address', 'email addresses'],
  card: ['card number', 'card numbers'],
  iban: ['bank account number', 'bank account numbers'],
  key: ['key or token', 'keys or tokens'],
  phone: ['phone number', 'phone numbers'],
  address: ['address', 'addresses'],
  name: ['name', 'names'],
  code: ['one-time code', 'one-time codes'],
  birthday: ['date of birth', 'dates of birth'],
  password: ['password', 'passwords'],
  marked: ['part marked to hide', 'parts marked to hide'],
};

/** What was hidden, in a line, by kind, most first: { email: 2 } is "2 email addresses". Null when nothing was. */
export function hiddenSaidOf(counts) {
  const shown = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .map(([kind, n]) => [n, said[kind][n === 1 ? 0 : 1]])
    .sort(([a, x], [b, y]) => b - a || x.localeCompare(y));
  if (shown.length === 0) return null;
  return `Hid on the pictures: ${shown.map(([n, words]) => `${String(n)} ${words}`).join(', ')}.`;
}

/** The selectors whose elements are hidden whole: what the page marks with data-sideshot-mask, always, then those
 * in .sideshot.json, then every --mask. Each is one selector, commas and all, so none is split. */
export function masksOf(args, config = {}) {
  const i = args.findIndex((a, k) => a === '--mask' && args[k + 1] === undefined);
  if (i !== -1) throw new UsageError('--mask needs a selector, like --mask .customer-name.');
  const configured = config.mask === undefined ? [] : Array.isArray(config.mask) ? config.mask : [config.mask];
  if (configured.some((s) => typeof s !== 'string'))
    throw new UsageError('"mask" in .sideshot.json is a selector, or a list of them, like [".customer-name"].');
  const given = args.flatMap((a, k) => (a === '--mask' ? [args[k + 1]] : []));
  return ['[data-sideshot-mask]', ...configured, ...given];
}
