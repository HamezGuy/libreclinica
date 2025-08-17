#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const glob = require('glob');

// Configuration
const COMPONENT_PATH = path.resolve(__dirname, '..', 'src', 'app', 'components');
const I18N_PATH = path.resolve(__dirname, '..', 'src', 'assets', 'i18n');
const LANGUAGES = ['en', 'hi', 'ja'];

// Words/phrases to skip (component names, technical terms, etc.)
const SKIP_WORDS = new Set([
  'app-',
  'mat-',
  'ng-',
  'ngModel',
  'ngFor',
  'ngIf',
  '*ngFor',
  '*ngIf',
  '{{',
  '}}',
  'true',
  'false',
  'null',
  'undefined',
  ''
]);

// Common UI text patterns that should be translated
const TRANSLATABLE_ATTRIBUTES = ['title', 'placeholder', 'alt', 'aria-label'];

// Map common phrases to standardized keys for consistency
const COMMON_PHRASE_KEYS = {
  'save': 'common.save',
  'cancel': 'common.cancel',
  'delete': 'common.delete',
  'edit': 'common.edit',
  'create': 'common.create',
  'update': 'common.update',
  'submit': 'common.submit',
  'close': 'common.close',
  'back': 'common.back',
  'next': 'common.next',
  'previous': 'common.previous',
  'search': 'common.search',
  'filter': 'common.filter',
  'loading': 'common.loading',
  'loading...': 'common.loading',
  'error': 'common.error',
  'success': 'common.success',
  'yes': 'common.yes',
  'no': 'common.no',
  'confirm': 'common.confirm',
  'actions': 'common.actions',
  'view': 'common.view',
  'view details': 'common.viewDetails',
  'name': 'common.name',
  'description': 'common.description',
  'status': 'common.status',
  'type': 'common.type',
  'date': 'common.date',
  'time': 'common.time',
  'select': 'common.select',
  'select all': 'common.selectAll',
  'clear': 'common.clear',
  'clear all': 'common.clearAll',
  'add': 'common.add',
  'remove': 'common.remove',
  'upload': 'common.upload',
  'download': 'common.download',
  'export': 'common.export',
  'import': 'common.import',
  'refresh': 'common.refresh',
  'settings': 'common.settings',
  'profile': 'common.profile',
  'logout': 'common.logout',
  'login': 'common.login',
  'register': 'common.register',
  'home': 'common.home',
  'dashboard': 'common.dashboard',
  'help': 'common.help',
  'info': 'common.info',
  'warning': 'common.warning'
};

// Hindi translations for common phrases
const HINDI_TRANSLATIONS = {
  'loading': 'लोड हो रहा है...',
  'error': 'त्रुटि',
  'success': 'सफलता',
  'warning': 'चेतावनी',
  'info': 'जानकारी',
  'help': 'मदद',
  'home': 'होम',
  'dashboard': 'डैशबोर्ड',
  'profile': 'प्रोफ़ाइल',
  'settings': 'सेटिंग्स',
  'logout': 'लॉग आउट',
  'login': 'लॉग इन',
  'register': 'रजिस्टर',
  'add': 'जोड़ें',
  'remove': 'हटाएं',
  'upload': 'अपलोड',
  'download': 'डाउनलोड',
  'refresh': 'रीफ्रेश',
  'select': 'चुनें',
  'select all': 'सभी चुनें',
  'clear': 'साफ़ करें',
  'clear all': 'सभी साफ़ करें',
  'date': 'तारीख',
  'time': 'समय',
  'status': 'स्थिति',
  'type': 'प्रकार',
  'description': 'विवरण'
};

// Japanese translations for common phrases
const JAPANESE_TRANSLATIONS = {
  'loading': '読み込み中...',
  'error': 'エラー',
  'success': '成功',
  'warning': '警告',
  'info': '情報',
  'help': 'ヘルプ',
  'home': 'ホーム',
  'dashboard': 'ダッシュボード',
  'profile': 'プロフィール',
  'settings': '設定',
  'logout': 'ログアウト',
  'login': 'ログイン',
  'register': '登録',
  'add': '追加',
  'remove': '削除',
  'upload': 'アップロード',
  'download': 'ダウンロード',
  'refresh': '更新',
  'select': '選択',
  'select all': 'すべて選択',
  'clear': 'クリア',
  'clear all': 'すべてクリア',
  'date': '日付',
  'time': '時間',
  'status': 'ステータス',
  'type': 'タイプ',
  'description': '説明'
};

// Load existing translations
function loadTranslations(lang) {
  const translations = {};
  const langDir = path.join(I18N_PATH, lang);
  
  if (fs.existsSync(langDir)) {
    const files = fs.readdirSync(langDir).filter(f => f.endsWith('.json'));
    files.forEach(file => {
      const domain = path.basename(file, '.json');
      const content = fs.readFileSync(path.join(langDir, file), 'utf8');
      try {
        translations[domain] = JSON.parse(content);
      } catch (e) {
        console.warn(`Failed to parse ${lang}/${file}:`, e.message);
        translations[domain] = {};
      }
    });
  }
  
  return translations;
}

// Save translations
function saveTranslations(lang, translations) {
  const langDir = path.join(I18N_PATH, lang);
  
  if (!fs.existsSync(langDir)) {
    fs.mkdirSync(langDir, { recursive: true });
  }
  
  Object.keys(translations).forEach(domain => {
    if (Object.keys(translations[domain]).length > 0) {
      const filePath = path.join(langDir, `${domain}.json`);
      fs.writeFileSync(filePath, JSON.stringify(translations[domain], null, 2));
    }
  });
}

// Check if text should be translated
function shouldTranslateText(text) {
  // Skip empty strings
  if (!text || !text.trim()) return false;
  
  // Skip if it's just a number
  if (/^\d+(\.\d+)?$/.test(text.trim())) return false;
  
  // Skip URLs
  if (/^https?:\/\//i.test(text)) return false;
  
  // Skip email addresses
  if (/^[\w.-]+@[\w.-]+\.\w+$/.test(text)) return false;
  
  // Skip if it contains Angular interpolation
  if (text.includes('{{') || text.includes('}}')) return false;
  
  // Skip if it's a single special character
  if (/^[^a-zA-Z0-9\s]$/.test(text.trim())) return false;
  
  // Skip technical terms and Angular-specific syntax
  const lowerText = text.toLowerCase().trim();
  const skipTerms = ['ngmodel', 'ngfor', 'ngif', 'formcontrolname', 'formgroup'];
  if (skipTerms.some(term => lowerText === term)) return false;
  
  // Skip Material Icons content - these are icon names that shouldn't be translated
  const materialIcons = ['add', 'edit', 'delete', 'search', 'close', 'done', 'clear', 'refresh',
    'visibility', 'visibility_off', 'person', 'people', 'group', 'home', 'settings',
    'help', 'help_outline', 'info', 'info_outline', 'warning', 'error', 'error_outline',
    'check', 'check_circle', 'cancel', 'remove', 'remove_circle', 'add_circle',
    'keyboard_arrow_down', 'keyboard_arrow_up', 'keyboard_arrow_left', 'keyboard_arrow_right',
    'arrow_back', 'arrow_forward', 'arrow_upward', 'arrow_downward',
    'more_vert', 'more_horiz', 'menu', 'apps', 'dashboard', 'assessment',
    'assignment', 'poll', 'bar_chart', 'pie_chart', 'timeline', 'trending_up',
    'file_download', 'file_upload', 'folder', 'folder_open', 'attachment',
    'cloud_upload', 'cloud_download', 'cloud', 'cloud_done', 'cloud_off',
    'play_arrow', 'pause', 'stop', 'skip_next', 'skip_previous',
    'email', 'phone', 'location_on', 'map', 'my_location',
    'calendar_today', 'date_range', 'access_time', 'schedule', 'event', 'event_available',
    'lock', 'lock_open', 'security', 'verified_user', 'fingerprint',
    'favorite', 'favorite_border', 'star', 'star_border', 'star_half',
    'thumb_up', 'thumb_down', 'comment', 'chat', 'forum', 'question_answer',
    'share', 'send', 'reply', 'forward', 'redo', 'undo',
    'save', 'save_alt', 'get_app', 'publish', 'drafts', 'inbox', 'mail',
    'label', 'label_outline', 'bookmark', 'bookmark_border',
    'print', 'zoom_in', 'zoom_out', 'search', 'filter_list',
    'list', 'view_list', 'view_module', 'view_quilt', 'view_stream',
    'code', 'bug_report', 'build', 'extension', 'explore',
    'language', 'translate', 'record_voice_over', 'speaker_notes',
    'content_copy', 'content_paste', 'content_cut', 'create', 'add_box', 'archive'];
  
  if (materialIcons.includes(text.trim().toLowerCase())) return false;
  
  return true;
}

// Generate translation key from text
function generateTranslationKey(text, componentName, domain) {
  const normalized = text.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .substring(0, 50);
  
  // Check if there's a common key for this phrase
  if (COMMON_PHRASE_KEYS[text.toLowerCase()]) {
    return COMMON_PHRASE_KEYS[text.toLowerCase()];
  }
  
  // Generate a component-specific key
  const prefix = domain || componentName.replace(/-/g, '_');
  return `${prefix}.${normalized}`;
}

// Get translation for text
function getTranslation(text, lang) {
  const lowerText = text.toLowerCase();
  
  if (lang === 'hi') {
    return HINDI_TRANSLATIONS[lowerText] || text;
  } else if (lang === 'ja') {
    return JAPANESE_TRANSLATIONS[lowerText] || text;
  }
  
  return text;
}

// Check if key exists in translations
function keyExists(key, translations) {
  const parts = key.split('.');
  let current = translations;
  
  for (const part of parts) {
    if (!current || !current[part]) {
      return false;
    }
    current = current[part];
  }
  
  return true;
}

// Add key to translations
function addKeyToTranslations(key, value, translations, lang) {
  const parts = key.split('.');
  const domain = parts[0];
  
  if (!translations[domain]) {
    translations[domain] = {};
  }
  
  let current = translations[domain];
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    if (!current[part]) {
      current[part] = {};
    }
    current = current[part];
  }
  
  const lastPart = parts[parts.length - 1];
  if (!current[lastPart]) {
    current[lastPart] = getTranslation(value, lang);
    return true;
  }
  
  return false;
}

// Process HTML file
function processHtmlFile(filePath) {
  console.log(`\nProcessing: ${path.relative(process.cwd(), filePath)}`);
  
  const content = fs.readFileSync(filePath, 'utf8');
  const $ = cheerio.load(content, {
    decodeEntities: false,
    xmlMode: false
  });
  
  const componentName = path.basename(path.dirname(filePath));
  const domain = componentName.replace(/-section$|-management$|-editor$|-gallery$|-popup$|-response$/, '');
  
  const translations = {};
  LANGUAGES.forEach(lang => {
    translations[lang] = loadTranslations(lang);
  });
  
  let modified = false;
  const extractedPhrases = [];
  
  // Process text nodes
  $('*').each((i, elem) => {
    const $elem = $(elem);
    
    // Skip script and style tags
    if (elem.name === 'script' || elem.name === 'style') return;
    
    // Skip elements that already have translate pipe
    const html = $elem.html();
    if (html && html.includes('| translate')) return;
    
    // Skip material-icons elements entirely
    if ($(elem).hasClass('material-icons') || $(elem).hasClass('material-symbols-outlined')) {
      return;
    }
    
    // Process direct text content
    const children = $elem.contents();
    children.each((j, child) => {
      if (child.type === 'text') {
        const text = $(child).text().trim();
        
        if (shouldTranslateText(text)) {
          const key = generateTranslationKey(text, componentName, domain);
          
          // Check if key already exists
          let keyExistsInAll = true;
          LANGUAGES.forEach(lang => {
            if (!keyExists(key, translations[lang])) {
              keyExistsInAll = false;
            }
          });
          
          if (!keyExistsInAll) {
            // Add to translations
            LANGUAGES.forEach(lang => {
              addKeyToTranslations(key, text, translations[lang], lang);
            });
            extractedPhrases.push({ text, key });
          }
          
          // Replace in HTML
          $(child).replaceWith(`{{ '${key}' | translate }}`);
          modified = true;
        }
      }
    });
    
    // Process attributes
    const attributesToTranslate = ['title', 'placeholder', 'alt', 'aria-label'];
    attributesToTranslate.forEach(attr => {
      const value = $elem.attr(attr);
      if (value && shouldTranslateText(value) && !value.includes('|')) {
        const key = generateTranslationKey(value, componentName, domain);
        
        // Check if key already exists
        let keyExistsInAll = true;
        LANGUAGES.forEach(lang => {
          if (!keyExists(key, translations[lang])) {
            keyExistsInAll = false;
          }
        });
        
        if (!keyExistsInAll) {
          // Add to translations
          LANGUAGES.forEach(lang => {
            addKeyToTranslations(key, value, translations[lang], lang);
          });
          extractedPhrases.push({ text: value, key, attribute: attr });
        }
        
        // Replace in HTML
        $elem.attr(attr, `{{ '${key}' | translate }}`);
        modified = true;
      }
    });
    
    // Preserve Angular directive casing in attributes
    const angularAttrs = ['*ngIf', '*ngFor', '[(ngModel)]', '[ngModel]', '(ngModelChange)', '[ngClass]', '[ngStyle]'];
    angularAttrs.forEach(attr => {
      // Check if attribute exists with wrong casing
      const wrongCasing = attr.toLowerCase();
      if ($elem.attr(wrongCasing) !== undefined && wrongCasing !== attr) {
        const value = $elem.attr(wrongCasing);
        $elem.removeAttr(wrongCasing);
        $elem.attr(attr, value);
        modified = true;
      }
    });
  });
  
  if (modified) {
    // Save updated HTML
    const updatedHtml = $.html();
    fs.writeFileSync(filePath, updatedHtml);
    
    // Save translations
    LANGUAGES.forEach(lang => {
      saveTranslations(lang, translations[lang]);
    });
    
    console.log(`  ✓ Extracted ${extractedPhrases.length} phrases`);
    extractedPhrases.forEach(({ text, key, attribute }) => {
      if (attribute) {
        console.log(`    - [${attribute}] "${text}" → ${key}`);
      } else {
        console.log(`    - "${text}" → ${key}`);
      }
    });
  } else {
    console.log('  ✓ No new phrases to extract');
  }
  
  return extractedPhrases.length;
}

// Main function
function main() {
  console.log('Auto-Translation Tool');
  console.log('=====================\n');
  
  // Check if cheerio is installed
  try {
    require.resolve('cheerio');
    require.resolve('glob');
  } catch (e) {
    console.error('Required dependencies not found. Installing...');
    const { execSync } = require('child_process');
    execSync('npm install cheerio glob', { stdio: 'inherit' });
  }
  
  // Find all HTML files in components
  const pattern = path.join(COMPONENT_PATH, '**', '*.html').replace(/\\/g, '/');
  const files = glob.sync(pattern);
  
  console.log(`Found ${files.length} HTML files to process\n`);
  
  let totalPhrases = 0;
  let processedFiles = 0;
  
  files.forEach(file => {
    const phrases = processHtmlFile(file);
    if (phrases > 0) {
      totalPhrases += phrases;
      processedFiles++;
    }
  });
  
  console.log('\n' + '='.repeat(50));
  console.log(`Summary:`);
  console.log(`  - Processed ${files.length} files`);
  console.log(`  - Modified ${processedFiles} files`);
  console.log(`  - Extracted ${totalPhrases} new phrases`);
  console.log(`  - Updated translations for ${LANGUAGES.join(', ')}`);
  
  if (processedFiles > 0) {
    console.log('\n✅ Don\'t forget to:');
    console.log('  1. Review the generated translations');
    console.log('  2. Import TranslatePipe in affected components');
    console.log('  3. Run npm run i18n:verify to check for issues');
  }
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { processHtmlFile, shouldTranslate, generateTranslationKey };
