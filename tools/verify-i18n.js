#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const projectRoot = path.resolve(__dirname, '..');
const appDir = path.join(projectRoot, 'src', 'app');
const i18nDir = path.join(projectRoot, 'src', 'assets', 'i18n');

// Keep this aligned with TranslatePipe.DOMAINS in src/app/pipes/translate.pipe.ts
const DOMAINS = [
  'common',
  'auth',
  'dashboard',
  'study',
  'report',
  'patient',
  'form',
  'ocr',
  'validation',
  'messages',
  'settings',
  'template',
  'profile'
];

function walk(dir, exts, out = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      // Skip node_modules just in case
      if (e.name === 'node_modules') continue;
      walk(full, exts, out);
    } else if (e.isFile()) {
      if (!exts || exts.some(ext => e.name.toLowerCase().endsWith(ext))) {
        out.push(full);
      }
    }
  }
  return out;
}

function readFileSafe(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch (_) {
    return '';
  }
}

function extractKeysFromHtml(content) {
  const keys = new Set();
  // String-literal keys used with translate pipe anywhere (interpolation or attributes)
  const pipeRe = /['"]([A-Za-z0-9_.-]+)['"]\s*\|\s*translate\b/g;
  let m;
  while ((m = pipeRe.exec(content)) !== null) {
    keys.add(m[1]);
  }
  // Attribute translate="domain.key"
  const attrTranslateRe = /\btranslate\s*=\s*['"]([^'"\s]+)['"]/g;
  while ((m = attrTranslateRe.exec(content)) !== null) {
    keys.add(m[1]);
  }
  // Property binding [translate]="'domain.key'"
  const propTranslateRe = /\[translate\]\s*=\s*['"][`']?([^'"`]+)[`']?['"]/g;
  while ((m = propTranslateRe.exec(content)) !== null) {
    // Only keep simple dot-notation keys (avoid variables)
    if (/^[A-Za-z]+\.[A-Za-z0-9_.-]+$/.test(m[1])) keys.add(m[1]);
  }
  return keys;
}

function extractKeysFromTs(content) {
  const keys = new Set();
  // translate.instant('domain.key') or translate.get('domain.key')
  const svcRe = /translate\.(?:instant|get)\(\s*['"]([^'"\s]+)['"]\s*\)/gi;
  let m;
  while ((m = svcRe.exec(content)) !== null) {
    keys.add(m[1]);
  }
  return keys;
}

function flattenKeys(obj, prefix = '', out = new Set()) {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) {
    if (prefix) out.add(prefix);
    return out;
  }
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenKeys(v, full, out);
    } else {
      out.add(full);
    }
  }
  return out;
}

function readJsonSafe(file) {
  try {
    const txt = fs.readFileSync(file, 'utf8');
    return JSON.parse(txt);
  } catch (_) {
    return null;
  }
}

function getLanguages() {
  return fs
    .readdirSync(i18nDir, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name)
    .sort();
}

function collectUsedKeys() {
  const htmlFiles = walk(appDir, ['.html']);
  const tsFiles = walk(appDir, ['.ts']);

  const used = new Set();
  for (const f of htmlFiles) {
    const content = readFileSafe(f);
    const k = extractKeysFromHtml(content);
    k.forEach(x => used.add(x));
  }
  for (const f of tsFiles) {
    const content = readFileSafe(f);
    const k = extractKeysFromTs(content);
    k.forEach(x => used.add(x));
  }
  return { used, htmlCount: htmlFiles.length, tsCount: tsFiles.length };
}

function collectAvailableKeysForLang(lang) {
  const available = new Set();
  const missingDomainFiles = [];
  for (const domain of DOMAINS) {
    const p = path.join(i18nDir, lang, `${domain}.json`);
    if (fs.existsSync(p)) {
      const json = readJsonSafe(p);
      if (json) {
        flattenKeys(json, '', available);
      }
    } else {
      missingDomainFiles.push(`${domain}.json`);
    }
  }
  return { available, missingDomainFiles };
}

function groupByDomain(keys) {
  const map = new Map();
  for (const k of keys) {
    const d = k.split('.')[0] || 'unknown';
    if (!map.has(d)) map.set(d, []);
    map.get(d).push(k);
  }
  for (const [d, arr] of map) {
    arr.sort();
  }
  return map;
}

function main() {
  console.log('I18N Verification Report');
  console.log('Project:', projectRoot);
  console.log('DOMAINS:', DOMAINS.join(', '));

  const { used } = collectUsedKeys();
  const usedKeys = Array.from(used).sort();
  console.log(`\nFound ${usedKeys.length} distinct used translation keys (string-literals) in templates/TS.`);

  const languages = getLanguages();
  if (languages.length === 0) {
    console.error('No language directories found under', i18nDir);
    process.exitCode = 1;
    return;
  }
  console.log('Languages:', languages.join(', '));

  let hasMissing = false;

  for (const lang of languages) {
    const { available, missingDomainFiles } = collectAvailableKeysForLang(lang);
    const availableKeys = available;

    const missing = usedKeys.filter(k => !availableKeys.has(k));
    if (missingDomainFiles.length) {
      console.log(`\n[${lang}] Missing domain files: ${missingDomainFiles.join(', ')}`);
    }

    console.log(`\n[${lang}] Missing keys: ${missing.length}`);
    if (missing.length) {
      hasMissing = true;
      const byDomain = groupByDomain(missing);
      for (const [domain, arr] of byDomain) {
        console.log(`  - ${domain}: ${arr.length}`);
        for (const k of arr) console.log(`      ${k}`);
      }
    } else {
      console.log('  None');
    }

    // Optional: unused keys (present in i18n but not used)
    const unused = Array.from(availableKeys).filter(k => used.has(k) === false);
    console.log(`[${lang}] Unused keys: ${unused.length}`);
  }

  if (hasMissing) {
    console.log('\nResult: Some translations are missing.');
    // Keep exit code 0 to avoid failing in local runs; change to 1 if desired for CI.
    // process.exitCode = 1;
  } else {
    console.log('\nResult: All used keys are present in every language.');
  }

  console.log('\nNote: This tool only verifies string-literal keys. Dynamic usages like field.label | translate cannot be validated statically.');
}

main();
