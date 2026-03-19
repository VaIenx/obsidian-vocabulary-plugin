/*
Vokabel-Quiz ES↔DE – Obsidian Plugin v3.0.0
Pre-built bundle – keine Build-Tools erforderlich.
*/
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// main.ts
var main_exports = {};
__export(main_exports, {
  default: () => VocabQuizPlugin
});
module.exports = __toCommonJS(main_exports);
var import_obsidian = require("obsidian");
var DEFAULT_SETTINGS = {
  vocabFilePath: "vokabeln.md",
  quizDirection: "random",
  delimiter: "|",
  strictMode: false
};
function parseVocabFile(content, delimiter) {
  const entries = [];
  const lines = content.split("\n");
  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#") || line.startsWith("//")) continue;
    if (/^[\|\s\-:]+$/.test(line)) continue;
    let parts;
    if (line.startsWith("|") && line.endsWith("|")) {
      parts = line.slice(1, -1).split("|").map((p) => p.trim());
    } else {
      parts = line.split(delimiter).map((p) => p.trim());
    }
    if (parts.length >= 2 && parts[0] && parts[1]) {
      entries.push({ spanish: parts[0], german: parts[1] });
    }
  }
  return entries;
}
function normalize(s) {
  return s.toLowerCase().replace(/\s+/g, " ").trim().replace(/^(der|die|das|ein|eine|el|la|los|las|un|una)\s+/i, "");
}
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from(
    { length: m + 1 },
    (_, i) => Array.from({ length: n + 1 }, (_2, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
  return dp[m][n];
}
function checkAnswer(input, correct, strict) {
  const normInput = normalize(input);
  const alternatives = correct.split(/[\/,]/).map((a) => normalize(a.trim())).filter(Boolean);
  for (const alt of alternatives) {
    if (normInput === alt) return "correct";
  }
  if (!strict) {
    for (const alt of alternatives) {
      const maxDist = Math.min(2, Math.floor(alt.length / 6));
      if (maxDist > 0 && levenshtein(normInput, alt) <= maxDist) return "almost";
    }
  }
  return "wrong";
}
var QuizModal = class extends import_obsidian.Modal {
  constructor(app, vocab, direction, strictMode) {
    super(app);
    this.current = null;
    this.correct = 0;
    this.incorrect = 0;
    this.skipped = 0;
    this.currentDirection = "spanish";
    this.cardState = "question";
    this.lastInput = "";
    this.vocab = vocab;
    this.direction = direction;
    this.strictMode = strictMode;
    this.queue = this.shuffle([...vocab]);
    this.startTime = Date.now();
  }
  shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  onOpen() {
    this.modalEl.addClass("vocab-quiz-modal");
    this.nextCard();
  }
  onClose() {
    this.contentEl.empty();
  }
  nextCard() {
    this.cardState = "question";
    this.lastInput = "";
    if (this.queue.length === 0) {
      this.renderFinished();
      return;
    }
    this.current = this.queue.shift();
    this.currentDirection = this.direction === "random" ? Math.random() < 0.5 ? "spanish" : "german" : this.direction;
    this.render();
  }
  submitAnswer(input) {
    if (!this.current) return;
    const correctText = this.currentDirection === "spanish" ? this.current.german : this.current.spanish;
    const result = checkAnswer(input, correctText, this.strictMode);
    this.lastInput = input;
    if (result === "correct") {
      this.correct++;
      this.cardState = "result-correct";
    } else if (result === "almost") {
      this.correct++;
      this.cardState = "result-almost";
    } else {
      this.incorrect++;
      const pos = Math.floor(Math.random() * (this.queue.length + 1));
      this.queue.splice(pos, 0, this.current);
      this.cardState = "result-wrong";
    }
    this.render();
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    const total = this.vocab.length;
    const done = this.correct + this.incorrect + this.skipped;
    const header = contentEl.createDiv("vq-header");
    header.createDiv("vq-logo").setText("\u{1F1EA}\u{1F1F8} \u2194 \u{1F1E9}\u{1F1EA}");
    const stats = header.createDiv("vq-stats");
    stats.createSpan({ cls: "vq-stat vq-correct", text: `\u2713 ${this.correct}` });
    stats.createSpan({ cls: "vq-stat vq-incorrect", text: `\u2717 ${this.incorrect}` });
    stats.createSpan({ cls: "vq-stat vq-skipped", text: `\u2013 ${this.skipped}` });
    stats.createSpan({ cls: "vq-stat vq-remaining", text: `${this.queue.length + (this.cardState === "question" ? 1 : 0)} \xFCbrig` });
    const fill = contentEl.createDiv("vq-progress-track").createDiv("vq-progress-fill");
    fill.style.width = `${total > 0 ? Math.round(done / total * 100) : 0}%`;
    const card = contentEl.createDiv("vq-card");
    if (this.cardState === "result-correct") card.addClass("vq-card-correct");
    if (this.cardState === "result-almost") card.addClass("vq-card-almost");
    if (this.cardState === "result-wrong") card.addClass("vq-card-wrong");
    card.createDiv("vq-dir-label").setText(
      this.currentDirection === "spanish" ? "Spanisch \u2192 Deutsch" : "Deutsch \u2192 Spanisch"
    );
    card.createDiv("vq-question").setText(
      this.currentDirection === "spanish" ? this.current.spanish : this.current.german
    );
    const correctText = this.currentDirection === "spanish" ? this.current.german : this.current.spanish;
    if (this.cardState === "question") {
      const inputWrap = card.createDiv("vq-input-wrap");
      const input = inputWrap.createEl("input", {
        cls: "vq-answer-input",
        type: "text",
        placeholder: "\xDCbersetzung eingeben \u2026"
      });
      input.focus();
      const submitBtn = inputWrap.createEl("button", {
        cls: "vq-btn vq-btn-primary vq-btn-check",
        text: "Pr\xFCfen \u21B5"
      });
      const doSubmit = () => {
        const val = input.value.trim();
        if (!val) return;
        this.submitAnswer(val);
      };
      submitBtn.onclick = doSubmit;
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          doSubmit();
        }
      });
    } else {
      const resultWrap = card.createDiv("vq-result-wrap");
      if (this.cardState === "result-correct") {
        resultWrap.createDiv("vq-result-icon").setText("\u2713");
        resultWrap.createDiv("vq-result-msg").setText("Richtig!");
      } else if (this.cardState === "result-almost") {
        resultWrap.createDiv("vq-result-icon").setText("\u301C");
        resultWrap.createDiv("vq-result-msg").setText("Fast! Kleiner Tippfehler");
        const yourAnswer = resultWrap.createDiv("vq-result-your-answer");
        yourAnswer.createSpan({ cls: "vq-result-hint-label", text: "Deine Antwort: " });
        yourAnswer.createSpan({ cls: "vq-result-hint-value", text: this.lastInput });
      } else {
        resultWrap.createDiv("vq-result-icon").setText("\u2717");
        resultWrap.createDiv("vq-result-msg").setText("Falsch");
        const yourAnswer = resultWrap.createDiv("vq-result-your-answer");
        yourAnswer.createSpan({ cls: "vq-result-hint-label", text: "Deine Antwort: " });
        yourAnswer.createSpan({ cls: "vq-result-hint-value vq-wrong-value", text: this.lastInput });
      }
      const correctWrap = resultWrap.createDiv("vq-result-correct-answer");
      correctWrap.createSpan({ cls: "vq-result-hint-label", text: "Richtig: " });
      correctWrap.createSpan({ cls: "vq-result-correct-value", text: correctText });
    }
    const buttons = contentEl.createDiv("vq-buttons");
    if (this.cardState === "question") {
      const skipBtn = buttons.createEl("button", {
        cls: "vq-btn vq-btn-skip",
        text: "\xDCberspringen"
      });
      skipBtn.onclick = () => {
        this.skipped++;
        this.nextCard();
      };
    } else {
      const nextBtn = buttons.createEl("button", {
        cls: "vq-btn vq-btn-primary",
        text: this.queue.length === 0 ? "Ergebnis anzeigen \u2192" : "Weiter \u2192"
      });
      nextBtn.onclick = () => this.nextCard();
    }
    buttons.createEl("button", {
      cls: "vq-btn vq-btn-cancel",
      text: "Beenden"
    }).onclick = () => this.close();
  }
  renderFinished() {
    const { contentEl } = this;
    contentEl.empty();
    const elapsed = Math.round((Date.now() - this.startTime) / 1e3);
    const mins = Math.floor(elapsed / 60);
    const secs = elapsed % 60;
    const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
    const total = this.correct + this.incorrect;
    const pct = total > 0 ? Math.round(this.correct / total * 100) : 0;
    const card = contentEl.createDiv("vq-finish-card");
    card.createDiv("vq-finish-icon").setText("\u{1F389}");
    card.createDiv("vq-finish-title").setText("Quiz abgeschlossen!");
    const summary = card.createDiv("vq-finish-summary");
    for (const [label, val] of [
      ["Richtig", `${this.correct}`],
      ["Falsch", `${this.incorrect}`],
      ["\xDCbersprungen", `${this.skipped}`],
      ["Trefferquote", `${pct}%`],
      ["Zeit", timeStr]
    ]) {
      const row = summary.createDiv("vq-finish-row");
      row.createSpan({ cls: "vq-finish-label", text: label });
      row.createSpan({ cls: "vq-finish-value", text: val });
    }
    const scoreBar = card.createDiv("vq-score-bar-track").createDiv("vq-score-bar-fill");
    scoreBar.style.width = `${pct}%`;
    scoreBar.style.background = pct >= 80 ? "#4ade80" : pct >= 50 ? "#facc15" : "#f87171";
    const btnRow = card.createDiv("vq-finish-buttons");
    btnRow.createEl("button", { cls: "vq-btn vq-btn-primary", text: "Nochmal" }).onclick = () => {
      this.correct = 0;
      this.incorrect = 0;
      this.skipped = 0;
      this.startTime = Date.now();
      this.queue = this.shuffle([...this.vocab]);
      this.nextCard();
    };
    btnRow.createEl("button", { cls: "vq-btn vq-btn-cancel", text: "Schlie\xDFen" }).onclick = () => this.close();
  }
};
var FolderBrowserModal = class extends import_obsidian.Modal {
  constructor(app, startPath, onSelect) {
    super(app);
    this.currentPath = startPath || "";
    this.onSelect = onSelect;
  }
  onOpen() {
    this.modalEl.addClass("vq-browser-modal");
    this.render();
  }
  onClose() {
    this.contentEl.empty();
  }
  getChildren(folderPath) {
    const folder = folderPath === "" ? this.app.vault.getRoot() : this.app.vault.getAbstractFileByPath(folderPath);
    if (!folder || !("children" in folder)) return { folders: [], files: [] };
    const folders = [], files = [];
    for (const child of folder.children) {
      if ("children" in child) folders.push(child);
      else if (child.extension === "md") files.push(child);
    }
    folders.sort((a, b) => a.name.localeCompare(b.name));
    files.sort((a, b) => a.name.localeCompare(b.name));
    return { folders, files };
  }
  render() {
    const { contentEl } = this;
    contentEl.empty();
    const header = contentEl.createDiv("vq-browser-header");
    header.createDiv("vq-browser-title").setText("\u{1F4C2} Vokabeldatei ausw\xE4hlen");
    const bc = header.createDiv("vq-browser-breadcrumb");
    const rootCrumb = bc.createSpan({ cls: "vq-crumb vq-crumb-link", text: "\u2302 Vault" });
    rootCrumb.onclick = () => {
      this.currentPath = "";
      this.render();
    };
    if (this.currentPath) {
      const parts = this.currentPath.split("/");
      for (let i = 0; i < parts.length; i++) {
        bc.createSpan({ cls: "vq-crumb-sep", text: " \u203A " });
        const crumbPath = parts.slice(0, i + 1).join("/");
        const isLast = i === parts.length - 1;
        const crumb = bc.createSpan({
          cls: isLast ? "vq-crumb vq-crumb-current" : "vq-crumb vq-crumb-link",
          text: parts[i]
        });
        if (!isLast) crumb.onclick = () => {
          this.currentPath = crumbPath;
          this.render();
        };
      }
    }
    const list = contentEl.createDiv("vq-browser-list");
    const { folders, files } = this.getChildren(this.currentPath);
    if (this.currentPath !== "") {
      const back = list.createDiv("vq-browser-row vq-browser-row-back");
      back.createSpan({ cls: "vq-browser-icon", text: "\u21A9" });
      back.createSpan({ cls: "vq-browser-name", text: ".. zur\xFCck" });
      back.onclick = () => {
        this.currentPath = this.currentPath.split("/").slice(0, -1).join("/");
        this.render();
      };
    }
    if (folders.length === 0 && files.length === 0)
      list.createDiv({ cls: "vq-browser-empty", text: "Keine Ordner oder .md-Dateien hier." });
    for (const folder of folders) {
      const row = list.createDiv("vq-browser-row vq-browser-row-folder");
      row.createSpan({ cls: "vq-browser-icon", text: "\u{1F4C1}" });
      row.createSpan({ cls: "vq-browser-name", text: folder.name });
      row.createSpan({ cls: "vq-browser-chevron", text: "\u203A" });
      row.onclick = () => {
        this.currentPath = folder.path;
        this.render();
      };
    }
    for (const file of files) {
      const row = list.createDiv("vq-browser-row vq-browser-row-file");
      row.createSpan({ cls: "vq-browser-icon", text: "\u{1F4C4}" });
      row.createSpan({ cls: "vq-browser-name", text: file.name });
      row.onclick = () => {
        this.onSelect(file.path);
        this.close();
      };
    }
    const footer = contentEl.createDiv("vq-browser-footer");
    footer.createEl("button", { cls: "vq-btn vq-btn-cancel", text: "Abbrechen" }).onclick = () => this.close();
  }
};
var LaunchModal = class extends import_obsidian.Modal {
  constructor(app, plugin) {
    super(app);
    this.plugin = plugin;
    this.selectedDirection = "random";
  }
  onOpen() {
    this.modalEl.addClass("vq-launch-modal");
    this.render();
  }
  onClose() {
    this.contentEl.empty();
  }
  render() {
    var _a;
    const { contentEl } = this;
    contentEl.empty();
    const header = contentEl.createDiv("vq-launch-header");
    header.createDiv("vq-launch-logo").setText("\u{1F1EA}\u{1F1F8} \u2194 \u{1F1E9}\u{1F1EA}");
    header.createDiv("vq-launch-title").setText("Vokabel-Quiz");
    header.createDiv("vq-launch-sub").setText("Einstellungen f\xFCr diese Runde");
    const body = contentEl.createDiv("vq-launch-body");
    const filePath = this.plugin.settings.vocabFilePath;
    const fileSection = body.createDiv("vq-launch-section");
    fileSection.createDiv({ cls: "vq-launch-label", text: "Vokabeldatei" });
    const picker = fileSection.createDiv("vq-launch-file-picker");
    const display = picker.createDiv("vq-launch-file-display");
    if (filePath) {
      const wrap = display.createDiv("vq-launch-file-name-wrap");
      wrap.createSpan({ cls: "vq-launch-file-icon", text: "\u{1F4C4}" });
      const info = wrap.createDiv("vq-launch-file-info");
      info.createDiv({ cls: "vq-launch-file-name", text: (_a = filePath.split("/").pop()) != null ? _a : filePath });
      info.createDiv({ cls: "vq-launch-file-path", text: filePath });
    } else {
      display.createSpan({ cls: "vq-launch-file-none", text: "\u26A0\uFE0F Keine Datei gew\xE4hlt" });
    }
    picker.createEl("button", { cls: "vq-btn vq-btn-outline", text: "\u{1F4C2} W\xE4hlen" }).onclick = () => {
      const startFolder = filePath ? filePath.split("/").slice(0, -1).join("/") : "";
      new FolderBrowserModal(this.app, startFolder, async (path) => {
        this.plugin.settings.vocabFilePath = path;
        await this.plugin.saveSettings();
        this.render();
      }).open();
    };
    const dirSection = body.createDiv("vq-launch-section");
    dirSection.createDiv({ cls: "vq-launch-label", text: "Abfragerichtung" });
    const dirOptions = dirSection.createDiv("vq-launch-dir-options");
    const directions = [
      { value: "random", icon: "\u{1F3B2}", label: "Zufall", sub: "Gemischt" },
      { value: "spanish", icon: "\u{1F1EA}\u{1F1F8}", label: "ES \u2192 DE", sub: "Du siehst Spanisch" },
      { value: "german", icon: "\u{1F1E9}\u{1F1EA}", label: "DE \u2192 ES", sub: "Du siehst Deutsch" }
    ];
    for (const opt of directions) {
      const card = dirOptions.createDiv({
        cls: `vq-dir-card ${this.selectedDirection === opt.value ? "vq-dir-card-active" : ""}`
      });
      card.createDiv({ cls: "vq-dir-card-icon", text: opt.icon });
      card.createDiv({ cls: "vq-dir-card-label", text: opt.label });
      card.createDiv({ cls: "vq-dir-card-sub", text: opt.sub });
      card.onclick = () => {
        this.selectedDirection = opt.value;
        this.render();
      };
    }
    const footer = contentEl.createDiv("vq-launch-footer");
    const startBtn = footer.createEl("button", {
      cls: "vq-btn vq-btn-primary vq-btn-start" + (!filePath ? " vq-btn-disabled" : ""),
      text: "\u25B6  Quiz starten"
    });
    startBtn.disabled = !filePath;
    startBtn.onclick = async () => {
      if (!filePath) return;
      this.close();
      await this.plugin.startQuiz(this.selectedDirection);
    };
    if (!filePath)
      footer.createDiv({ cls: "vq-launch-hint", text: "Bitte zuerst eine Vokabeldatei ausw\xE4hlen." });
    footer.createEl("button", { cls: "vq-btn vq-btn-cancel", text: "Abbrechen" }).onclick = () => this.close();
  }
};
var VocabQuizSettingTab = class extends import_obsidian.PluginSettingTab {
  constructor(app, plugin) {
    super(app, plugin);
    this.plugin = plugin;
  }
  display() {
    var _a;
    const { containerEl } = this;
    containerEl.empty();
    containerEl.createEl("h2", { text: "Vokabel-Quiz Einstellungen" });
    containerEl.createEl("h3", { text: "Vokabeldatei" });
    const wrap = containerEl.createDiv("vq-settings-file-wrap");
    const currentPath = this.plugin.settings.vocabFilePath;
    const display = wrap.createDiv("vq-settings-file-display");
    if (currentPath) {
      display.createSpan({ cls: "vq-settings-file-icon", text: "\u{1F4C4}" });
      const info = display.createDiv("vq-settings-file-info");
      info.createDiv({ cls: "vq-settings-file-name", text: (_a = currentPath.split("/").pop()) != null ? _a : currentPath });
      info.createDiv({ cls: "vq-settings-file-full", text: currentPath });
    } else {
      display.createSpan({ cls: "vq-settings-file-icon", text: "\u{1F4C2}" });
      display.createDiv({ cls: "vq-settings-file-none", text: "Keine Datei ausgew\xE4hlt" });
    }
    wrap.createEl("button", { cls: "vq-btn vq-btn-outline", text: "\u{1F4C2} Durchsuchen" }).onclick = () => {
      const startFolder = currentPath ? currentPath.split("/").slice(0, -1).join("/") : "";
      new FolderBrowserModal(this.app, startFolder, async (path) => {
        this.plugin.settings.vocabFilePath = path;
        await this.plugin.saveSettings();
        this.display();
      }).open();
    };
    new import_obsidian.Setting(containerEl).setName("Trennzeichen").setDesc('F\xFCr einfache Textdateien (Standard: |). Alternativ ";" oder ",".').addText(
      (text) => text.setPlaceholder("|").setValue(this.plugin.settings.delimiter).onChange(async (value) => {
        this.plugin.settings.delimiter = value || "|";
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Strenger Modus").setDesc("Wenn aktiviert, werden kleine Tippfehler (1\u20132 Zeichen) nicht mehr als richtig gewertet.").addToggle(
      (toggle) => toggle.setValue(this.settings.strictMode).onChange(async (value) => {
        this.settings.strictMode = value;
        await this.plugin.saveSettings();
      })
    );
    new import_obsidian.Setting(containerEl).setName("Beispieldatei erstellen").setDesc("Erstellt eine Demo-Datei mit Spanisch-Deutsch-Vokabeln.").addButton(
      (btn) => btn.setButtonText("Erstellen").onClick(async () => {
        await this.plugin.createExampleFile();
        this.display();
      })
    );
    containerEl.createEl("h3", { text: "Dateiformat" });
    const help = containerEl.createDiv("vq-settings-help");
    help.createEl("p", { text: "Das Plugin unterst\xFCtzt zwei Formate:" });
    help.createEl("strong", { text: "1. Markdown-Tabelle (empfohlen):" });
    help.createEl("pre").createEl("code", {
      text: "| Spanisch | Deutsch |\n|----------|---------|\n| hola     | Hallo   |\n| gracias  | Danke   |"
    });
    help.createEl("strong", { text: "2. Textdatei mit Trennzeichen:" });
    help.createEl("pre").createEl("code", { text: "hola | Hallo\ngracias | Danke\ncasa | Haus" });
    help.createEl("p", { text: "\u{1F4A1} Zeilen mit # oder // werden als Kommentare ignoriert." });
    help.createEl("p", { text: '\u{1F4A1} Slash-getrennte Alternativen werden alle akzeptiert: z.B. "wollen / lieben".' });
  }
};
var VocabQuizPlugin = class extends import_obsidian.Plugin {
  constructor() {
    super(...arguments);
    this.settings = DEFAULT_SETTINGS;
  }
  async onload() {
    await this.loadSettings();
    this.addRibbonIcon("languages", "Vokabel-Quiz starten", () => {
      new LaunchModal(this.app, this).open();
    });
    this.addCommand({
      id: "start-vocab-quiz",
      name: "Vokabel-Quiz starten",
      callback: () => {
        new LaunchModal(this.app, this).open();
      }
    });
    this.addCommand({
      id: "start-vocab-quiz-spanish",
      name: "Quiz: Spanisch \u2192 Deutsch",
      callback: async () => {
        await this.startQuiz("spanish");
      }
    });
    this.addCommand({
      id: "start-vocab-quiz-german",
      name: "Quiz: Deutsch \u2192 Spanisch",
      callback: async () => {
        await this.startQuiz("german");
      }
    });
    this.addCommand({
      id: "start-vocab-quiz-random",
      name: "Quiz: Zuf\xE4llige Richtung",
      callback: async () => {
        await this.startQuiz("random");
      }
    });
    this.addSettingTab(new VocabQuizSettingTab(this.app, this));
    this.injectStyles();
  }
  async startQuiz(direction) {
    const dir = direction != null ? direction : this.settings.quizDirection;
    const path = this.settings.vocabFilePath;
    const file = this.app.vault.getAbstractFileByPath(path);
    if (!file || !(file instanceof import_obsidian.TFile)) {
      new import_obsidian.Notice(`\u274C Vokabeldatei nicht gefunden: "${path}"`);
      return;
    }
    const content = await this.app.vault.read(file);
    const vocab = parseVocabFile(content, this.settings.delimiter);
    if (vocab.length === 0) {
      new import_obsidian.Notice(`\u26A0\uFE0F Keine Vokabeln in "${path}" gefunden. Bitte Format pr\xFCfen.`);
      return;
    }
    new import_obsidian.Notice(`\u2705 ${vocab.length} Vokabeln geladen. Quiz startet!`);
    new QuizModal(this.app, vocab, dir, this.settings.strictMode).open();
  }
  async createExampleFile() {
    const path = this.settings.vocabFilePath || "vokabeln.md";
    const content = `# Spanisch-Deutsch Vokabeln

| Spanisch | Deutsch |
|----------|---------|
| hola | Hallo |
| adi\xF3s | Auf Wiedersehen |
| buenos d\xEDas | Guten Morgen |
| gracias | Danke |
| de nada | Bitte / Gern geschehen |
| por favor | Bitte |
| perd\xF3n | Entschuldigung |
| s\xED | Ja |
| no | Nein |
| casa | Haus |
| libro | Buch |
| agua | Wasser |
| comida | Essen |
| amigo | Freund |
| trabajo | Arbeit |
| tiempo | Zeit / Wetter |
| ciudad | Stadt |
| dinero | Geld |
| hablar | sprechen |
| comer | essen |
| vivir | leben |
| querer | wollen / lieben |
| poder | k\xF6nnen |
| ir | gehen |
| venir | kommen |
| hacer | machen / tun |
| tener | haben |
| ser | sein (dauerhaft) |
| estar | sein (vor\xFCbergehend) |
| grande | gro\xDF |
`;
    try {
      if (this.app.vault.getAbstractFileByPath(path)) {
        new import_obsidian.Notice(`\u26A0\uFE0F Datei existiert bereits: "${path}"`);
        return;
      }
      const dir = path.split("/").slice(0, -1).join("/");
      if (dir) {
        try {
          await this.app.vault.createFolder(dir);
        } catch (e) {
        }
      }
      await this.app.vault.create(path, content);
      if (!this.settings.vocabFilePath) {
        this.settings.vocabFilePath = path;
        await this.saveSettings();
      }
      new import_obsidian.Notice(`\u2705 Beispieldatei erstellt: "${path}"`);
    } catch (e) {
      new import_obsidian.Notice(`\u274C Fehler: ${e}`);
    }
  }
  injectStyles() {
    const el = document.createElement("style");
    el.id = "vocab-quiz-styles";
    el.textContent = QUIZ_STYLES;
    document.head.appendChild(el);
  }
  onunload() {
    var _a;
    (_a = document.getElementById("vocab-quiz-styles")) == null ? void 0 : _a.remove();
  }
  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }
  async saveSettings() {
    await this.saveData(this.settings);
  }
};
var QUIZ_STYLES = `
/* \u2550\u2550 Quiz Modal \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
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

/* \u2550\u2550 Card \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
.vq-card {
  margin:28px 28px 16px; padding:32px; border-radius:14px;
  border:2px solid var(--background-modifier-border);
  background:var(--background-secondary); min-height:180px;
  display:flex; flex-direction:column; align-items:center; gap:16px; text-align:center;
  box-shadow:0 4px 24px rgba(0,0,0,.08);
  transition:border-color .25s ease, background .25s ease;
}
.vq-card-correct  { border-color:#16a34a !important; background:rgba(22,163,74,.06) !important; }
.vq-card-almost   { border-color:#f59e0b !important; background:rgba(245,158,11,.06) !important; }
.vq-card-wrong    { border-color:#dc2626 !important; background:rgba(220,38,38,.06) !important; }
.theme-dark .vq-card-correct { background:rgba(22,163,74,.12) !important; }
.theme-dark .vq-card-almost  { background:rgba(245,158,11,.12) !important; }
.theme-dark .vq-card-wrong   { background:rgba(220,38,38,.12) !important; }

.vq-dir-label    { font-size:11px; letter-spacing:1.5px; text-transform:uppercase; color:var(--text-muted); font-family:monospace; }
.vq-question     { font-size:36px; font-weight:700; line-height:1.2; color:var(--text-normal); font-style:italic; }

/* \u2550\u2550 Input area \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
.vq-input-wrap {
  display:flex; gap:8px; width:100%; max-width:420px;
}
.vq-answer-input {
  flex:1; padding:10px 14px; border-radius:8px; font-size:16px;
  border:2px solid var(--background-modifier-border);
  background:var(--background-primary); color:var(--text-normal);
  font-family:'Georgia','Times New Roman',serif;
  outline:none; transition:border-color .15s ease;
}
.vq-answer-input:focus {
  border-color:#f59e0b;
  box-shadow:0 0 0 3px rgba(245,158,11,.15);
}
.vq-btn-check { padding:10px 18px; white-space:nowrap; }

/* \u2550\u2550 Result area \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
.vq-result-wrap {
  display:flex; flex-direction:column; align-items:center; gap:10px; width:100%;
  animation:vq-reveal .25s ease;
}
.vq-result-icon {
  font-size:36px; font-weight:700;
}
.vq-card-correct .vq-result-icon  { color:#16a34a; }
.vq-card-almost  .vq-result-icon  { color:#f59e0b; }
.vq-card-wrong   .vq-result-icon  { color:#dc2626; }
.vq-result-msg {
  font-size:18px; font-weight:700;
}
.vq-card-correct .vq-result-msg { color:#16a34a; }
.vq-card-almost  .vq-result-msg { color:#f59e0b; }
.vq-card-wrong   .vq-result-msg { color:#dc2626; }
.vq-result-your-answer, .vq-result-correct-answer {
  font-size:14px; color:var(--text-muted);
}
.vq-result-hint-label { font-size:12px; color:var(--text-muted); }
.vq-result-hint-value { font-style:italic; }
.vq-wrong-value       { color:#dc2626; text-decoration:line-through; }
.vq-result-correct-value {
  font-size:22px; font-weight:700; color:#f59e0b;
  animation:vq-reveal .3s ease;
}

@keyframes vq-reveal {
  from { opacity:0; transform:translateY(6px); }
  to   { opacity:1; transform:translateY(0); }
}

/* \u2550\u2550 Buttons \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
.vq-buttons { display:flex; flex-wrap:wrap; gap:10px; justify-content:center; padding:0 28px 28px; }
.vq-btn { padding:10px 22px; border-radius:8px; border:none; font-size:14px; font-weight:600; cursor:pointer; transition:all .15s ease; }
.vq-btn:hover  { transform:translateY(-1px); box-shadow:0 4px 12px rgba(0,0,0,.15); }
.vq-btn:active { transform:translateY(0); }
.vq-btn-primary   { background:linear-gradient(135deg,#f59e0b,#ef4444); color:white; }
.vq-btn-skip      { background:var(--background-modifier-border); color:var(--text-muted); }
.vq-btn-cancel    { background:transparent; color:var(--text-muted); border:1px solid var(--background-modifier-border); }
.vq-btn-outline   { background:transparent; color:var(--text-normal); border:1px solid var(--background-modifier-border); padding:8px 14px; font-size:13px; white-space:nowrap; }
.vq-btn-disabled  { opacity:.4; cursor:not-allowed; }
.vq-btn-start     { width:100%; padding:13px; font-size:16px; }

/* \u2550\u2550 Finish Card \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
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

/* \u2550\u2550 Launch Modal \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
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

/* \u2550\u2550 Folder Browser \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
.vq-browser-modal { width:420px !important; max-width:95vw !important; border-radius:16px !important; overflow:hidden; }
.vq-browser-modal .modal-content { padding:0 !important; background:var(--background-primary); }
.vq-browser-header { padding:14px 18px 10px; border-bottom:1px solid var(--background-modifier-border); background:var(--background-secondary); }
.vq-browser-title  { font-size:15px; font-weight:700; color:var(--text-normal); margin-bottom:6px; }
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

/* \u2550\u2550 Settings \u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550 */
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