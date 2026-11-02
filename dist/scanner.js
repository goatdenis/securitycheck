export const STATUS = Object.freeze({ verified: 'Preverjeno', warning: 'Opozorilo', unknown: 'Ni mogoče preveriti' });

// Read-only, low-entropy browser observations. Never request permissions, enumerate
// installed software, contact a version service, or store identifiers.
function read(getter, fallback = null) {
  try { return getter() ?? fallback; } catch { return fallback; }
}

export function identifyBrowser(ua = '', brands = []) {
  const patterns = [
    [/Edg(?:e|A|iOS)?\/([\d.]+)/, 'Microsoft Edge'],
    [/OP(?:R|iOS)\/([\d.]+)/, 'Opera'],
    [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
    [/FxiOS\/([\d.]+)/, 'Firefox za iOS'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/CriOS\/([\d.]+)/, 'Chrome za iOS'],
    [/Chrome\/([\d.]+)/, 'Chrome / Chromium'],
    [/Version\/([\d.]+).*Safari\//, 'Safari']
  ];
  for (const [pattern, name] of patterns) {
    const match = ua.match(pattern);
    if (match) return { name, version: match[1], source: 'navigator.userAgent' };
  }
  if (Array.isArray(brands)) {
    const brand = brands.find(b => ['Microsoft Edge', 'Google Chrome', 'Chromium', 'Opera', 'Brave'].includes(b?.brand));
    if (brand) return { name: brand.brand, version: String(brand.version || ''), source: 'navigator.userAgentData.brands' };
  }
  return { name: 'Neznan brskalnik', version: '', source: 'Ni prepoznavnega podatka' };
}

export function identifyOS(ua = '', platform = '') {
  // Do not infer exact OS releases: browser UA values may be frozen or reduced.
  if (/iPhone|iPad|iPod/.test(ua)) return { name: /iPad/.test(ua) ? 'iPadOS' : 'iOS', guide: 'ios' };
  if (/Android/.test(ua) || platform === 'Android') return { name: 'Android', guide: 'android' };
  if (/Windows/.test(ua) || platform === 'Windows') return { name: 'Windows', guide: 'windows' };
  if (/CrOS/.test(ua) || platform === 'Chrome OS') return { name: 'ChromeOS', guide: null };
  if (/Macintosh|Mac OS X/.test(ua) || platform === 'macOS') return { name: 'macOS (lahko tudi iPad v namiznem načinu)', guide: 'macos' };
  if (/Linux/.test(ua) || platform === 'Linux') return { name: 'Linux', guide: null };
  return { name: 'Neznan sistem', guide: null };
}

export function scanEnvironment(scope) {
  const nav = read(() => scope.navigator, {});
  const ua = read(() => nav.userAgent, '');
  const hints = read(() => nav.userAgentData, {});
  const browser = identifyBrowser(typeof ua === 'string' ? ua : '', read(() => hints.brands, []));
  const os = identifyOS(typeof ua === 'string' ? ua : '', read(() => hints.platform, ''));
  const protocol = read(() => scope.location.protocol);
  const secure = read(() => scope.isSecureContext);
  const crypto = read(() => typeof scope.crypto.subtle.digest === 'function', false);
  const webauthn = read(() => typeof scope.PublicKeyCredential === 'function' && typeof nav.credentials.get === 'function', false);
  const permissions = read(() => typeof nav.permissions.query === 'function', false);
  const row = (id, title, group, icon, status, value, description, evidence, limitation) => ({ id, title, group, icon, status, value, description, evidence, limitation });
  const results = [
    row('https', 'Povezava HTTPS', 'Povezava', 'lock', protocol === 'https:' ? 'verified' : protocol === 'http:' ? 'warning' : 'unknown',
      protocol === 'https:' ? 'Stran je odprta prek HTTPS' : protocol === 'http:' ? 'Stran je odprta prek HTTP' : 'Protokola HTTPS ni mogoče potrditi',
      protocol === 'https:' ? 'Naslov te strani uporablja šifriran spletni protokol.' : protocol === 'http:' ? 'Ta naslov ne uporablja HTTPS. Za spletne storitve uporabljajte njihov uradni naslov HTTPS.' : 'Lokalne datoteke in drugi protokoli niso preverjanje povezave HTTPS.',
      `location.protocol = ${protocol ?? 'nedostopno'}`, 'To ne preveri celotne verige certifikatov, različice TLS, omrežja ali drugih odprtih strani.'),
    row('context', 'Varnostni kontekst', 'Povezava', 'shield', typeof secure === 'boolean' ? (secure ? 'verified' : 'warning') : 'unknown',
      secure === true ? 'Brskalnik potrjuje varen kontekst' : secure === false ? 'Kontekst ni varen' : 'Podatek ni dostopen',
      secure === true ? 'Ta stran lahko uporablja API-je, omejene na varne kontekste.' : secure === false ? 'Nekatere spletne funkcije so zato omejene. Preverite naslov HTTPS in način odpiranja strani.' : 'Brskalnik tega podatka ne izpostavi.',
      `window.isSecureContext = ${secure ?? 'nedostopno'}`, 'Tudi localhost je lahko varen kontekst brez HTTPS. Ta podatek ne potrjuje varnosti naprave.'),
    row('browser', 'Zaznani brskalnik', 'Okolje', 'globe', browser.version || browser.name !== 'Neznan brskalnik' ? 'verified' : 'unknown',
      `${browser.name}${browser.version ? ` · ${browser.version}` : ''}`,
      'Prikazan je podatek, ki ga sporoča brskalnik, ne neodvisno potrjena identiteta ali aktualnost.',
      browser.source, 'Podatki so lahko skrajšani, zamrznjeni ali spremenjeni. Brskalnikov s podobnim identifikatorjem ni vedno mogoče razlikovati.'),
    row('os', 'Zaznani operacijski sistem', 'Okolje', 'monitor', os.name === 'Neznan sistem' ? 'unknown' : 'verified',
      os.name, 'Družina sistema je razbrana iz podatkov brskalnika. Točna različica sistema ni potrjena.',
      hints && read(() => hints.platform) ? 'navigator.userAgent in userAgentData.platform' : 'navigator.userAgent', 'Identifikator je lahko spremenjen. Windows 10 in 11 pogosto sporočata enak podatek; iPad se lahko predstavi kot Mac.'),
    row('crypto', 'Spletna kriptografija', 'Spletne funkcije', 'key', crypto ? 'verified' : 'unknown',
      crypto ? 'Vmesnik Web Crypto je na voljo' : 'Vmesnik ni zaznan ali je omejen',
      'Preverjena je prisotnost kriptografskega vmesnika v tej strani.',
      `crypto.subtle.digest: ${crypto ? 'prisoten' : 'ni dostopen'}`, 'Prisotnost ne potrjuje pravilnega šifriranja drugih aplikacij. Odsotnost sama po sebi ni ranljivost.'),
    row('webauthn', 'Podpora za WebAuthn', 'Spletne funkcije', 'fingerprint', webauthn ? 'verified' : 'unknown',
      webauthn ? 'Vmesnik za prijavne ključe je zaznan' : 'Vmesnik ni zaznan ali je omejen',
      'Preverjena je samo prisotnost spletnega vmesnika. Prijava ali biometrično preverjanje se ne zažene.',
      `PublicKeyCredential in credentials.get: ${webauthn ? 'prisotna' : 'nista potrjena'}`, 'Ne preverjamo, ali imate nastavljen prijavni ključ, biometrijo ali fizični varnostni ključ.'),
    row('permissions', 'Vmesnik za spletna dovoljenja', 'Spletne funkcije', 'sliders', permissions ? 'verified' : 'unknown',
      permissions ? 'Permissions API je zaznan' : 'Vmesnik ni zaznan ali je omejen',
      'Osnovni pregled preveri le prisotnost vmesnika. Stanje dovoljenj se bere samo v ločenem razširjenem pregledu z vašo privolitvijo; tipal ne vklopimo.',
      `navigator.permissions.query: ${permissions ? 'prisoten' : 'ni dostopen'}`, 'To ni pregled vseh dovoljenj ali nastavitev zasebnosti brskalnika.'),
    row('browser-updates', 'Aktualnost različice brskalnika', 'Posodobitve', 'refresh', 'unknown', 'Ni zanesljive primerjave s svežimi izdajami',
      'Aplikacija nima povezanega svežega vira izdaj za vaš kanal in platformo. Zato različice ne označi kot aktualne ali zastarele.',
      'Primerjava različic ni izvedena.', 'Različico preverite v meniju brskalnika: Pomoč → O brskalniku. Safari se posodablja s sistemom.'),
    row('os-updates', 'Posodobitve operacijskega sistema', 'Sistem in aplikacije', 'refresh', 'unknown', 'Zgodovina posodobitev ni dostopna strani',
      'Spletna stran ne more prebrati nameščenih sistemskih popravkov ali potrditi, ali so na voljo posodobitve.',
      'Brskalnik nima splošnega API-ja za pregled sistemskih posodobitev.', 'Preverite v nastavitvah sistema. Konkretna navodila so v razdelku Posodobitve.'),
    row('antivirus', 'Protivirusna zaščita', 'Sistem in aplikacije', 'shield', 'unknown', 'Status protivirusne zaščite ni dostopen',
      'Spletna stran ne vidi, kateri antivirus je nameščen, ali deluje in kdaj se je nazadnje posodobil.',
      'Podatek iz operacijskega sistema ni dostopen.', 'Odprite sistemsko varnostno aplikacijo ali nameščeno protivirusno orodje in preverite njegovo stanje.'),
    row('cve', 'CVE nameščenih aplikacij', 'Sistem in aplikacije', 'layers', 'unknown', 'Seznam aplikacij in njihovih različic ni dostopen',
      'Brez popisa nameščene programske opreme in zanesljive primerjave z viri ranljivosti ni mogoče ugotoviti izpostavljenosti CVE.',
      'Popis aplikacij in primerjava CVE nista izvedena.', 'Posodobite aplikacije prek uradnih trgovin ali njihove vgrajene funkcije za posodobitev.'),
    row('malware', 'Zlonamerna programska oprema', 'Sistem in aplikacije', 'search', 'unknown', 'Pregled datotek in procesov ni mogoč',
      'Spletna stran ne more skenirati diska, pomnilnika ali procesov. Ta pregled ne zazna in ne izključi okužbe.',
      'Dostop do datotek, pomnilnika in procesov ni zahtevan.', 'Ob sumu okužbe uporabite zaupanja vredno lokalno varnostno orodje in po potrebi strokovno pomoč.')
  ];
  return { checkedAt: new Date().toISOString(), browser, os, results };
}

export function summarize(results) {
  return results.reduce((counts, result) => { counts[result.status]++; return counts; }, { verified: 0, warning: 0, unknown: 0 });
}

export function reportText(report) {
  return ['DEVICE SECURITY SCANNER — POROČILO', `Čas pregleda: ${report.checkedAt}`,
    'To je omejen pregled podatkov brskalnika, ne ocena varnosti naprave.',
    ...(report.extendedConsent ? [`Razširjeni pregled: ${report.extendedCheckedAt}`, `Izrecna privolitev: ${report.extendedConsent.acceptedAt}; obvestilo: ${report.extendedConsent.noticeVersion}`, `Izbrane skupine: ${report.extendedConsent.categories.join(', ')}`, 'Dovoljenje ne omogoči sistemskega dostopa. Nastavitve dovoljenj niso spremenjene.'] : []), '',
    ...report.results.flatMap(r => [`${STATUS[r.status]} — ${r.title}`, r.value, r.description, `Dokaz: ${r.evidence}`, `Omejitev / naslednji korak: ${r.limitation}`, '']),
    'Rezultati so bili ustvarjeni lokalno. Aplikacija jih ne pošilja na strežnik.'].join('\n');
}
