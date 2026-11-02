import { scanEnvironment, summarize, STATUS, reportText } from './scanner.js';
import { scanExtendedEnvironment, CATEGORY_NAMES } from './extended-scanner.js';

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
let report = null;
let currentFilter = 'all';
let extendedController = null;
let extendedRun = 0;
const titles = { pregled: 'Varnostni pregled', posodobitve: 'Posodobitve', zasebnost: 'Zasebnost', 'kako-deluje': 'Kako deluje' };
const statusIcons = { verified: 'check-circle', warning: 'alert', unknown: 'minus-circle' };
const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const icon = (name, classes = '') => `<svg class="icon ${classes}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

$$('svg.icon').forEach(svg => svg.setAttribute('aria-hidden', 'true'));
const initialResults = $('#results-list').innerHTML;
$('.skip-link').addEventListener('click', event => {
  event.preventDefault();
  $('#main').focus();
});

function announce(message) { $('#announcer').textContent = message; }

function renderResults() {
  if (!report) return;
  const results = report.results.filter(r => currentFilter === 'all' || r.status === currentFilter);
  $('#results-list').innerHTML = results.length ? results.map(r => `
    <details class="result-item">
      <summary>
        <span class="row-icon">${icon(r.icon)}</span>
        <span class="result-copy">${r.extended ? '<small class="result-source">RAZŠIRJENI PREGLED</small>' : ''}<strong>${escape(r.title)}</strong><span>${escape(r.value)}</span></span>
        <span class="status-badge ${r.status}">${icon(statusIcons[r.status])}${STATUS[r.status]}</span>
        ${icon('chevron', 'row-chevron')}
      </summary>
      <div class="result-detail"><p>${escape(r.description)}</p><div class="evidence"><strong>Vir podatka</strong><br><code>${escape(r.evidence)}</code></div><p class="limitation"><strong>Omejitev / naslednji korak:</strong> ${escape(r.limitation)}</p></div>
    </details>`).join('') : `<div class="result-empty">${icon('check-circle')}V tej skupini ni ugotovitev.<br>To ni potrdilo o varnosti naprave.</div>`;
  $$('.filter').forEach(button => {
    const active = button.dataset.filter === currentFilter;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
}

function updateReportUI() {
  if (!report) return;
  const counts = summarize(report.results);
  for (const [status, count] of Object.entries(counts)) $(`#count-${status}`).textContent = count;
  const formatted = new Intl.DateTimeFormat('sl-SI', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(report.extendedCheckedAt || report.checkedAt));
  $('#report-time').textContent = `Opravljeno ${formatted} · čas vaše naprave`;
  $('.count-tag').textContent = `${report.results.length} področij`;
  $('#device-name').textContent = report.os.name === 'Neznan sistem' ? 'Omejeni podatki o okolju' : 'Vaše zaznano okolje';
  $('#device-subtitle').textContent = 'Podatki, ki jih sporoča ta brskalnik. Aktualnost različic ni potrjena.';
  $('#device-browser').textContent = `${report.browser.name}${report.browser.version ? ` ${report.browser.version}` : ''}`;
  $('#device-os').textContent = report.os.name;
  $('#export-button').disabled = false;
  $('#clear-button').hidden = false;
  $$('.filter').forEach(b => { b.disabled = false; });
  $('#scan-button span').textContent = 'Ponovi osnovni pregled';
  $('#remove-extended').hidden = !report.extendedConsent;
  $('#extended-state').hidden = !report.extendedConsent;
  if (report.extendedConsent) $('#extended-state').textContent = `Lokalno obdelano z vašo privolitvijo: ${report.extendedConsent.categories.map(c => CATEGORY_NAMES[c]).join('; ')}. Nedostopni podatki ostanejo nepreverljivi.`;
  renderResults();
}

function cancelExtended() {
  extendedRun++;
  extendedController?.abort();
  extendedController = null;
  $('#scan-button').disabled = false;
  $('#open-extended').disabled = false;
  $('#consent-form').removeAttribute('aria-busy');
  $$('#consent-form input').forEach(input => { input.disabled = false; });
  $('#consent-submit span').textContent = 'Dovoli izbrani pregled';
  $('#consent-progress').hidden = true;
  syncConsent();
}

function syncConsent() {
  $('#consent-submit').disabled = !!extendedController || !$('#consent-accepted').checked || !$$('input[name="extended-category"]:checked').length;
}

$('#open-extended').addEventListener('click', () => {
  $('#consent-form').reset();
  syncConsent();
  $('#consent-dialog').showModal();
});
$('#consent-form').addEventListener('change', syncConsent);
$('#consent-dialog').addEventListener('cancel', () => { cancelExtended(); });
$('#consent-dialog').addEventListener('close', () => { cancelExtended(); $('#consent-form').reset(); });
$$('[data-close-consent]').forEach(button => button.addEventListener('click', () => { cancelExtended(); $('#consent-dialog').close(); }));
$('#consent-form').addEventListener('submit', async event => {
  event.preventDefault();
  const consent = { accepted: $('#consent-accepted').checked, categories: $$('input[name="extended-category"]:checked').map(input => input.value) };
  if (!consent.accepted || !consent.categories.length || extendedController) return;
  const run = ++extendedRun;
  extendedController = new AbortController();
  const signal = extendedController.signal;
  $('#consent-form').setAttribute('aria-busy', 'true');
  $$('#consent-form input').forEach(input => { input.disabled = true; });
  $('#scan-button').disabled = $('#open-extended').disabled = true;
  $('#consent-submit').disabled = true;
  $('#consent-submit span').textContent = 'Preverjam izbrane podatke …';
  $('#consent-progress').hidden = false;
  $('#consent-progress').textContent = 'Beremo samo izbrane podatke. Pregled lahko prekličete.';
  try {
    const baseReport = report || scanEnvironment(window);
    const extended = await scanExtendedEnvironment(window, consent, { signal });
    if (signal.aborted || run !== extendedRun) return;
    report = { ...baseReport, results: [...baseReport.results.filter(r => !r.extended), ...extended.results], extendedConsent: extended.consent, extendedCheckedAt: extended.checkedAt };
    currentFilter = 'all';
    updateReportUI();
    extendedController = null;
    cancelExtended();
    $('#consent-dialog').close();
    $('#report-title').tabIndex = -1;
    $('#report-title').focus();
    announce(`Razširjeni pregled je končan. Dodanih področij: ${extended.results.length}. Rezultati so v poročilu in ostanejo samo v zavihku. To ni sistemski ali malware pregled.`);
  } catch (error) {
    if (error.name !== 'AbortError' && run === extendedRun) {
      $('#consent-progress').textContent = 'Dodatnega pregleda ni bilo mogoče dokončati. Zaprite okno in poskusite znova.';
      announce('Razširjenega pregleda ni bilo mogoče dokončati.');
    }
  } finally { if (run === extendedRun) cancelExtended(); }
});
$('#remove-extended').addEventListener('click', () => {
  cancelExtended();
  if (!report) return;
  report.results = report.results.filter(r => !r.extended);
  delete report.extendedConsent;
  delete report.extendedCheckedAt;
  currentFilter = 'all';
  updateReportUI();
  $('#open-extended').focus({ preventScroll: true });
  announce('Dodatni podatki in privolitev so odstranjeni. Nastavitve dovoljenj brskalnika niso spremenjene.');
});

$('#scan-button').addEventListener('click', () => {
  const button = $('#scan-button');
  button.disabled = true;
  try {
    report = scanEnvironment(window);
    currentFilter = 'all';
    const counts = summarize(report.results);
    updateReportUI();
    announce(`Pregled je končan. Preverjeno: ${counts.verified}. Opozorila: ${counts.warning}. Ni mogoče preveriti: ${counts.unknown}. To ni ocena varnosti naprave. Poročilo je pod povzetkom.`);
  } catch {
    $('#report-time').textContent = 'Pregled ni uspel. Poskusite znova ali odprite navodila za ročno preverjanje.';
    announce('Pregleda ni bilo mogoče dokončati. Poskusite znova.');
  } finally { button.disabled = false; }
});

$$('.filter').forEach(button => button.addEventListener('click', () => {
  currentFilter = button.dataset.filter;
  renderResults();
  if (report) announce(`${button.textContent}: ${report.results.filter(r => currentFilter === 'all' || r.status === currentFilter).length} ugotovitev.`);
}));

$('#clear-button').addEventListener('click', () => {
  cancelExtended();
  report = null;
  currentFilter = 'all';
  $('#results-list').innerHTML = initialResults;
  ['verified', 'warning', 'unknown'].forEach(status => { $(`#count-${status}`).textContent = '—'; });
  $('#report-time').textContent = 'Za dejanske rezultate zaženite pregled.';
  $('#device-name').textContent = 'Spoznajmo vašo napravo';
  $('#device-subtitle').textContent = 'Podatke preberemo šele, ko zaženete pregled.';
  $('#device-browser').textContent = $('#device-os').textContent = 'Še ni preverjeno';
  $('#export-button').disabled = true;
  $('#clear-button').hidden = true;
  $('#scan-button span').textContent = 'Preveri mojo napravo';
  $('.count-tag').textContent = '12 področij';
  $('#remove-extended').hidden = $('#extended-state').hidden = true;
  $$('.filter').forEach(button => {
    const active = button.dataset.filter === 'all';
    button.disabled = !active;
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  $('#scan-button').focus({ preventScroll: true });
  announce('Rezultati so odstranjeni iz prikaza in pomnilnika aplikacije. Že prenesene datoteke ostanejo na napravi.');
});

$('#export-button').addEventListener('click', () => {
  if (!report) return;
  const blob = new Blob(['\uFEFF', reportText(report)], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pregled-naprave-${report.checkedAt.slice(0, 10)}.txt`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  announce('Besedilno poročilo je pripravljeno za prenos na vašo napravo.');
});

function selectOS(os, focus = false) {
  const valid = ['windows', 'macos', 'android', 'ios'].includes(os) ? os : 'windows';
  $$('[data-os]').forEach(tab => {
    const selected = tab.dataset.os === valid;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(`#guide-${tab.dataset.os}`).hidden = !selected;
    if (selected && focus) tab.focus();
  });
}

$$('[data-os]').forEach(tab => {
  tab.addEventListener('click', () => {
    selectOS(tab.dataset.os);
    history.replaceState(null, '', `#posodobitve/${tab.dataset.os}`);
  });
  tab.addEventListener('keydown', event => {
    const tabs = $$('[data-os]');
    const index = tabs.indexOf(tab);
    let next;
    if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
    if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = tabs.length - 1;
    if (next === undefined) return;
    event.preventDefault();
    selectOS(tabs[next].dataset.os, true);
    history.replaceState(null, '', `#posodobitve/${tabs[next].dataset.os}`);
  });
});

function route(initial = false) {
  const [requested, os] = location.hash.slice(1).split('/');
  const view = Object.hasOwn(titles, requested) ? requested : 'pregled';
  $$('.view').forEach(section => { section.hidden = section.id !== `view-${view}`; });
  $$('.nav-link').forEach(link => {
    const active = link.hash === `#${view}`;
    link.classList.toggle('active', active);
    if (active) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
  $('#breadcrumb').textContent = titles[view];
  document.title = `Device Security Scanner — ${titles[view]}`;
  if (view === 'posodobitve') selectOS(os || report?.os.guide || 'windows');
  if (!initial) {
    const heading = $(`#view-${view} h1`);
    heading.tabIndex = -1;
    heading.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
}
window.addEventListener('hashchange', () => route());
route(true);
