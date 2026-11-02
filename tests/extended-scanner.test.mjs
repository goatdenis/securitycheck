import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { scanExtendedEnvironment } from '../dist/extended-scanner.js';
import { scanEnvironment, reportText } from '../dist/scanner.js';

const consent = categories => ({ accepted: true, categories });
const all = consent(['details', 'permissions', 'capabilities']);
const unavailable = new Proxy({}, { get() { throw new Error('Not available on this browser'); } });
function environment() {
  return { navigator: {
    userAgentData: { async getHighEntropyValues(keys) {
      assert.deepEqual(keys, ['fullVersionList', 'platformVersion']);
      return { fullVersionList: [{ brand: 'Not_A Brand', version: '999' }, { brand: 'Chromium', version: '140.0.1234.1' }], platformVersion: '16.0.0' };
    } },
    permissions: { async query({ name }) { return { state: { camera: 'granted', microphone: 'denied', geolocation: 'prompt' }[name] }; } },
    mediaDevices: { getUserMedia() { throw new Error('Sensor access forbidden'); } },
    geolocation: { getCurrentPosition() { throw new Error('Location access forbidden'); } },
    credentials: { get() { throw new Error('Credential ceremony forbidden'); }, create() { throw new Error('Credential ceremony forbidden'); } }
  }, crypto: webcrypto, PublicKeyCredential: { async isUserVerifyingPlatformAuthenticatorAvailable() { return true; } },
  fetch() { throw new Error('Network forbidden'); }, localStorage: unavailable };
}

test('no browser properties are touched before explicit consent and category selection', async () => {
  for (const selection of [undefined, {}, { accepted: false, categories: ['permissions'] }, consent([]), consent(['invalid'])]) {
    await assert.rejects(scanExtendedEnvironment(unavailable, selection), /privolitev/);
  }
});

test('only selected categories are accessed', async () => {
  const scope = environment();
  scope.crypto = unavailable;
  scope.PublicKeyCredential = unavailable;
  scope.navigator.userAgentData = unavailable;
  const report = await scanExtendedEnvironment(scope, consent(['permissions']));
  assert.equal(report.results.length, 3);
  assert.ok(report.results.every(r => r.status === 'verified'));
  assert.deepEqual(report.consent.categories, ['permissions']);
});

test('all permission states are facts, never risk scores or implicit requests', async () => {
  const report = await scanExtendedEnvironment(environment(), consent(['permissions']));
  assert.match(report.results[0].value, /Dovoljeno/);
  assert.match(report.results[1].value, /Zavrnjeno/);
  assert.match(report.results[2].value, /še ni dana/);
  assert.ok(report.results.every(r => r.status === 'verified'));
});

test('optional APIs missing in Safari or restricted contexts are unknown', async () => {
  const report = await scanExtendedEnvironment(unavailable, all);
  assert.equal(report.results.length, 7);
  assert.ok(report.results.every(r => r.status === 'unknown'));
});

test('real SHA-256 test and minimal Client Hints produce supported facts', async () => {
  const report = await scanExtendedEnvironment(environment(), all);
  assert.equal(report.results.length, 7);
  assert.ok(report.results.every(r => r.status === 'verified'));
  assert.equal(report.results.find(r => r.id === 'extended-browser-details').value, 'Chromium 140.0.1234.1');
  assert.match(report.results.find(r => r.id === 'extended-crypto-test').evidence, /ba7816bf/);
  assert.ok(report.consent.acceptedAt);
});

test('platform authenticator false is reported accurately without a warning', async () => {
  const scope = environment();
  scope.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable = async () => false;
  const result = (await scanExtendedEnvironment(scope, consent(['capabilities']))).results[1];
  assert.equal(result.status, 'verified');
  assert.match(result.value, /ni na voljo/);
});

test('unknown permission states and malformed or missing Client Hints are not invented', async () => {
  const scope = environment();
  scope.navigator.permissions.query = async () => ({ state: 'unexpected' });
  scope.navigator.userAgentData.getHighEntropyValues = async () => ({ fullVersionList: [{ brand: 'Chromium', version: '<script>' }], platformVersion: 'bad' });
  const report = await scanExtendedEnvironment(scope, consent(['details', 'permissions']));
  assert.ok(report.results.every(r => r.status === 'unknown'));
});

test('one rejected permission does not fail supported independent observations', async () => {
  const scope = environment();
  scope.navigator.permissions.query = async ({ name }) => { if (name === 'camera') throw new TypeError('Unsupported'); return { state: 'prompt' }; };
  const report = await scanExtendedEnvironment(scope, consent(['permissions']));
  assert.deepEqual(report.results.map(r => r.status), ['unknown', 'verified', 'verified']);
});

test('timeouts return unknown and cancellation discards the whole extended result', async () => {
  const scope = environment();
  scope.navigator.permissions.query = () => new Promise(() => {});
  const timed = await scanExtendedEnvironment(scope, consent(['permissions']), { timeoutMs: 5 });
  assert.ok(timed.results.every(r => r.status === 'unknown'));
  const controller = new AbortController();
  const pending = scanExtendedEnvironment(scope, consent(['permissions']), { signal: controller.signal });
  controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
});

test('extended export includes consent and limitations; system conclusions stay unknown', async () => {
  const base = scanEnvironment({});
  const extended = await scanExtendedEnvironment(environment(), all);
  const combined = { ...base, results: [...base.results, ...extended.results], extendedConsent: extended.consent, extendedCheckedAt: extended.checkedAt };
  const text = reportText(combined);
  assert.match(text, /Izrecna privolitev:/);
  assert.match(text, /mobile-1/);
  assert.match(text, /Ni mogoče preveriti — Zlonamerna programska oprema/);
  assert.equal(combined.results.filter(r => ['os-updates', 'antivirus', 'cve', 'malware'].includes(r.id) && r.status === 'unknown').length, 4);
});
