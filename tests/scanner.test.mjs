import test from 'node:test';
import assert from 'node:assert/strict';
import { scanEnvironment, identifyBrowser, identifyOS, summarize, reportText } from '../dist/scanner.js';

const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36';
function environment(overrides = {}) {
  return { location: { protocol: 'https:' }, isSecureContext: true,
    navigator: { userAgent: chromeUA, permissions: { query() { throw new Error('Must never query permission'); } }, credentials: { get() { throw new Error('Must never request credentials'); } } },
    crypto: { subtle: { digest() { throw new Error('Presence only'); } } }, PublicKeyCredential: function() {},
    fetch() { throw new Error('Network access is forbidden'); }, ...overrides };
}
const status = (report, id) => report.results.find(r => r.id === id).status;

test('HTTPS and secure context are separate observations; no fake device claims', () => {
  const report = scanEnvironment(environment());
  assert.equal(status(report, 'https'), 'verified');
  assert.equal(status(report, 'context'), 'verified');
  for (const id of ['browser-updates', 'os-updates', 'antivirus', 'cve', 'malware']) assert.equal(status(report, id), 'unknown');
  assert.deepEqual(summarize(report.results), { verified: 7, warning: 0, unknown: 5 });
});

test('HTTP localhost can be a secure context and still lacks HTTPS', () => {
  const report = scanEnvironment(environment({ location: { protocol: 'http:' }, isSecureContext: true }));
  assert.equal(status(report, 'https'), 'warning');
  assert.equal(status(report, 'context'), 'verified');
});

test('insecure HTTP warns, unavailable optional APIs remain unknown', () => {
  const report = scanEnvironment({ location: { protocol: 'http:' }, isSecureContext: false, navigator: {} });
  assert.equal(status(report, 'https'), 'warning');
  assert.equal(status(report, 'context'), 'warning');
  for (const id of ['crypto', 'webauthn', 'permissions', 'browser', 'os']) assert.equal(status(report, id), 'unknown');
});

test('restricted browser getters and empty environment fail safely', () => {
  const scope = new Proxy({}, { get() { throw new Error('Blocked'); } });
  const report = scanEnvironment(scope);
  assert.deepEqual(summarize(report.results), { verified: 0, warning: 0, unknown: 12 });
  assert.equal(scanEnvironment({}).results.length, 12);
});

test('local file protocol is not mistaken for HTTPS', () => {
  assert.equal(status(scanEnvironment(environment({ location: { protocol: 'file:' } })), 'https'), 'unknown');
});

test('browser parsing prioritizes Edge, Opera, Samsung, and iOS tokens', () => {
  assert.equal(identifyBrowser(`${chromeUA} Edg/140.0.0.0`).name, 'Microsoft Edge');
  assert.equal(identifyBrowser(`${chromeUA} OPR/100.0`).name, 'Opera');
  assert.equal(identifyBrowser(`${chromeUA} SamsungBrowser/25.0`).name, 'Samsung Internet');
  assert.equal(identifyBrowser('Mozilla/5.0 iPhone CriOS/140.0 Mobile Safari/604.1').name, 'Chrome za iOS');
  assert.equal(identifyBrowser('Version/18.4 Mobile Safari/604.1').name, 'Safari');
  assert.equal(identifyBrowser('unknown', [{ brand: 'Not_A Brand', version: '99' }]).name, 'Neznan brskalnik');
  assert.equal(identifyBrowser('', [{ brand: 'Chromium', version: '140' }]).name, 'Chromium');
});

test('OS detection never interprets frozen Windows or macOS UA as exact release', () => {
  assert.deepEqual(identifyOS(chromeUA), { name: 'Windows', guide: 'windows' });
  assert.equal(identifyOS('Mozilla Android 10 Linux').guide, 'android');
  assert.equal(identifyOS('Mozilla iPad CPU OS 18_0 like Mac OS X').guide, 'ios');
  assert.equal(identifyOS('Mozilla Macintosh Intel Mac OS X 10_15_7').name, 'macOS (lahko tudi iPad v namiznem načinu)');
  assert.equal(identifyOS('Mozilla CrOS x86_64').guide, null);
});

test('export preserves unknowns, evidence and limitations', () => {
  const report = scanEnvironment(environment());
  const output = reportText(report);
  assert.match(output, /Ni mogoče preveriti — Zlonamerna programska oprema/);
  assert.match(output, /Dokaz: location.protocol = https:/);
  assert.match(output, /ne ocena varnosti naprave/);
  assert.equal(report.results.filter(r => output.includes(r.title)).length, 12);
});
