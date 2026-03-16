/*
  Vokabel-Quiz ES↔DE – Obsidian Plugin
  Version 1.0.0
  Pre-built bundle – keine Build-Tools erforderlich.
*/
'use strict';

var obsidian = require('obsidian');

// ─── Defaults ──────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS = {
  vocabFilePath: 'vokabeln.md',
  quizDirection: 'random',
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
    if (this.queue.length === 0) {
      this.renderFinished();
      return;
    }
    this.current = this.queue.shift();
    this.currentDirection =
      this.direction === 'random'
        ? Math.random() < 0.5 ? 'spanish' : 'german'
        : this.direction;
    this.render();
  }

  render() {
    const { contentEl } = this;
    contentEl.empty();

    const total = this.vocab.length;
    const done = this.correct + this.incorrect + this.skipped;
    const progress = total > 0 ? done / total : 0;

    // Header
    const header = contentEl.createDiv('vq-header');
    header.createDiv('vq-logo').setText('🇪🇸 ↔ 🇩🇪');
    const stats = header.createDiv('vq-stats');
    stats.createSpan({ cls: 'vq-stat vq-correct',    text: `✓ ${this.correct}` });
    stats.createSpan({ cls: 'vq-stat vq-incorrect',  text: `✗ ${this.incorrect}` });
    stats.createSpan({ cls: 'vq-stat vq-skipped',    text: `– ${this.skipped}` });
    stats.createSpan({ cls: 'vq-stat vq-remaining',  text: `${this.queue.length + (this.current ? 1 : 0)} übrig` });

    // Progress bar
    const progressBar = contentEl.createDiv('vq-progress-track');
    const fill = progressBar.createDiv('vq-progress-fill');
    fill.style.width = `${Math.round(progress * 100)}%`;

    // Card
    const card = contentEl.createDiv('vq-card');
    const dirLabel = card.createDiv('vq-dir-label');
    dirLabel.setText(this.currentDirection === 'spanish' ? 'Spanisch → Deutsch' : 'Deutsch → Spanisch');

    const question = card.createDiv('vq-question');
    question.setText(this.currentDirection === 'spanish' ? this.current.spanish : this.current.german);

    if (this.showAnswer) {
      const answerWrap = card.createDiv('vq-answer-wrap');
      answerWrap.createDiv('vq-answer-divider');
      const answer = answerWrap.createDiv('vq-answer');
      answer.setText(this.currentDirection === 'spanish' ? this.current.german : this.current.spanish);
    } else {
      const placeholder = card.createDiv('vq-placeholder');
      placeholder.setText('Antwort anzeigen ↓');
    }

    // Buttons
    const buttons = contentEl.createDiv('vq-buttons');

    if (!this.showAnswer) {
      const showBtn = buttons.createEl('button', { cls: 'vq-btn vq-btn-primary', text: 'Antwort anzeigen' });
      showBtn.onclick = () => { this.showAnswer = true; this.render(); };

      const skipBtn = buttons.createEl('button', { cls: 'vq-btn vq-btn-skip', text: 'Überspringen' });
      skipBtn.onclick = () => { this.skipped++; this.nextCard(); };
    } else {
      const correctBtn = buttons.createEl('button', { cls: 'vq-btn vq-btn-correct', text: '✓ Gewusst' });
      correctBtn.onclick = () => { this.correct++; this.nextCard(); };

      const incorrectBtn = buttons.createEl('button', { cls: 'vq-btn vq-btn-incorrect', text: '✗ Nicht gewusst' });
      incorrectBtn.onclick = () => {
        this.incorrect++;
        const pos = Math.floor(Math.random() * (this.queue.length + 1));
        this.queue.splice(pos, 0, this.current);
        this.nextCard();
      };
    }

    const cancelBtn = buttons.createEl('button', { cls: 'vq-btn vq-btn-cancel', text: 'Beenden' });
    cancelBtn.onclick = () => this.close();
  }

  renderFinished() {
    const { contentEl } = this;
    contentEl.empty();

    const elapsed = Math.round((Date.now() - this.startTime) / 1000);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;

    const card = contentEl.createDiv('vq-finish-card');
    card.createDiv('vq-finish-icon').setText('🎉');
    card.createDiv('vq-finish-title').setText('Quiz abgeschlossen!');

    const summary = card.createDiv('vq-finish-summary');
    const pct = this.correct + this.incorrect > 0
      ? Math.round((this.correct / (this.correct + this.incorrect)) * 100)
      : 0;

    const rows = [
      ['Richtig', `${this.correct}`],
      ['Falsch', `${this.incorrect}`],
      ['Übersprungen', `${this.skipped}`],
      ['Trefferquote', `${pct}%`],
      ['Zeit', timeStr],
    ];

    for (const [label, val] of rows) {
      const row = summary.createDiv('vq-finish-row');
      row.createSpan({ cls: 'vq-finish-label', text: label });
      row.createSpan({ cls: 'vq-finish-value', text: val });
    }

    const scoreBarTrack = card.createDiv('vq-score-bar-track');
    const scoreFill = scoreBarTrack.createDiv('vq-score-bar-fill');
    scoreFill.style.width = `${pct}%`;
    scoreFill.style.background = pct >= 80 ? '#4ade80' : pct >= 50 ? '#facc15' : '#f87171';

    const btnRow = card.createDiv('vq-finish-buttons');

    const restartBtn = btnRow.createEl('button', { cls: 'vq-btn vq-btn-primary', text: 'Nochmal' });
    restartBtn.onclick = () => {
      this.correct = 0; this.incorrect = 0; this.skipped = 0;
      this.startTime = Date.now();
      this.queue = this.shuffle([...this.vocab]);
      this.nextCard();
    };

    const closeBtn = btnRow.createEl('button', { cls: 'vq-btn vq-btn-cancel', text: 'Schließen' });
    closeBtn.onclick = () => this.close();
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

    new obsidian.Setting(containerEl)
      .setName('Vokabeldatei')
      .setDesc('Pfad zur Vokabeldatei in deinem Vault (z.B. Sprachen/vokabeln.md).')
      .addText(text => text
        .setPlaceholder('vokabeln.md')
        .setValue(this.plugin.settings.vocabFilePath)
        .onChange(async value => {
          this.plugin.settings.vocabFilePath = value;
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(containerEl)
      .setName('Abfragerichtung')
      .setDesc('Bestimmt, welche Sprache als Frage gestellt wird.')
      .addDropdown(drop => drop
        .addOption('random',  '🎲 Zufall')
        .addOption('spanish', '🇪🇸 Spanisch → Deutsch')
        .addOption('german',  '🇩🇪 Deutsch → Spanisch')
        .setValue(this.plugin.settings.quizDirection)
        .onChange(async value => {
          this.plugin.settings.quizDirection = value;
          await this.plugin.saveSettings();
        }));

    new obsidian.Setting(containerEl)
      .setName('Trennzeichen')
      .setDesc('Trennzeichen für einfache Textdateien (Standard: | für Markdown-Tabellen). z.B. ";" oder ","')
      .addText(text => text
        .setPlaceholder('|')
        .setValue(this.plugin.settings.delimiter)
        .onChange(async value => {
          this.plugin.settings.delimiter = value || '|';
          await this.plugin.saveSettings();
        }));

    containerEl.createEl('h3', { text: 'Dateiformat' });
    const help = containerEl.createEl('div', { cls: 'vq-settings-help' });
    help.createEl('p', { text: 'Das Plugin unterstützt zwei Formate:' });

    help.createEl('strong', { text: '1. Markdown-Tabelle:' });
    const pre1 = help.createEl('pre');
    pre1.createEl('code', { text: '| Spanisch | Deutsch |\n|----------|---------|\n| hola     | Hallo   |\n| gracias  | Danke   |' });

    help.createEl('strong', { text: '2. Einfache Textdatei:' });
    const pre2 = help.createEl('pre');
    pre2.createEl('code', { text: 'hola | Hallo\ngracias | Danke\ncasa | Haus' });

    help.createEl('p', { text: 'Zeilen mit # oder // werden als Kommentare ignoriert.' });

    new obsidian.Setting(containerEl)
      .setName('Beispieldatei erstellen')
      .setDesc('Erstellt eine Beispiel-Vokabeldatei im konfigurierten Pfad.')
      .addButton(btn => btn
        .setButtonText('Erstellen')
        .onClick(async () => { await this.plugin.createExampleFile(); }));
  }
}

// ─── Main Plugin ───────────────────────────────────────────────────────────

const QUIZ_STYLES = `
.vocab-quiz-modal {
  width: 560px !important;
  max-width: 95vw !important;
  border-radius: 16px !important;
  overflow: hidden;
  font-family: 'Georgia', 'Times New Roman', serif;
}
.vocab-quiz-modal .modal-content { padding: 0 !important; background: var(--background-primary); }
.vq-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--background-modifier-border);
  background: var(--background-secondary);
}
.vq-logo { font-size: 20px; letter-spacing: 4px; }
.vq-stats { display: flex; gap: 12px; font-size: 13px; font-family: monospace; }
.vq-stat { padding: 2px 8px; border-radius: 20px; font-weight: 600; }
.vq-correct   { background: #dcfce7; color: #16a34a; }
.vq-incorrect { background: #fee2e2; color: #dc2626; }
.vq-skipped   { background: #f3f4f6; color: #6b7280; }
.vq-remaining { background: #dbeafe; color: #2563eb; }
.theme-dark .vq-correct   { background: #14532d; color: #86efac; }
.theme-dark .vq-incorrect { background: #7f1d1d; color: #fca5a5; }
.theme-dark .vq-skipped   { background: #374151; color: #9ca3af; }
.theme-dark .vq-remaining { background: #1e3a5f; color: #93c5fd; }
.vq-progress-track { height: 4px; background: var(--background-modifier-border); }
.vq-progress-fill { height: 100%; background: linear-gradient(90deg, #f59e0b, #ef4444); transition: width 0.4s ease; }
.vq-card {
  margin: 28px 28px 16px; padding: 32px;
  border-radius: 14px; border: 2px solid var(--background-modifier-border);
  background: var(--background-secondary);
  min-height: 180px; display: flex; flex-direction: column;
  align-items: center; gap: 16px; text-align: center;
  box-shadow: 0 4px 24px rgba(0,0,0,0.08);
}
.vq-dir-label {
  font-size: 11px; letter-spacing: 1.5px; text-transform: uppercase;
  color: var(--text-muted); font-family: monospace;
}
.vq-question { font-size: 36px; font-weight: 700; line-height: 1.2; color: var(--text-normal); font-style: italic; }
.vq-answer-wrap { width: 100%; display: flex; flex-direction: column; align-items: center; gap: 12px; }
.vq-answer-divider { width: 60px; height: 2px; background: linear-gradient(90deg, #f59e0b, #ef4444); border-radius: 2px; }
.vq-answer { font-size: 28px; font-weight: 600; color: #f59e0b; animation: vq-reveal 0.3s ease; }
@keyframes vq-reveal { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
.vq-placeholder { font-size: 14px; color: var(--text-muted); font-style: italic; letter-spacing: 0.5px; }
.vq-buttons { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; padding: 0 28px 28px; }
.vq-btn {
  padding: 10px 22px; border-radius: 8px; border: none;
  font-size: 14px; font-weight: 600; cursor: pointer;
  transition: all 0.15s ease; letter-spacing: 0.3px;
}
.vq-btn:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.15); }
.vq-btn:active { transform: translateY(0); }
.vq-btn-primary   { background: linear-gradient(135deg, #f59e0b, #ef4444); color: white; flex: 1; max-width: 280px; }
.vq-btn-correct   { background: #16a34a; color: white; }
.vq-btn-incorrect { background: #dc2626; color: white; }
.vq-btn-skip      { background: var(--background-modifier-border); color: var(--text-muted); }
.vq-btn-cancel    { background: transparent; color: var(--text-muted); border: 1px solid var(--background-modifier-border); }
.vq-finish-card { display: flex; flex-direction: column; align-items: center; gap: 20px; padding: 32px 28px; }
.vq-finish-icon { font-size: 48px; }
.vq-finish-title { font-size: 24px; font-weight: 700; color: var(--text-normal); }
.vq-finish-summary { width: 100%; display: flex; flex-direction: column; gap: 8px; border-radius: 10px; border: 1px solid var(--background-modifier-border); overflow: hidden; }
.vq-finish-row { display: flex; justify-content: space-between; padding: 8px 16px; font-size: 14px; }
.vq-finish-row:nth-child(odd) { background: var(--background-secondary); }
.vq-finish-label { color: var(--text-muted); }
.vq-finish-value { font-weight: 700; color: var(--text-normal); }
.vq-score-bar-track { width: 100%; height: 8px; background: var(--background-modifier-border); border-radius: 4px; overflow: hidden; }
.vq-score-bar-fill { height: 100%; border-radius: 4px; transition: width 0.8s ease; }
.vq-finish-buttons { display: flex; gap: 12px; width: 100%; }
.vq-finish-buttons .vq-btn { flex: 1; }
.vq-settings-help { background: var(--background-secondary); border-radius: 8px; padding: 16px; margin-top: 8px; font-size: 13px; color: var(--text-muted); }
.vq-settings-help pre { background: var(--background-primary); border-radius: 6px; padding: 10px; margin: 8px 0 14px; overflow-x: auto; }
.vq-settings-help code { font-size: 12px; font-family: monospace; color: var(--text-normal); }
`;

class VocabQuizPlugin extends obsidian.Plugin {
  async onload() {
    await this.loadSettings();

    this.addRibbonIcon('languages', 'Vokabel-Quiz starten', async () => {
      await this.startQuiz();
    });

    this.addCommand({
      id: 'start-vocab-quiz',
      name: 'Vokabel-Quiz starten',
      callback: async () => { await this.startQuiz(); },
    });

    this.addCommand({
      id: 'start-vocab-quiz-spanish',
      name: 'Quiz: Spanisch → Deutsch',
      callback: async () => { await this.startQuiz('spanish'); },
    });

    this.addCommand({
      id: 'start-vocab-quiz-german',
      name: 'Quiz: Deutsch → Spanisch',
      callback: async () => { await this.startQuiz('german'); },
    });

    this.addCommand({
      id: 'start-vocab-quiz-random',
      name: 'Quiz: Zufällige Richtung',
      callback: async () => { await this.startQuiz('random'); },
    });

    this.addSettingTab(new VocabQuizSettingTab(this.app, this));
    this.injectStyles();
  }

  async startQuiz(directionOverride) {
    const direction = directionOverride ?? this.settings.quizDirection;
    const filePath = this.settings.vocabFilePath;
    const file = this.app.vault.getAbstractFileByPath(filePath);

    if (!file || !(file instanceof obsidian.TFile)) {
      new obsidian.Notice(`❌ Vokabeldatei nicht gefunden: "${filePath}"\nBitte Pfad in den Einstellungen überprüfen.`);
      return;
    }

    const content = await this.app.vault.read(file);
    const vocab = parseVocabFile(content, this.settings.delimiter);

    if (vocab.length === 0) {
      new obsidian.Notice(`⚠️ Keine Vokabeln gefunden in "${filePath}".\nBitte Dateiformat prüfen.`);
      return;
    }

    new obsidian.Notice(`✅ ${vocab.length} Vokabeln geladen. Quiz startet!`);
    new QuizModal(this.app, vocab, direction).open();
  }

  async createExampleFile() {
    const path = this.settings.vocabFilePath;
    const exampleContent = `# Spanisch-Deutsch Vokabeln\n\n| Spanisch | Deutsch |\n|----------|---------|\n| hola | Hallo |\n| adiós | Auf Wiedersehen |\n| buenos días | Guten Morgen |\n| gracias | Danke |\n| de nada | Bitte / Gern geschehen |\n| por favor | Bitte |\n| sí | Ja |\n| no | Nein |\n| casa | Haus |\n| libro | Buch |\n| agua | Wasser |\n| comida | Essen |\n| amigo | Freund |\n| trabajo | Arbeit |\n| tiempo | Zeit / Wetter |\n| ciudad | Stadt |\n| dinero | Geld |\n| hablar | sprechen |\n| comer | essen |\n| vivir | leben |\n| querer | wollen / lieben |\n| poder | können |\n| ir | gehen |\n| venir | kommen |\n| hacer | machen / tun |\n| tener | haben |\n| ser | sein (dauerhaft) |\n| estar | sein (vorübergehend) |\n| grande | groß |\n| pequeño | klein |\n`;
    try {
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (existing) {
        new obsidian.Notice(`⚠️ Datei existiert bereits: "${path}"`);
        return;
      }
      const dir = path.split('/').slice(0, -1).join('/');
      if (dir) {
        try { await this.app.vault.createFolder(dir); } catch { /* already exists */ }
      }
      await this.app.vault.create(path, exampleContent);
      new obsidian.Notice(`✅ Beispieldatei erstellt: "${path}"`);
    } catch (e) {
      new obsidian.Notice(`❌ Fehler beim Erstellen der Datei: ${e}`);
    }
  }

  injectStyles() {
    const style = document.createElement('style');
    style.id = 'vocab-quiz-styles';
    style.textContent = QUIZ_STYLES;
    document.head.appendChild(style);
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
