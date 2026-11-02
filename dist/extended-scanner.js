const CATEGORIES = ['details', 'permissions', 'capabilities'];
const CATEGORY_NAMES = { details: 'Podrobnosti brskalnika in platforme', permissions: 'Stanje dovoljenj te strani', capabilities: 'Preizkus kriptografije in podpora prijavnim ključem' };
const SHA256_ABC = 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad';
export { CATEGORY_NAMES };

// No sensor access, network requests, identifiers, storage, or credential ceremony.
// The consent gate precedes every read, including access to navigator.
function abortError() { const error = new Error('Pregled je preklican.'); error.name = 'AbortError'; return error; }
function boundedRead(operation, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(abortError()); return; }
    let timer;
    const finish = (callback, value) => { clearTimeout(timer); signal?.removeEventListener('abort', onAbort); callback(value); };
    const onAbort = () => finish(reject, abortError());
    signal?.addEventListener('abort', onAbort, { once: true });
    timer = setTimeout(() => finish(reject, new Error('Podatek ni bil vrnjen pravočasno.')), timeoutMs);
    Promise.resolve().then(() => { if (signal?.aborted) throw abortError(); return operation(); })
      .then(value => finish(resolve, value), error => finish(reject, error));
  });
}
function result(id, title, icon, status, value, description, evidence, limitation) {
  return { id: `extended-${id}`, title, icon, status, value, description, evidence, limitation, group: 'Razširjeni mobilni pregled', extended: true };
}
function unavailable(id, title, icon, evidence, limitation) {
  return result(id, title, icon, 'unknown', 'Brskalnik podatka ne omogoča ali ga ni vrnil', 'Nepodprt ali omejen vmesnik ni dokaz ranljivosti naprave.', evidence, limitation);
}

export async function scanExtendedEnvironment(scope, consent, { signal, timeoutMs = 5000 } = {}) {
  if (consent?.accepted !== true || !Array.isArray(consent.categories) || !consent.categories.length || consent.categories.some(c => !CATEGORIES.includes(c))) {
    throw new TypeError('Potrebna sta izrecna privolitev in izbor podatkov.');
  }
  if (signal?.aborted) throw abortError();
  const categories = [...new Set(consent.categories)];
  const consentRecord = { accepted: true, categories, acceptedAt: new Date().toISOString(), noticeVersion: 'mobile-1' };
  const check = async (operation, fallback) => {
    try { return await boundedRead(operation, signal, timeoutMs); }
    catch (error) { if (error?.name === 'AbortError') throw error; return fallback(); }
  };
  const tasks = [];
  if (categories.includes('details')) tasks.push(check(async () => {
    const hints = await scope.navigator.userAgentData.getHighEntropyValues(['fullVersionList', 'platformVersion']);
    const known = ['Google Chrome', 'Chromium', 'Microsoft Edge', 'Opera', 'Samsung Internet', 'Brave'];
    const versions = Array.isArray(hints?.fullVersionList) ? hints.fullVersionList.filter(b => known.includes(b?.brand) && /^\d+(?:\.\d+){0,4}$/.test(b?.version)).slice(0, 4) : [];
    const version = typeof hints?.platformVersion === 'string' && /^\d+(?:\.\d+){0,4}$/.test(hints.platformVersion) ? hints.platformVersion : '';
    const limit = 'Podatek sporoča brskalnik in je lahko omejen ali spremenjen. Brez svežega vira izdaj aktualnosti ne ocenjujemo.';
    return [versions.length ? result('browser-details', 'Podrobnejša različica brskalnika', 'globe', 'verified', versions.map(b => `${b.brand} ${b.version}`).join(' · '), 'Prebran je podrobnejši identifikator različice. Ne gre za neodvisno potrjeno identiteto brskalnika.', 'userAgentData.getHighEntropyValues → fullVersionList', limit) : unavailable('browser-details', 'Podrobnejša različica brskalnika', 'globe', 'fullVersionList ni na voljo.', limit),
      version ? result('platform-details', 'Različica platforme iz Client Hints', 'phone', 'verified', version, 'To je vrednost platformVersion, ki jo sporoča brskalnik. Ne potrjuje nameščenih varnostnih popravkov ali dejanske izdaje sistema.', 'userAgentData.getHighEntropyValues → platformVersion', limit) : unavailable('platform-details', 'Različica platforme iz Client Hints', 'phone', 'platformVersion ni na voljo.', limit)];
  }, () => ['browser-details', 'platform-details'].map((id, i) => unavailable(id, i ? 'Različica platforme iz Client Hints' : 'Podrobnejša različica brskalnika', i ? 'phone' : 'globe', 'Client Hints ni podprt, je omejen ali ni odgovoril.', 'Safari in drugi mobilni brskalniki teh podatkov morda ne izpostavijo. Različico preverite v nastavitvah.'))));

  if (categories.includes('permissions')) {
    for (const [name, label] of [['camera', 'Kamera'], ['microphone', 'Mikrofon'], ['geolocation', 'Lokacija']]) {
      tasks.push(check(async () => {
        const permission = await scope.navigator.permissions.query({ name });
        const descriptions = { granted: 'Dovoljeno tej spletni strani', denied: 'Zavrnjeno ali omejeno s politiko', prompt: 'Odobritev še ni dana; brskalnik bi vprašal' };
        if (!Object.hasOwn(descriptions, permission?.state)) throw new Error('Neznano stanje.');
        return result(`permission-${name}`, `${label}: dovoljenje te strani`, 'sliders', 'verified', descriptions[permission.state], 'Prebrano je trenutno stanje za to spletno stran. Kamere, mikrofona in lokacije ne vklopimo in ne beremo.', `navigator.permissions.query({ name: '${name}' }).state = ${permission.state}`, 'To ni pregled dovoljenj drugih aplikacij. Dovoljeno ali zavrnjeno stanje samo po sebi ni varnostna ocena. Za spremembe uporabite nastavitve strani v brskalniku.');
      }, () => unavailable(`permission-${name}`, `${label}: dovoljenje te strani`, 'sliders', `Permissions API za ${name} ni podprt, je omejen ali ni odgovoril.`, 'Stanje preverite ročno v nastavitvah dovoljenj te strani. Dejanskega dostopa do tipala ne zahtevamo.')));
    }
  }
  if (categories.includes('capabilities')) {
    tasks.push(check(async () => {
      const digest = await scope.crypto.subtle.digest('SHA-256', new TextEncoder().encode('abc'));
      const hash = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
      return result('crypto-test', 'Praktični preizkus SHA-256', 'key', hash === SHA256_ABC ? 'verified' : 'warning', hash === SHA256_ABC ? 'Izračun je vrnil pričakovani rezultat' : 'Izračun ni vrnil pričakovanega rezultata', 'Brskalnik izračuna SHA-256 za vgrajeno testno besedilo »abc«. Vaših datotek ali osebnih podatkov pri tem ne uporabimo.', `crypto.subtle.digest('SHA-256', 'abc') = ${hash.slice(0, 128)}`, 'Preizkus ene funkcije ne potrjuje varnosti sistema, šifriranja naprave ali drugih aplikacij.');
    }, () => unavailable('crypto-test', 'Praktični preizkus SHA-256', 'key', 'Kriptografski preizkus ni podprt, ni dovoljen ali ni odgovoril.', 'Vzrok je lahko varnostni kontekst, politika ali omejitev brskalnika. To ni zaznava malware.')));
    tasks.push(check(async () => {
      const available = await scope.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
      if (typeof available !== 'boolean') throw new Error('Neznan odgovor.');
      return result('platform-authenticator', 'Vgrajeni overitelj za prijavne ključe', 'fingerprint', 'verified', available ? 'Brskalnik sporoča, da je overitelj na voljo' : 'Brskalnik sporoča, da overitelj ni na voljo', 'Prebrana je razpoložljivost vgrajenega overitelja WebAuthn. Prijave, Face ID ali odklepanja s prstnim odtisom ne zaženemo.', `PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable() = ${available}`, 'To ne potrdi nastavljenega PIN-a, biometrije, obstoječih prijavnih ključev ali zaklepa zaslona. Odgovor false ni dokaz nevarne naprave.');
    }, () => unavailable('platform-authenticator', 'Vgrajeni overitelj za prijavne ključe', 'fingerprint', 'Preizkus WebAuthn ni podprt, je omejen ali ni odgovoril.', 'Vzrok je lahko tudi zasebni način ali vdelana stran. Ne sklepamo o biometriji ali varnosti naprave.')));
  }
  const results = (await Promise.all(tasks)).flat();
  if (signal?.aborted) throw abortError();
  return { results, consent: consentRecord, checkedAt: new Date().toISOString() };
}
