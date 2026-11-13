'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const cp = require('node:child_process');
const crypto = require('node:crypto');

const FORMATS = ['docx', 'xlsx', 'pptx'];
const LANGS = ['fr', 'en'];
const WIDTHS = [1360, 1100, 900];
const HEIGHT = 960;
const LAUNCH_TIMEOUT = 180000;
const TAB_TIMEOUT = 30000;

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i].replace(/^--/, '');
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) { args[key] = true; continue; }
    args[key] = value; i++;
  }
  return args;
}

function list(value, fallback) {
  if (!value) return fallback;
  return String(value).split(',').map(s => s.trim()).filter(Boolean);
}

function rectsIntersect(a, b, threshold = 1) {
  const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
  const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
  return x >= threshold && y >= threshold;
}

function isOutsideGroup(rect, groupRect, threshold = 1) {
  if (!rect || !groupRect) return false;
  return rect.left < groupRect.left - threshold || rect.right > groupRect.right + threshold ||
         rect.top < groupRect.top - threshold || rect.bottom > groupRect.bottom + threshold;
}

function labelTooWide(labelRect, groupRect) {
  if (!labelRect || !groupRect) return false;
  return labelRect.width > groupRect.width + 1;
}

function selectorPath(element) {
  if (!element) return '';
  const parts = [];
  let current = element;
  while (current && current.nodeType === 1 && parts.length < 6) {
    let part = current.tagName.toLowerCase();
    if (current.id) part += '#' + current.id;
    else if (current.className && typeof current.className === 'string') {
      const classes = current.className.trim().split(/\s+/).slice(0, 3).join('.');
      if (classes) part += '.' + classes;
    }
    parts.unshift(part);
    current = current.parentElement;
  }
  return parts.join(' > ');
}

function rectOf(element) {
  const r = element.getBoundingClientRect();
  return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
}

function visible(element) {
  const style = getComputedStyle(element);
  return style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null;
}

const DETECTOR = `(() => {
  ${[visible, rectOf, rectsIntersect, isOutsideGroup, labelTooWide, selectorPath].map(f => f.toString()).join("\n")}
  const toolbar = document.querySelector('#toolbar');
  if (!toolbar) return { error: 'toolbar missing' };
  const panel = toolbar.querySelector('.box-panels > .panel.active');
  if (!panel) return { error: 'active panel missing' };
  const findings = [];
  const seen = new Set();
  const push = (kind, element, rect, extra = {}) => {
    const key = kind + '|' + (element.outerHTML || '').slice(0, 120) + '|' + JSON.stringify(rect);
    if (seen.has(key)) return;
    seen.add(key);
    findings.push({ kind, selector: ${selectorPath.name}(element), rect, text: (element.textContent || '').trim().slice(0, 120), ...extra });
  };
  const groups = [...panel.querySelectorAll(':scope > .group')].filter(g => g.offsetParent);
  const targets = [];
  for (const group of groups) {
    for (const element of group.querySelectorAll('.btn-toolbar, .btn-slot > *, .icon, svg.icon, .toolbar__icon, .caption, input, .combobox')) {
      if (element.offsetParent && ${visible.name}(element)) targets.push({ element, group });
    }
  }
  for (let i = 0; i < targets.length; i++) {
    for (let j = i + 1; j < targets.length; j++) {
      const a = targets[i], b = targets[j];
      if (a.element === b.element) continue;
      if (a.element.contains(b.element) || b.element.contains(a.element)) continue;
      const ra = rectOf(a.element), rb = rectOf(b.element);
      if (ra.width === rb.width && ra.height === rb.height && ra.left === rb.left && ra.top === rb.top) continue;
      if (${rectsIntersect.name}(ra, rb, 1)) push('overlap', a.element, ra, { other: ${selectorPath.name}(b.element), otherRect: rb });
    }
  }
  for (const { element, group } of targets) {
    const rect = rectOf(element), groupRect = rectOf(group);
    if (${isOutsideGroup.name}(rect, groupRect, 1)) push('outside-group', element, rect, { groupRect });
  }
  for (const element of panel.querySelectorAll('*')) {
    if (!element.offsetParent || !${visible.name}(element)) continue;
    if (element.scrollWidth > element.clientWidth + 1 && element.clientWidth > 0) {
      push('clipped-text', element, rectOf(element), { scrollWidth: element.scrollWidth, clientWidth: element.clientWidth });
    }
  }
  for (const group of groups) {
    const label = group.querySelector('.group-name, .elx-group-label, .elx-group-title') ||
      [...group.querySelectorAll('*')].reverse().find(e => {
        const r = e.getBoundingClientRect(), pr = panel.getBoundingClientRect();
        return e.textContent.trim() && r.bottom > pr.bottom - 18 && r.bottom <= pr.bottom;
      });
    if (!label) continue;
    const labelRect = rectOf(label), groupRect = rectOf(group);
    if (${labelTooWide.name}(labelRect, groupRect)) push('label-too-wide', label, labelRect, { groupRect });
  }
  return { findings };
})()`;

async function waitForLayout(frame) {
  await frame.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await new Promise(resolve => setTimeout(resolve, 300));
}

async function launchXvfb(xvfbPath, output) {
  await fs.writeFile(path.join(output, 'desktop.Xauthority'), '');
  const display = cp.spawn(xvfbPath, ['-screen', '0', '1360x960x24', '-nolisten', 'tcp', '-displayfd', '1'], { stdio: ['ignore', 'pipe', 'ignore'] });
  const number = await new Promise((resolve, reject) => {
    let data = '';
    const timer = setTimeout(() => reject(Error('display timeout')), 20000);
    display.stdout.on('data', chunk => { data += chunk; if (data.includes('\n')) { clearTimeout(timer); resolve(data.trim()); } });
    display.once('exit', code => reject(Error('display exited ' + code)));
  });
  process.env.EO_DESKTOP_DISPLAY = ':' + number;
  return display;
}

async function runOne({ format, lang, width, executable, xvfb, playwright, out, fixtures }) {
  const output = path.join(out, `${format}-${lang}-${width}`);
  await fs.mkdir(output, { recursive: true });
  process.env.EO_DESKTOP_ROOT = output;
  process.env.EO_TEST_FONT_DECLINED = '1';
  process.env.EO_PLAYWRIGHT = path.resolve(playwright);
  process.env.EO_TEMP_LOCATION_CHECK = '0';
  const harness = require(path.resolve(__dirname, '../../tests/desktop/harness.cjs'));
  let env, display;
  const cleanup = async () => {
    if (env) await harness.stop(env).catch(() => {});
    if (display) display.kill('SIGTERM');
  };
  try {
    display = await launchXvfb(xvfb, output);
    await fs.mkdir(path.join(output, 'input'), { recursive: true });
    const file = path.join(output, 'input', path.basename(fixtures[format]));
    await fs.copyFile(fixtures[format], file);
    env = await harness.launch({
      file,
      executable: path.resolve(executable),
      profile: 'ribbon-' + crypto.randomUUID(),
      args: ['--lang=' + lang]
    });
    await harness.editable(env);
    await env.page.setViewportSize({ width, height: HEIGHT });
    await new Promise(resolve => setTimeout(resolve, 1000));
    const frame = env.page.frames().find(f => /\/(document|spreadsheet|presentation)editor\/main\//.test(f.url()));
    if (!frame) throw Error('editor frame not found');
    await frame.waitForSelector('#toolbar', { timeout: 30000 });
    const allFindings = [];
    await new Promise(resolve => setTimeout(resolve, 2500));
    const alerts = await frame.evaluate(() => [...document.querySelectorAll('.asc-window.alert, .asc-window.modal')].filter(e => getComputedStyle(e).display !== 'none' && e.offsetWidth > 0).map(e => (e.innerText || '').trim().slice(0, 300)));
    for (const text of alerts) allFindings.push({ format, lang, width, tab: '(open)', kind: 'alert', text });
    const tabs = await frame.evaluate(() => [...document.querySelectorAll('#toolbar .ribtab')].filter(t => t.offsetParent && !t.classList.contains('x-lone')).map(t => t.querySelector('a[data-tab]')).filter(Boolean).map(a => a.getAttribute('data-tab')).filter(t => t !== 'file'));

    for (const tab of tabs) {
      try {
        await frame.evaluate(t => { const a = document.querySelector(`#toolbar a[data-tab="${t}"]`); if (a) a.click(); }, tab);
        await waitForLayout(frame);
        const toolbar = await frame.$('#toolbar');
        if (toolbar) await toolbar.screenshot({ path: path.join(out, `${format}-${lang}-${width}-${tab}.png`) });
        const result = await frame.evaluate(DETECTOR);
        if (result.error) throw Error(result.error);
        for (const finding of result.findings) allFindings.push({ format, lang, width, tab, ...finding });
      } catch (error) {
        allFindings.push({ format, lang, width, tab, kind: 'tab-error', text: String(error.message || error).slice(0, 200) });
      }
    }
    return { format, lang, width, findings: allFindings };
  } finally {
    await cleanup();
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.executable || !args.xvfb || !args.playwright || !args.out) {
    console.error('Usage: node tools/qa/ribbon-audit.cjs --executable PATH --xvfb PATH --playwright PATH --out DIR [--langs fr,en] [--widths 1360,1100,900] [--formats docx,xlsx,pptx] [--docx PATH] [--xlsx PATH] [--pptx PATH]');
    process.exit(1);
  }
  const out = path.resolve(args.out);
  await fs.mkdir(out, { recursive: true });
  const formats = list(args.formats, FORMATS);
  const langs = list(args.langs, LANGS);
  const widths = list(args.widths, WIDTHS).map(Number);
  const fixtures = { docx: args.docx, xlsx: args.xlsx, pptx: args.pptx };
  const runs = [];
  let failures = 0;
  for (const format of formats) {
    for (const lang of langs) {
      for (const width of widths) {
        try {
          const run = await runOne({ format, lang, width, executable: args.executable, xvfb: args.xvfb, playwright: args.playwright, out, fixtures });
          runs.push(run);
          console.log(`${format} ${lang} ${width}: ${run.findings.length} findings`);
        } catch (error) {
          failures++;
          console.error(`${format} ${lang} ${width}: FAILED ${error.message}`);
        }
      }
    }
  }
  const allFindings = runs.flatMap(run => run.findings);
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(allFindings, null, 2));
  const lines = ['# Ribbon Audit', ''];
  for (const run of runs) {
    lines.push(`## ${run.format} ${run.lang} ${run.width}`, '');
    lines.push('| Tab | Findings | First finding |', '|---|---|---|');
    const byTab = {};
    for (const finding of run.findings) (byTab[finding.tab] ||= []).push(finding);
    for (const [tab, findings] of Object.entries(byTab)) {
      const first = findings[0];
      lines.push(`| ${tab} | ${findings.length} | ${first.kind}: ${first.text || first.selector || ''} |`);
    }
    lines.push('');
  }
  await fs.writeFile(path.join(out, 'report.md'), lines.join('\n'));
  process.exit(failures === runs.length && failures > 0 ? 1 : 0);
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });

module.exports = { rectsIntersect, isOutsideGroup, labelTooWide, selectorPath, parseArgs, list };
