# Device Security Scanner

Odzivna slovenska spletna aplikacija brez odvisnosti. Izvor in datoteke za objavo so v `dist/`.

## Zagon

Potrebna sta Node.js za preizkuse in Python 3 za lokalni predogled.

```sh
npm test
npm run dev
```

Odprite http://127.0.0.1:4173. Lokalni predogled na HTTP pravilno prikaže opozorilo za HTTPS; localhost je lahko kljub temu varen kontekst.

## Preverjanja

Po izrecnem kliku aplikacija prebere protokol strani, `isSecureContext`, User-Agent in že dostopne osnovne Client Hints ter prisotnost Web Crypto, WebAuthn in Permissions API. Prisotnost API-ja ne pomeni njegove uspešne uporabe ali varnosti naprave. Dovoljenj ne zahteva, prijave ne sproži in ne bere datotek.

## Prostovoljni razširjeni pregled za Android in iOS

Gumb »Razširjeni pregled« odpre dostopen dialog. Vse skupine podatkov in privolitev so privzeto neizbrane. Šele po izrecni potrditvi se preberejo izbrane skupine:

- `fullVersionList` in `platformVersion` prek Client Hints, če ju brskalnik omogoča. Ne beremo modela naprave, arhitekture ali drugih dodatnih identifikatorjev.
- Stanje dovoljenj `camera`, `microphone` in `geolocation` za trenutno stran prek `Permissions.query`. Tipal ne vklopimo, njihove vsebine ne beremo in ne zahtevamo novih dovoljenj.
- Dejanski preizkus SHA-256 za vgrajeno besedilo »abc« ter `isUserVerifyingPlatformAuthenticatorAvailable`. Ne izvajamo prijave ali biometričnega preverjanja in ne sklepamo o nastavljenem PIN-u ali Face ID.

Največ sedem dodatnih ugotovitev vsebuje dokaz in omejitev. Nepodprti API-ji, zavrnitve in časovne omejitve ostanejo nepreverljivi. To je posebej pomembno za iOS in Safari. Noben rezultat ne spremeni nepreverljivosti sistemskih popravkov, antivirusa, CVE ali malware.

Izbor, privolitev in rezultati ostanejo samo v pomnilniku zavihka. Preklic vmesnega pregleda zavrže pozne rezultate. »Odstrani dodatne podatke« izbriše dodatne ugotovitve in zapis privolitve, osnovni ponovni pregled pa začne brez njih. To ne spreminja že nastavljenih dovoljenj v brskalniku. Poročilo vključuje čas ter obseg privolitve. Ločena navodila za Android in iOS pomagajo pri ročnem preverjanju sistemskih nastavitev in ne povečujejo števcev preverjenih dejstev.

Aktualnost brskalnika, posodobitve OS, antivirus, CVE nameščenih aplikacij in malware so vedno označeni z »Ni mogoče preveriti«. Ni povezanega svežega vira različic in aplikacija nima dostopa do sistemskega popisa. Ni izmišljenih ocen ali trditev o varnosti celotne naprave.

Rezultati so samo v pomnilniku zavihka; izbris, ponovni pregled in lokalni prenos besedilnega poročila so podprti. Ni analitike, piškotkov aplikacije, trajne hrambe, zunanjih pisav ali omrežnih zahtev pregleda. Gostitelj lahko ob dostopu prejme običajne omrežne podatke; zasebno gostovanje lahko uporablja svojo prijavo in piškotke. To je pojasnjeno v aplikaciji.

## Dostopnost in prikaz

Semantični elementi, slovenski jezik, preskočna povezava, viden fokus, statusi z besedilom in ikonami, obvestila `aria-live`, izvorno razširljive podrobnosti, tipkovnične sistemske kartice in podpora zmanjšanemu gibanju. Postavitev za telefone, tablice in računalnike. Navodila vključujejo neposredne povezave do uradne podpore Microsoft, Apple in Google.

`tests/scanner.test.mjs` preverja HTTPS/varen kontekst, nedostopne API-je, napake getterjev, User-Agent dvoumnosti, nepreverljive sistemske podatke in poročilo.
