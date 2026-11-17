import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { fieldKindOf, hiddenIn, hiddenSaidOf, masksOf, sensitiveIn } from '../skills/sideshot/scripts/hide.mjs';
import { UsageError } from '../skills/sideshot/scripts/lib.mjs';

// Card numbers, keys and tokens put together here rather than written out, so a secret scanner reading this file
// does not take them for real ones.
const card = Array(4).fill('4242').join(' ');
const stripeKey = ['sk', 'live', 'a1B2c3D4e5F6g7H8i9J0k1L2'].join('_');
const githubToken = `gh${'p_'}${'A1b2C3d4E5'.repeat(4)}`;
const awsKey = `AK${'IA'}${'Q'.repeat(16)}`;
const jwt = ['ey' + 'JhbGciOiJIUzI1NiJ9', 'eyJzdWIiOiIxMjM0In0', 'c2lnbmF0dXJlLXBhcnQ'].join('.');

const kindsIn = (text) => sensitiveIn(text).map((m) => [text.slice(m.start, m.end), m.kind]);

describe('sensitiveIn', () => {
  it('finds email addresses', () => {
    assert.deepEqual(kindsIn('Write to jane.doe+news@mail.example.co.uk today.'), [['jane.doe+news@mail.example.co.uk', 'email']]);
  });
  it('leaves a handle, or a word with @ in it, alone', () => {
    assert.deepEqual(kindsIn('Follow @sideshot, or meet us @ 5pm.'), []);
  });
  it('finds a card number only when its check digit says it is one', () => {
    assert.deepEqual(kindsIn(`Paid with ${card}.`), [[card, 'card']]);
    assert.deepEqual(kindsIn(`Paid with ${card.replace(/2$/, '1')}.`), []);
    assert.deepEqual(kindsIn(`Card ${card.replaceAll(' ', '-')}`), [[card.replaceAll(' ', '-'), 'card']]);
    assert.deepEqual(kindsIn(`Card ${card.replaceAll(' ', '')}`), [[card.replaceAll(' ', ''), 'card']]);
  });
  it('leaves prices, dates and short numbers alone', () => {
    assert.deepEqual(kindsIn('£1,299.00 on 2026-11-17, order 48213, phone ext 4242'), []);
  });
  it('finds an IBAN only when its check digits say it is one', () => {
    assert.deepEqual(kindsIn('To GB82 WEST 1234 5698 7654 32, thanks'), [['GB82 WEST 1234 5698 7654 32', 'iban']]);
    assert.deepEqual(kindsIn('To GB82WEST12345698765432'), [['GB82WEST12345698765432', 'iban']]);
    assert.deepEqual(kindsIn('To GB83 WEST 1234 5698 7654 32'), []);
  });
  it('finds keys and tokens by the shape their makers give them', () => {
    for (const key of [stripeKey, githubToken, awsKey, jwt])
      assert.deepEqual(kindsIn(`key: ${key} end`), [[key, 'key']], key.slice(0, 6));
  });
  it('finds a private key block whole', () => {
    const block = ['-----BEGIN RSA PRIVATE KEY-----', 'MIIEowIBAAKCAQEA', '-----END RSA PRIVATE KEY-----'].join('\n');
    assert.deepEqual(kindsIn(`x\n${block}\ny`), [[block, 'key']]);
  });
  it('finds each of several, in order, and none twice', () => {
    const text = `a@example.com then ${card} then b@example.org`;
    assert.deepEqual(kindsIn(text).map(([, kind]) => kind), ['email', 'card', 'email']);
  });
});

describe('fieldKindOf', () => {
  it('hides a filled field whose autocomplete says what it holds', () => {
    assert.equal(fieldKindOf({ value: '+44 20 7946 0000', autocomplete: 'tel' }), 'phone');
    assert.equal(fieldKindOf({ value: '+44 20 7946 0000', autocomplete: 'shipping tel-national' }), 'phone');
    assert.equal(fieldKindOf({ value: 'x', autocomplete: 'cc-number' }), 'card');
    assert.equal(fieldKindOf({ value: '123', autocomplete: 'section-a billing cc-csc' }), 'card');
    assert.equal(fieldKindOf({ value: '1 Main St', autocomplete: 'street-address' }), 'address');
    assert.equal(fieldKindOf({ value: 'SW1A 1AA', autocomplete: 'postal-code' }), 'address');
    assert.equal(fieldKindOf({ value: 'Jane', autocomplete: 'given-name' }), 'name');
    assert.equal(fieldKindOf({ value: '123456', autocomplete: 'one-time-code' }), 'code');
    assert.equal(fieldKindOf({ value: '1990-01-01', autocomplete: 'bday' }), 'birthday');
    assert.equal(fieldKindOf({ value: 'hunter2', autocomplete: 'current-password' }), 'password');
    assert.equal(fieldKindOf({ value: 'jane@example.com', autocomplete: 'email' }), 'email');
  });
  it('hides a filled field whose value is something it finds in text', () => {
    assert.equal(fieldKindOf({ value: 'jane@example.com', autocomplete: '' }), 'email');
    assert.equal(fieldKindOf({ value: stripeKey, autocomplete: 'off' }), 'key');
  });
  it('leaves an empty field, or one that says nothing of what it holds, as it is', () => {
    assert.equal(fieldKindOf({ value: '', autocomplete: 'cc-number' }), null);
    assert.equal(fieldKindOf({ value: 'Blue', autocomplete: 'off' }), null);
    assert.equal(fieldKindOf({ value: 'Visa', autocomplete: 'cc-type' }), null);
    assert.equal(fieldKindOf({ value: 'UK', autocomplete: 'country-name' }), null);
  });
});

describe('hiddenIn', () => {
  it('puts [hidden] where each was, and leaves the rest of the words as they are', () => {
    assert.equal(hiddenIn(`Jane (jane@example.com) paid with ${card}.`), 'Jane ([hidden]) paid with [hidden].');
    assert.equal(hiddenIn('Nothing here'), 'Nothing here');
  });
});

describe('hiddenSaidOf', () => {
  it('says what was hidden, most first', () => {
    assert.equal(
      hiddenSaidOf({ email: 1, card: 2, marked: 1 }),
      'Hid on the pictures: 2 card numbers, 1 email address, 1 part marked to hide.',
    );
    assert.equal(
      hiddenSaidOf({ phone: 1, address: 2, name: 1, code: 1, birthday: 1, password: 1, iban: 1, key: 2 }),
      'Hid on the pictures: 2 addresses, 2 keys or tokens, 1 bank account number, 1 date of birth, 1 name, ' +
        '1 one-time code, 1 password, 1 phone number.',
    );
  });
  it('says nothing when nothing was hidden', () => {
    assert.equal(hiddenSaidOf({}), null);
    assert.equal(hiddenSaidOf({ email: 0 }), null);
  });
});

describe('masksOf', () => {
  it('takes every --mask and those in .sideshot.json, and always what the page marks', () => {
    assert.deepEqual(masksOf(['--mask', '.vip', '--part', 'a=.a', '--mask', 'td:nth-child(2), .ssn'], { mask: ['.account'] }), [
      '[data-sideshot-mask]',
      '.account',
      '.vip',
      'td:nth-child(2), .ssn',
    ]);
    assert.deepEqual(masksOf([], { mask: '.one, .two' }), ['[data-sideshot-mask]', '.one, .two']);
    assert.deepEqual(masksOf([], {}), ['[data-sideshot-mask]']);
  });
  it('refuses a --mask with nothing after it, and a mask in .sideshot.json that is not a selector', () => {
    assert.throws(() => masksOf(['--mask'], {}), (e) => e instanceof UsageError && /--mask needs a selector/.test(e.message));
    assert.throws(() => masksOf([], { mask: [3] }), (e) => e instanceof UsageError && /"mask" in .sideshot.json/.test(e.message));
    assert.throws(() => masksOf([], { mask: { a: 1 } }), (e) => e instanceof UsageError && /"mask" in .sideshot.json/.test(e.message));
  });
});
