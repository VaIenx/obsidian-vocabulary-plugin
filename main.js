/*
  Vokabel-Quiz ES↔DE – Obsidian Plugin v2.0.0
  Pre-built bundle – keine Build-Tools erforderlich.
*/
'use strict';

var obsidian = require('obsidian');

// ─── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  vocabFilePath: '',
  delimiter: '|',
};

// ─── Parser ────────────────────────────────────────────────────────────────

function parseVocabFile(content, delimiter) {
  const entries = [];
  const lines = content.split('\n');
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) continue;
    if (/^[\|\s\-:]+$/.test(line)) continue;
    let parts;
    if (line.startsWith('|') && line.endsWith('|')) {
      parts = line.slice(1, -1).split('|').map(p => p.trim());
    } else {
      parts = line.split(delimiter).map(p => p.trim());
    }
    if (parts.length >= 2 && parts[0] && parts[1]) {
      entries.push({ spanish: parts[0], german: parts[1] });
    }
  }
  return entries;
}

// ─── Folder Browser Modal ──────────────────────────────────────────────────
// Step-by-step vault navigator: shows folders + .md files, one level at a time.

class FolderBrowserModal extends obsidian.Modal {
  constructor(app, startPath, onSelect) {
    super(app);
    this.currentPath = startPath || '';
    this.onSelect = onSelect;
  }

  onOpen() {
    this.modalEl.addClass('vq-browser-modal');
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  getChildren(folderPath) {
    const folder = folderPath === ''
      ? this.app.vault.getRoot()
      : this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder || !folder.children) return { folders: [], files: [] };
    const folders = [], files = [];
    for (const child of folder.children) {
      if (child.children !== undefined) {
        folders.push(child);
      } else if (child.extension === 'md') {
        files.push(child);
      }
    }
    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return { folders, files };
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();

    // Header
    const header = contentEl.createDiv('vq-browser-header');
    header.createDiv('vq-browser-title').setText('📂 Vokabeldatei auswählen');

    // Breadcrumb
    const bc = contentEl.createDiv('vq-browser-breadcrumb');
    const rootCrumb = bc.createSpan({ cls: 'vq-crumb vq-crumb-link', text: '⌂ Vault' });
    rootCrumb.onclick = () => { this.currentPath = ''; this.render(); };

    if (this.currentPath) {
      const parts = this.currentPath.split('/');
      for (let i = 0; i < parts.length; i++) {
        bc.createSpan({ cls: 'vq-crumb-sep', text: ' › ' });
        const crumbPath = parts.slice(0, i + 1).join('/');
        const isLast = i === parts.length - 1;
        const crumb = bc.createSpan({
          cls: isLast ? 'vq-crumb vq-crumb-current' : 'vq-crumb vq-crumb-link',
          text: parts[i],
        });
        if (!isLast) crumb.onclick = () => { this.currentPath = crumbPath; this.render(); };
      }
    }

    // List
    const list = contentEl.createDiv('vq-browser-list');
    const { folders, files } = this.getChildren(this.currentPath);

    // Back button
    if (this.currentPath !== '') {
      const back = list.createDiv('vq-browser-row vq-browser-row-back');
      back.createSpan({ cls: 'vq-browser-icon', text: '↩' });
      back.createSpan({ cls: 'vq-browser-name', text: '.. zurück' });
      back.onclick = () => {
        this.currentPath = this.currentPath.split('/').slice(0, -1).join('/');
        this.render();
      };
    }

    if (folders.length === 0 && files.length === 0) {
      list.createDiv({ cls: 'vq-browser-empty', text: 'Keine Ordner oder .md-Dateien hier.' });
    }

    for (const folder of folders) {
      const row = list.createDiv('vq-browser-row vq-browser-row-folder');
      row.createSpan({ cls: 'vq-browser-icon', text: '📁' });
      row.createSpan({ cls: 'vq-browser-name', text: folder.name });
      row.createSpan({ cls: 'vq-browser-chevron', text: '›' });
      row.onclick = () => { this.currentPath = folder.path; this.render(); };
    }

    for (const file of files) {
      const row = list.createDiv('vq-browser-row vq-browser-row-file');
      row.createSpan({ cls: 'vq-browser-icon', text: '📄' });
      row.createSpan({ cls: 'vq-browser-name', text: file.name });
      row.onclick = () => { this.onSelect(file.path); this.close(); };
    }

    // Footer
    const footer = contentEl.createDiv('vq-browser-footer');
    footer.createEl('button', { cls: 'vq-btn vq-btn-cancel', text: 'Abbrechen' })
      .onclick = () => this.close();
  }
}

// ─── Launch Modal ──────────────────────────────────────────────────────────
// Opens when ribbon is clicked. Lets user pick file + direction, then starts quiz.

class LaunchModal extends obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.selectedDirection = 'random';
  }

  onOpen() {
    this.modalEl.addClass('vq-launch-modal');
    this.render();
  }

  onClose() {
    this.contentEl.empty();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();

    // Header
    const header = contentEl.createDiv('vq-launch-header');
    header.createDiv('vq-launch-logo').setText('🇪🇸 ↔ 🇩🇪');
    header.createDiv('vq-launch-title').setText('Vokabel-Quiz');
    header.createDiv('vq-launch-sub').setText('Einstellungen für diese Runde');

    const body = contentEl.createDiv('vq-launch-body');
    const filePath = this.plugin.settings.vocabFilePath;

    // ── Datei-Sektion ──
    const fileSection = body.createDiv('vq-launch-section');
    fileSection.createDiv({ cls: 'vq-launch-label', text: 'Vokabeldatei' });

    const picker = fileSection.createDiv('vq-launch-file-picker');
    const display = picker.createDiv('vq-launch-file-display');

    if (filePath) {
      const nameEl = display.createDiv('vq-launch-file-name-wrap');
      nameEl.createSpan({ cls: 'vq-launch-file-icon', text: '📄' });
      const info = nameEl.createDiv('vq-launch-file-info');
      info.createDiv({ cls: 'vq-launch-file-name', text: filePath.split('/').pop() });
      info.createDiv({ cls: 'vq-launch-file-path', text: filePath });
    } else {
      display.createSpan({ cls: 'vq-launch-file-none', text: '⚠️ Keine Datei gewählt' });
    }

    const changeBtn = picker.createEl('button', { cls: 'vq-btn vq-btn-outline', text: '📂 Wählen' });
    changeBtn.onclick = () => {
      const startFolder = filePath ? filePath.split('/').slice(0, -1).join('/') : '';
      new FolderBrowserModal(this.app, startFolder, async (path) => {
        this.plugin.settings.vocabFilePath = path;
        await this.plugin.saveSettings();
        this.render();
      }).open();
    };

    // ── Richtungs-Sektion ──
    const dirSection = body.createDiv('vq-launch-section');
    dirSection.createDiv({ cls: 'vq-launch-label', text: 'Abfragerichtung' });

    const dirOptions = dirSection.createDiv('vq-launch-dir-options');
    const directions = [
      { value: 'random',  icon: '🎲', label: 'Zufall',             sub: 'Gemischt' },
      { value: 'spanish', icon: '🇪🇸', label: 'ES → DE',           sub: 'Du siehst Spanisch' },
      { value: 'german',  icon: '🇩🇪', label: 'DE → ES',           sub: 'Du siehst Deutsch' },
    ];

    for (const opt of directions) {
      const card = dirOptions.createDiv({
        cls: `vq-dir-card ${this.selectedDirection === opt.value ? 'vq-dir-card-active' : ''}`,
      });
      card.createDiv({ cls: 'vq-dir-card-icon', text: opt.icon });
      card.createDiv({ cls: 'vq-dir-card-label', text: opt.label });
      card.createDiv({ cls: 'vq-dir-card-sub',   text: opt.sub });
      card.onclick = () => { this.selectedDirection = opt.value; this.render(); };
    }

    // ── Footer / Start ──
    const footer = contentEl.createDiv('vq-launch-footer');
    const startBtn = footer.createEl('button', {
      cls: 'vq-btn vq-btn-primary vq-btn-start' + (!filePath ? ' vq-btn-disabled' : ''),
      text: '▶  Quiz starten',
    });
    startBtn.disabled = !filePath;
    startBtn.onclick = async () => {
      if (!filePath) return;
      this.close();
      await this.plugin.startQuiz(this.selectedDirection);
    };

    if (!filePath) {
      footer.createDiv({ cls: 'vq-launch-hint', text: 'Bitte zuerst eine Vokabeldatei auswählen.' });
    }

    footer.createEl('button', { cls: 'vq-btn vq-btn-cancel', text: 'Abbrechen' })
      .onclick = () => this.close();
  }
}

// ─── Quiz Modal ────────────────────────────────────────────────────────────

class QuizModal extends obsidian.Modal {
  constructor(app, vocab, direction) {
    super(app);
    this.vocab = vocab;
    this.direction = direction;
    this.queue = this.shuffle([...vocab]);
    this.current = null;
    this.showAnswer = false;
    this.correct = 0;
    this.incorrect = 0;
    this.skipped = 0;
    this.startTime = Date.now();
    this.currentDirection = 'spanish';
  }

  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }

  onOpen() {
    this.modalEl.addClass('vocab-quiz-modal');
    this.nextCard();
  }

  onClose() {
    this.contentEl.empty();
  }

  nextCard() {
    this.showAnswer = false;
    if (this.queue.length === 0) { this.renderFinished(); return; }
    this.current = this.queue.shift();
    this.currentDirection = this.direction === 'random'
      ? (Math.random() < 0.5 ? 'spanish' : 'german')
      : this.direction;
    this.render();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();

    const total = this.vocab.length;
    const done = this.correct + this.incorrect + this.skipped;

    // Header
    const header = contentEl.createDiv('vq-header');
    header.createDiv('vq-logo').setText('🇪🇸 ↔ 🇩🇪');
    const stats = header.createDiv('vq-stats');
    stats.createSpan({ cls: 'vq-stat vq-correct',   text: `✓ ${this.correct}` });
    stats.createSpan({ cls: 'vq-stat vq-incorrect', text: `✗ ${this.incorrect}` });
    stats.createSpan({ cls: 'vq-stat vq-skipped',   text: `– ${this.skipped}` });
    stats.createSpan({ cls: 'vq-stat vq-remaining', text: `${this.queue.length + 1} übrig` });

    const fill = contentEl.createDiv('vq-progress-track').createDiv('vq-progress-fill');
    fill.style.width = `${total > 0 ? Math.round(done / total * 100) : 0}%`;

    // Card
    const card = contentEl.createDiv('vq-card');
    card.createDiv('vq-dir-label').setText(
      this.currentDirection === 'spanish' ? 'Spanisch → Deutsch' : 'Deutsch → Spanisch'
    );
    card.createDiv('vq-question').setText(
      this.currentDirection === 'spanish' ? this.current.spanish : this.current.german
    );

    if (this.showAnswer) {
      const aw = card.createDiv('vq-answer-wrap');
      aw.createDiv('vq-answer-divider');
      aw.createDiv('vq-answer').setText(
        this.currentDirection === 'spanish' ? this.current.german : this.current.spanish
      );
    } else {
      card.createDiv('vq-placeholder').setText('Antwort anzeigen ↓');
    }

    // Buttons
    const buttons = contentEl.createDiv('vq-buttons');
    if (!this.showAnswer) {
      buttons.createEl('button', { cls: 'vq-btn vq-btn-primary', text: 'Antwort anzeigen' })
        .onclick = () => { this.showAnswer = true; this.render(); };
      buttons.createEl('button', { cls: 'vq-btn vq-btn-skip', text: 'Überspringen' })
        .onclick = () => { this.skipped++; this.nextCard(); };
    } else {
      buttons.createEl('button', { cls: 'vq-btn vq-btn-correct', text: '✓ Gewusst' })
        .onclick = () => { this.correct++; this.nextCard(); };
      buttons.createEl('button', { cls: 'vq-btn vq-btn-incorrect', text: '✗ Nicht gewusst' })
        .onclick = () => {
          this.incorrect++;
          const pos = Math.floor(Math.random() * (this.queue.length + 1));
          this.queue.splice(pos, 0, this.current);
          this.nextCard();
        };
    }
    buttons.createEl('button', { cls: 'vq-btn vq-btn-cancel', text: 'Beenden' })
      .onclick = () => this.close();
  }

  renderFinished() {
    const { contentEl } = this;
    contentEl.empty();
    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const timeStr = elapsed >= 60 ? `${Math.floor(elapsed/60)}m ${elapsed%60}s` : `${elapsed}s`;
    const total = this.correct + this.incorrect;
    const pct = total > 0 ? Math.round(this.correct / total * 100) : 0;

    const card = contentEl.createDiv('vq-finish-card');
    card.createDiv('vq-finish-icon').setText('🎉');
    card.createDiv('vq-finish-title').setText('Quiz abgeschlossen!');
    const summary = card.createDiv('vq-finish-summary');
    for (const [label, val] of [
      ['Richtig', `${this.correct}`], ['Falsch', `${this.incorrect}`],
      ['Übersprungen', `${this.skipped}`], ['Trefferquote', `${pct}%`], ['Zeit', timeStr],
    ]) {
      const row = summary.createDiv('vq-finish-row');
      row.createSpan({ cls: 'vq-finish-label', text: label });
      row.createSpan({ cls: 'vq-finish-value', text: val });
    }
    const barFill = card.createDiv('vq-score-bar-track').createDiv('vq-score-bar-fill');
    barFill.style.width = `${pct}%`;
    barFill.style.background = pct >= 80 ? '#4ade80' : pct >= 50 ? '#facc15' : '#f87171';

    const btns = card.createDiv('vq-finish-buttons');
    btns.createEl('button', { cls: 'vq-btn vq-btn-primary', text: 'Nochmal' }).onclick = () => {
      this.correct = 0; this.incorrect = 0; this.skipped = 0;
      this.startTime = Date.now();
      this.queue = this.shuffle([...this.vocab]);
      this.nextCard();
    };
    btns.createEl('button', { cls: 'vq-btn vq-btn-cancel', text: 'Schließen' })
      .onclick = () => this.close();
  }
}

// ─── Settings Tab ──────────────────────────────────────────────────────────

class VocabQuizSettingTab extends obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display() {
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl('h2', { text: 'Vokabel-Quiz Einstellungen' });

    // ── File picker ──
    containerEl.createEl('h3', { text: 'Vokabeldatei' });
    const wrap = containerEl.createDiv('vq-settings-file-wrap');
    const currentPath = this.plugin.settings.vocabFilePath;
    const display = wrap.createDiv('vq-settings-file-display');

    if (currentPath) {
      display.createSpan({ cls: 'vq-settings-file-icon', text: '📄' });
      const info = display.createDiv('vq-settings-file-info');
      info.createDiv({ cls: 'vq-settings-file-name', text: currentPath.split('/').pop() });
      info.createDiv({ cls: 'vq-settings-file-full', text: currentPath });
    } else {
      display.createSpan({ cls: 'vq-settings-file-icon', text: '📂' });
      display.createDiv({ cls: 'vq-settings-file-none', text: 'Keine Datei ausgewählt' });
    }

    wrap.createEl('button', { cls: 'vq-btn vq-btn-outline', text: '📂 Durchsuchen' })
      .onclick = () => {
        const startFolder = currentPath ? currentPath.split('/').slice(0, -1).join('/') : '';
        new FolderBrowserModal(this.app, startFolder, async (path) => {
          this.plugin.settings.vocabFilePath = path;
          await this.plugin.saveSettings();
          this.display();
        }).open();
      };

    // ── Delimiter ──
    new obsidian.Setting(containerEl)
      .setName('Trennzeichen')
      .setDesc('Für einfache Textdateien (Standard: | für Markdown). Alternativ ";" oder ",".')
      .addText(text => text
        .setPlaceholder('|')
        .setValue(this.plugin.settings.delimiter)
        .onChange(async value => {
          this.plugin.settings.delimiter = value || '|';
          await this.plugin.saveSettings();
        }));

    // ── Example file ──
    new obsidian.Setting(containerEl)
      .setName('Beispieldatei erstellen')
      .setDesc('Erstellt eine Demo-Datei mit 30 Spanisch-Deutsch-Vokabeln. Wähle vorher den Speicherort über "Durchsuchen".')
      .addButton(btn => btn.setButtonText('Erstellen').onClick(async () => {
        await this.plugin.createExampleFile();
        this.display();
      }));

    // ── Help ──
    containerEl.createEl('h3', { text: 'Dateiformat' });
    const help = containerEl.createDiv('vq-settings-help');
    help.createEl('p', { text: 'Das Plugin unterstützt zwei Formate:' });
    help.createEl('strong', { text: '1. Markdown-Tabelle (empfohlen):' });
    help.createEl('pre').createEl('code', {
      text: '| Spanisch | Deutsch |\n|----------|---------|\n| hola     | Hallo   |\n| gracias  | Danke   |',
    });
    help.createEl('strong', { text: '2. Textdatei mit Trennzeichen:' });
    help.createEl('pre').createEl('code', { text: 'hola | Hallo\ngracias | Danke\ncasa | Haus' });
    help.createEl('p', { text: '💡 Zeilen mit # oder // werden als Kommentare ignoriert.' });
    help.createEl('p', { text: '💡 Die Abfragerichtung wählst du beim Starten des Quiz (Ribbon-Klick).' });
  }
}

// ─── Styles ────────────────────────────────────────────────────────────────

const QUIZ_STYLES = `
/* ══ Quiz Modal ══════════════════════════════════════════ */
.vocab-quiz-modal {
  width:560px !important; max-width:95vw !important;
  border-radius:16px !important; overflow:hidden;
  font-family:'Georgia','Times New Roman',serif;
}
.vocab-quiz-modal .modal-content { padding:0 !important; background:var(--background-primary); }
.vq-header {
  display:flex; align-items:center; justify-content:space-between;
  padding:16px 20px 12px; border-bottom:1px solid var(--background-modifier-border);
  background:var(--background-secondary);
}
.vq-logo  { font-size:20px; letter-spacing:4px; }
.vq-stats { display:flex; gap:12px; font-size:13px; font-family:monospace; }
.vq-stat  { padding:2px 8px; border-radius:20px; font-weight:600; }
.vq-correct   { background:#dcfce7; color:#16a34a; }
.vq-incorrect { background:#fee2e2; color:#dc2626; }
.vq-skipped   { background:#f3f4f6; color:#6b7280; }
.vq-remaining { background:#dbeafe; color:#2563eb; }
.theme-dark .vq-correct   { background:#14532d; color:#86efac; }
.theme-dark .vq-incorrect { background:#7f1d1d; color:#fca5a5; }
.theme-dark .vq-skipped   { background:#374151; color:#9ca3af; }
.theme-dark .vq-remaining { background:#1e3a5f; color:#93c5fd; }
.vq-progress-track { height:4px; background:var(--background-modifier-border); }
.vq-progress-fill  { height:100%; background:linear-gradient(90deg,#f59e0b,#ef4444); transition:width .4s ease; }
.vq-card {
  margin:28px 28px 16px; padding:32px; border-radius:14px;
  border:2px solid var(--background-modifier-border);
  background:var(--background-secondary); min-height:180px;
  display:flex; flex-direction:column; align-items:center; gap:16px; text-align:center;
  box-shadow:0 4px 24px rgba(0,0,0,.08);
}
.vq-dir-label    { font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:var(--text-muted); font-family:monospace; }
.vq-question     { font-size:36px; font-weight:700; line-height:1.2; color:var(--text-normal); font-style:italic; }
.vq-answer-wrap  { width:100%; display:flex; flex-direction:column; align-items:center; gap:12px; }
.vq-answer-divider { width:60px; height:2px; background:linear-gradient(90deg,#f59e0b,#ef4444); border-radius:2px; }
.vq-answer       { font-size:28px; font-weight:600; color:#f59e0b; animation:vq-reveal .3s ease; }
@keyframes vq-reveal { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
.vq-placeholder  { font-size:14px; color:var(--text-muted); font-style:italic; }
.vq-buttons      { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; padding:0 28px 28px; }

/* ══ Shared Buttons ══════════════════════════════════════ */
.vq-btn { padding:10px 22px; border-radius:8px; border:none; font-size:14px; font-weight:600; cursor:pointer; transition:all .15s ease; }
.vq-btn:hover  { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,.15); }
.vq-btn:active { transform:translateY(0); }
.vq-btn-primary   { background:linear-gradient(135deg,#f59e0b,#ef4444); color:white; }
.vq-btn-correct   { background:#16a34a; color:white; }
.vq-btn-incorrect { background:#dc2626; color:white; }
.vq-btn-skip      { background:var(--background-modifier-border); color:var(--text-muted); }
.vq-btn-cancel    { background:transparent; color:var(--text-muted); border:1px solid var(--background-modifier-border); }
.vq-btn-outline   { background:transparent; color:var(--text-normal); border:1px solid var(--background-modifier-border); padding:8px 14px; font-size:13px; white-space:nowrap; }
.vq-btn-disabled  { opacity:.4; cursor:not-allowed; }
.vq-btn-start     { width:100%; padding:13px; font-size:16px; }

/* ══ Finish Card ════════════════════════════════════════ */
.vq-finish-card    { display:flex; flex-direction:column; align-items:center; gap:20px; padding:32px 28px; }
.vq-finish-icon    { font-size:48px; }
.vq-finish-title   { font-size:24px; font-weight:700; color:var(--text-normal); }
.vq-finish-summary { width:100%; border-radius:10px; border:1px solid var(--background-modifier-border); overflow:hidden; }
.vq-finish-row     { display:flex; justify-content:space-between; padding:8px 16px; font-size:14px; }
.vq-finish-row:nth-child(odd) { background:var(--background-secondary); }
.vq-finish-label   { color:var(--text-muted); }
.vq-finish-value   { font-weight:700; color:var(--text-normal); }
.vq-score-bar-track { width:100%; height:8px; background:var(--background-modifier-border); border-radius:4px; overflow:hidden; }
.vq-score-bar-fill  { height:100%; border-radius:4px; transition:width .8s ease; }
.vq-finish-buttons  { display:flex; gap:12px; width:100%; }
.vq-finish-buttons .vq-btn { flex:1; }

/* ══ Launch Modal ═══════════════════════════════════════ */
.vq-launch-modal { width:480px !important; max-width:95vw !important; border-radius:16px !important; overflow:hidden; }
.vq-launch-modal .modal-content { padding:0 !important; background:var(--background-primary); }
.vq-launch-header {
  display:flex; flex-direction:column; align-items:center; gap:4px;
  padding:28px 24px 20px; background:var(--background-secondary);
  border-bottom:1px solid var(--background-modifier-border);
}
.vq-launch-logo  { font-size:28px; letter-spacing:6px; }
.vq-launch-title { font-size:20px; font-weight:700; color:var(--text-normal); }
.vq-launch-sub   { font-size:11px; color:var(--text-muted); text-transform:uppercase; letter-spacing:1px; }
.vq-launch-body  { padding:20px 24px; display:flex; flex-direction:column; gap:20px; }
.vq-launch-section { display:flex; flex-direction:column; gap:10px; }
.vq-launch-label { font-size:10px; text-transform:uppercase; letter-spacing:2px; color:var(--text-muted); font-weight:700; }

.vq-launch-file-picker {
  display:flex; align-items:center; gap:10px; padding:12px 14px;
  border-radius:10px; border:1px solid var(--background-modifier-border);
  background:var(--background-secondary);
}
.vq-launch-file-display { flex:1; min-width:0; }
.vq-launch-file-name-wrap { display:flex; align-items:center; gap:10px; }
.vq-launch-file-icon { font-size:20px; flex-shrink:0; }
.vq-launch-file-info { flex:1; min-width:0; }
.vq-launch-file-name { font-size:14px; font-weight:600; color:var(--text-normal); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.vq-launch-file-path { font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.vq-launch-file-none { font-size:13px; color:var(--text-muted); font-style:italic; }

.vq-launch-dir-options { display:flex; gap:8px; }
.vq-dir-card {
  flex:1; display:flex; flex-direction:column; align-items:center; gap:4px; padding:14px 8px;
  border-radius:10px; cursor:pointer;
  border:2px solid var(--background-modifier-border);
  background:var(--background-secondary);
  transition:all .15s ease; text-align:center;
}
.vq-dir-card:hover     { border-color:#f59e0b; transform:translateY(-1px); }
.vq-dir-card-active    { border-color:#f59e0b !important; background:var(--background-primary) !important; box-shadow:0 0 0 3px rgba(245,158,11,.15); }
.vq-dir-card-icon      { font-size:22px; }
.vq-dir-card-label     { font-size:12px; font-weight:700; color:var(--text-normal); }
.vq-dir-card-sub       { font-size:10px; color:var(--text-muted); }

.vq-launch-footer { padding:0 24px 24px; display:flex; flex-direction:column; gap:10px; }
.vq-launch-hint   { font-size:12px; color:var(--text-muted); text-align:center; font-style:italic; }

/* ══ Folder Browser Modal ═══════════════════════════════ */
.vq-browser-modal { width:420px !important; max-width:95vw !important; border-radius:16px !important; overflow:hidden; }
.vq-browser-modal .modal-content { padding:0 !important; background:var(--background-primary); }
.vq-browser-header {
  padding:14px 18px 10px; border-bottom:1px solid var(--background-modifier-border);
  background:var(--background-secondary);
}
.vq-browser-title { font-size:15px; font-weight:700; color:var(--text-normal); margin-bottom:6px; }
.vq-browser-breadcrumb { font-size:12px; display:flex; align-items:center; flex-wrap:wrap; gap:1px; }
.vq-crumb-link    { cursor:pointer; color:var(--text-accent); }
.vq-crumb-link:hover { text-decoration:underline; }
.vq-crumb-current { color:var(--text-normal); font-weight:600; }
.vq-crumb-sep     { color:var(--text-faint); }
.vq-browser-list  { max-height:340px; overflow-y:auto; padding:4px 0; }
.vq-browser-row   { display:flex; align-items:center; gap:10px; padding:9px 18px; cursor:pointer; transition:background .1s; }
.vq-browser-row:hover    { background:var(--background-modifier-hover); }
.vq-browser-row-back     { color:var(--text-muted); font-size:13px; border-bottom:1px solid var(--background-modifier-border); }
.vq-browser-icon         { font-size:16px; flex-shrink:0; width:20px; text-align:center; }
.vq-browser-name         { flex:1; font-size:13px; color:var(--text-normal); }
.vq-browser-row-file .vq-browser-name { color:var(--text-accent); font-weight:500; }
.vq-browser-chevron      { color:var(--text-faint); font-size:16px; }
.vq-browser-empty        { padding:24px 18px; color:var(--text-muted); font-style:italic; font-size:13px; text-align:center; }
.vq-browser-footer       { padding:10px 18px; border-top:1px solid var(--background-modifier-border); display:flex; justify-content:flex-end; }

/* ══ Settings Page ══════════════════════════════════════ */
.vq-settings-file-wrap {
  display:flex; align-items:center; gap:12px; padding:14px;
  border:1px solid var(--background-modifier-border); border-radius:10px;
  background:var(--background-secondary); margin-bottom:16px;
}
.vq-settings-file-display { flex:1; display:flex; align-items:center; gap:12px; min-width:0; }
.vq-settings-file-icon    { font-size:24px; flex-shrink:0; }
.vq-settings-file-info    { flex:1; min-width:0; }
.vq-settings-file-name    { font-size:14px; font-weight:600; color:var(--text-normal); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.vq-settings-file-full    { font-size:11px; color:var(--text-muted); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.vq-settings-file-none    { font-size:13px; color:var(--text-muted); font-style:italic; }
.vq-settings-help         { background:var(--background-secondary); border-radius:8px; padding:16px; margin-top:8px; font-size:13px; color:var(--text-muted); }
.vq-settings-help pre     { background:var(--background-primary); border-radius:6px; padding:10px; margin:8px 0 14px; overflow-x:auto; }
.vq-settings-help code    { font-size:12px; font-family:monospace; color:var(--text-normal); }
`;

// ─── Main Plugin ───────────────────────────────────────────────────────────

class VocabQuizPlugin extends obsidian.Plugin {
  async onload() {
    await this.loadSettings();

    // Ribbon opens the Launch Modal (file + direction picker)
    this.addRibbonIcon('languages', 'Vokabel-Quiz starten', () => {
      new LaunchModal(this.app, this).open();
    });

    // Command also opens Launch Modal
    this.addCommand({
      id: 'start-vocab-quiz',
      name: 'Vokabel-Quiz starten',
      callback: () => { new LaunchModal(this.app, this).open(); },
    });

    this.addSettingTab(new VocabQuizSettingTab(this.app, this));
    this.injectStyles();
  }

  async startQuiz(direction) {
    const path = this.settings.vocabFilePath;
    const file = this.app.vault.getAbstractFileByPath(path);

    if (!file || !(file instanceof obsidian.TFile)) {
      new obsidian.Notice(`❌ Vokabeldatei nicht gefunden: "${path}"`);
      return;
    }

    const content = await this.app.vault.read(file);
    const vocab = parseVocabFile(content, this.settings.delimiter);

    if (vocab.length === 0) {
      new obsidian.Notice(`⚠️ Keine Vokabeln in "${path}" gefunden. Bitte Format prüfen.`);
      return;
    }

    new QuizModal(this.app, vocab, direction).open();
  }

  async createExampleFile() {
    const path = this.settings.vocabFilePath || 'vokabeln.md';
    const content = `# Spanisch-Deutsch Vokabeln\n\n| Spanisch | Deutsch |\n|----------|---------|\n| hola | Hallo |\n| adiós | Auf Wiedersehen |\n| buenos días | Guten Morgen |\n| gracias | Danke |\n| de nada | Bitte / Gern geschehen |\n| por favor | Bitte |\n| perdón | Entschuldigung |\n| sí | Ja |\n| no | Nein |\n| casa | Haus |\n| libro | Buch |\n| agua | Wasser |\n| comida | Essen |\n| amigo | Freund |\n| trabajo | Arbeit |\n| tiempo | Zeit / Wetter |\n| ciudad | Stadt |\n| dinero | Geld |\n| hablar | sprechen |\n| comer | essen |\n| vivir | leben |\n| querer | wollen / lieben |\n| poder | können |\n| ir | gehen |\n| venir | kommen |\n| hacer | machen / tun |\n| tener | haben |\n| ser | sein (dauerhaft) |\n| estar | sein (vorübergehend) |\n| grande | groß |\n| pequeño | klein |\n`;
    try {
      if (this.app.vault.getAbstractFileByPath(path)) {
        new obsidian.Notice(`⚠️ Datei existiert bereits: "${path}"`);
        return;
      }
      const dir = path.split('/').slice(0, -1).join('/');
      if (dir) { try { await this.app.vault.createFolder(dir); } catch {} }
      await this.app.vault.create(path, content);
      if (!this.settings.vocabFilePath) {
        this.settings.vocabFilePath = path;
        await this.saveSettings();
      }
      new obsidian.Notice(`✅ Beispieldatei erstellt: "${path}"`);
    } catch (e) {
      new obsidian.Notice(`❌ Fehler: ${e}`);
    }
  }

  injectStyles() {
    const el = document.createElement('style');
    el.id = 'vocab-quiz-styles';
    el.textContent = QUIZ_STYLES;
    document.head.appendChild(el);
  }

  onunload() {
    document.getElementById('vocab-quiz-styles')?.remove();
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }
}

module.exports = VocabQuizPlugin;
