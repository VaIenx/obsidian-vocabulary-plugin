import {
	App,
	Modal,
	Notice,
	Plugin,
	PluginSettingTab,
	Setting,
	TFile,
} from "obsidian";

// ─── Types ────────────────────────────────────────────────────────────────────

interface VocabEntry {
	spanish: string;
	german: string;
}

type QuizDirection = "spanish" | "german" | "random";

interface VocabQuizSettings {
	vocabFilePath: string;
	quizDirection: QuizDirection;
	delimiter: string;
	strictMode: boolean; // if false: small typos accepted
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: VocabQuizSettings = {
	vocabFilePath: "vokabeln.md",
	quizDirection: "random",
	delimiter: "|",
	strictMode: false,
};

// ─── CSV / Table Parser ───────────────────────────────────────────────────────

function parseVocabFile(content: string, delimiter: string): VocabEntry[] {
	const entries: VocabEntry[] = [];
	const lines = content.split("\n");

	for (const rawLine of lines) {
		const line = rawLine.trim();
		if (!line || line.startsWith("#") || line.startsWith("//")) continue;
		if (/^[\|\s\-:]+$/.test(line)) continue;

		let parts: string[];
		if (line.startsWith("|") && line.endsWith("|")) {
			parts = line
				.slice(1, -1)
				.split("|")
				.map((p) => p.trim());
		} else {
			parts = line.split(delimiter).map((p) => p.trim());
		}

		if (parts.length >= 2 && parts[0] && parts[1]) {
			entries.push({ spanish: parts[0], german: parts[1] });
		}
	}

	return entries;
}

// ─── Answer Checker ───────────────────────────────────────────────────────────

/**
 * Normalize a string for comparison:
 * - lowercase
 * - collapse multiple spaces / trim
 * - strip leading articles: der/die/das/ein/eine/un/una/el/la/los/las
 * - keep special chars but do NOT strip them (ä ü ö á é í ó ú ñ are part of the answer)
 */
function normalize(s: string): string {
	return s
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim()
		.replace(/^(der|die|das|ein|eine|el|la|los|las|un|una)\s+/i, "");
}

/**
 * Levenshtein distance between two strings.
 */
function levenshtein(a: string, b: string): number {
	const m = a.length, n = b.length;
	const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
		Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
	);
	for (let i = 1; i <= m; i++)
		for (let j = 1; j <= n; j++)
			dp[i][j] =
				a[i - 1] === b[j - 1]
					? dp[i - 1][j - 1]
					: 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
	return dp[m][n];
}

/**
 * Check whether `input` matches any acceptable answer from `correct`.
 * `correct` may contain slash-separated alternatives: "wollen / lieben"
 * Returns: "correct" | "almost" | "wrong"
 * "almost" = off by 1–2 chars (only in non-strict mode)
 */
function checkAnswer(
	input: string,
	correct: string,
	strict: boolean
): "correct" | "almost" | "wrong" {
	const normInput = normalize(input);
	// Split on "/" or "," to get multiple valid answers
	const alternatives = correct
		.split(/[\/,]/)
		.map((a) => normalize(a.trim()))
		.filter(Boolean);

	for (const alt of alternatives) {
		if (normInput === alt) return "correct";
	}

	if (!strict) {
		for (const alt of alternatives) {
			// Allow 1 typo per 6 chars, max 2
			const maxDist = Math.min(2, Math.floor(alt.length / 6));
			if (maxDist > 0 && levenshtein(normInput, alt) <= maxDist) return "almost";
		}
	}

	return "wrong";
}

// ─── Quiz Modal ───────────────────────────────────────────────────────────────

type CardState = "question" | "result-correct" | "result-almost" | "result-wrong";

class QuizModal extends Modal {
	private vocab: VocabEntry[];
	private direction: QuizDirection;
	private queue: VocabEntry[];
	private current: VocabEntry | null = null;
	private correct = 0;
	private incorrect = 0;
	private skipped = 0;
	private startTime: number;
	private currentDirection: "spanish" | "german" = "spanish";
	private cardState: CardState = "question";
	private lastInput = "";
	private strictMode: boolean;

	constructor(app: App, vocab: VocabEntry[], direction: QuizDirection, strictMode: boolean) {
		super(app);
		this.vocab = vocab;
		this.direction = direction;
		this.strictMode = strictMode;
		this.queue = this.shuffle([...vocab]);
		this.startTime = Date.now();
	}

	private shuffle<T>(arr: T[]): T[] {
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

	private nextCard() {
		this.cardState = "question";
		this.lastInput = "";
		if (this.queue.length === 0) { this.renderFinished(); return; }
		this.current = this.queue.shift()!;
		this.currentDirection =
			this.direction === "random"
				? Math.random() < 0.5 ? "spanish" : "german"
				: this.direction;
		this.render();
	}

	private submitAnswer(input: string) {
		if (!this.current) return;
		const correctText =
			this.currentDirection === "spanish"
				? this.current.german
				: this.current.spanish;

		const result = checkAnswer(input, correctText, this.strictMode);
		this.lastInput = input;

		if (result === "correct") {
			this.correct++;
			this.cardState = "result-correct";
		} else if (result === "almost") {
			// "almost" counts as correct but shown with a hint
			this.correct++;
			this.cardState = "result-almost";
		} else {
			this.incorrect++;
			// Requeue for another try
			const pos = Math.floor(Math.random() * (this.queue.length + 1));
			this.queue.splice(pos, 0, this.current);
			this.cardState = "result-wrong";
		}

		this.render();
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		const total = this.vocab.length;
		const done = this.correct + this.incorrect + this.skipped;

		// ── Header ──
		const header = contentEl.createDiv("vq-header");
		header.createDiv("vq-logo").setText("🇪🇸 ↔ 🇩🇪");
		const stats = header.createDiv("vq-stats");
		stats.createSpan({ cls: "vq-stat vq-correct",   text: `✓ ${this.correct}` });
		stats.createSpan({ cls: "vq-stat vq-incorrect", text: `✗ ${this.incorrect}` });
		stats.createSpan({ cls: "vq-stat vq-skipped",   text: `– ${this.skipped}` });
		stats.createSpan({ cls: "vq-stat vq-remaining", text: `${this.queue.length + (this.cardState === "question" ? 1 : 0)} übrig` });

		// ── Progress bar ──
		const fill = contentEl.createDiv("vq-progress-track").createDiv("vq-progress-fill");
		fill.style.width = `${total > 0 ? Math.round(done / total * 100) : 0}%`;

		// ── Card ──
		const card = contentEl.createDiv("vq-card");
		if (this.cardState === "result-correct") card.addClass("vq-card-correct");
		if (this.cardState === "result-almost")  card.addClass("vq-card-almost");
		if (this.cardState === "result-wrong")   card.addClass("vq-card-wrong");

		card.createDiv("vq-dir-label").setText(
			this.currentDirection === "spanish" ? "Spanisch → Deutsch" : "Deutsch → Spanisch"
		);

		card.createDiv("vq-question").setText(
			this.currentDirection === "spanish"
				? this.current!.spanish
				: this.current!.german
		);

		const correctText =
			this.currentDirection === "spanish"
				? this.current!.german
				: this.current!.spanish;

		if (this.cardState === "question") {
			// ── Input area ──
			const inputWrap = card.createDiv("vq-input-wrap");
			const input = inputWrap.createEl("input", {
				cls: "vq-answer-input",
				type: "text",
				placeholder: "Übersetzung eingeben …",
			}) as HTMLInputElement;

			input.focus();

			const submitBtn = inputWrap.createEl("button", {
				cls: "vq-btn vq-btn-primary vq-btn-check",
				text: "Prüfen ↵",
			});

			const doSubmit = () => {
				const val = input.value.trim();
				if (!val) return;
				this.submitAnswer(val);
			};

			submitBtn.onclick = doSubmit;
			input.addEventListener("keydown", (e) => {
				if (e.key === "Enter") { e.preventDefault(); doSubmit(); }
			});

		} else {
			// ── Result area ──
			const resultWrap = card.createDiv("vq-result-wrap");

			if (this.cardState === "result-correct") {
				resultWrap.createDiv("vq-result-icon").setText("✓");
				resultWrap.createDiv("vq-result-msg").setText("Richtig!");
			} else if (this.cardState === "result-almost") {
				resultWrap.createDiv("vq-result-icon").setText("〜");
				resultWrap.createDiv("vq-result-msg").setText("Fast! Kleiner Tippfehler");
				const yourAnswer = resultWrap.createDiv("vq-result-your-answer");
				yourAnswer.createSpan({ cls: "vq-result-hint-label", text: "Deine Antwort: " });
				yourAnswer.createSpan({ cls: "vq-result-hint-value", text: this.lastInput });
			} else {
				resultWrap.createDiv("vq-result-icon").setText("✗");
				resultWrap.createDiv("vq-result-msg").setText("Falsch");
				const yourAnswer = resultWrap.createDiv("vq-result-your-answer");
				yourAnswer.createSpan({ cls: "vq-result-hint-label", text: "Deine Antwort: " });
				yourAnswer.createSpan({ cls: "vq-result-hint-value vq-wrong-value", text: this.lastInput });
			}

			const correctWrap = resultWrap.createDiv("vq-result-correct-answer");
			correctWrap.createSpan({ cls: "vq-result-hint-label", text: "Richtig: " });
			correctWrap.createSpan({ cls: "vq-result-correct-value", text: correctText });
		}

		// ── Buttons ──
		const buttons = contentEl.createDiv("vq-buttons");

		if (this.cardState === "question") {
			const skipBtn = buttons.createEl("button", {
				cls: "vq-btn vq-btn-skip",
				text: "Überspringen",
			});
			skipBtn.onclick = () => {
				this.skipped++;
				this.nextCard();
			};
		} else {
			const nextBtn = buttons.createEl("button", {
				cls: "vq-btn vq-btn-primary",
				text: this.queue.length === 0 ? "Ergebnis anzeigen →" : "Weiter →",
			});
			nextBtn.onclick = () => this.nextCard();
		}

		buttons.createEl("button", {
			cls: "vq-btn vq-btn-cancel",
			text: "Beenden",
		}).onclick = () => this.close();
	}

	private renderFinished() {
		const { contentEl } = this;
		contentEl.empty();

		const elapsed = Math.round((Date.now() - this.startTime) / 1000);
		const mins = Math.floor(elapsed / 60);
		const secs = elapsed % 60;
		const timeStr = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
		const total = this.correct + this.incorrect;
		const pct = total > 0 ? Math.round(this.correct / total * 100) : 0;

		const card = contentEl.createDiv("vq-finish-card");
		card.createDiv("vq-finish-icon").setText("🎉");
		card.createDiv("vq-finish-title").setText("Quiz abgeschlossen!");

		const summary = card.createDiv("vq-finish-summary");
		for (const [label, val] of [
			["Richtig", `${this.correct}`],
			["Falsch",  `${this.incorrect}`],
			["Übersprungen", `${this.skipped}`],
			["Trefferquote", `${pct}%`],
			["Zeit", timeStr],
		] as [string, string][]) {
			const row = summary.createDiv("vq-finish-row");
			row.createSpan({ cls: "vq-finish-label", text: label });
			row.createSpan({ cls: "vq-finish-value", text: val });
		}

		const scoreBar = card.createDiv("vq-score-bar-track").createDiv("vq-score-bar-fill");
		scoreBar.style.width = `${pct}%`;
		scoreBar.style.background = pct >= 80 ? "#4ade80" : pct >= 50 ? "#facc15" : "#f87171";

		const btnRow = card.createDiv("vq-finish-buttons");
		btnRow.createEl("button", { cls: "vq-btn vq-btn-primary", text: "Nochmal" }).onclick = () => {
			this.correct = 0; this.incorrect = 0; this.skipped = 0;
			this.startTime = Date.now();
			this.queue = this.shuffle([...this.vocab]);
			this.nextCard();
		};
		btnRow.createEl("button", { cls: "vq-btn vq-btn-cancel", text: "Schließen" })
			.onclick = () => this.close();
	}
}

// ─── Folder Browser Modal ─────────────────────────────────────────────────────

class FolderBrowserModal extends Modal {
	private currentPath: string;
	private onSelect: (path: string) => void;

	constructor(app: App, startPath: string, onSelect: (path: string) => void) {
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

	private getChildren(folderPath: string) {
		const folder =
			folderPath === ""
				? this.app.vault.getRoot()
				: this.app.vault.getAbstractFileByPath(folderPath);
		if (!folder || !("children" in folder)) return { folders: [] as any[], files: [] as any[] };
		const folders: any[] = [], files: any[] = [];
		for (const child of (folder as any).children) {
			if ("children" in child) folders.push(child);
			else if (child.extension === "md") files.push(child);
		}
		folders.sort((a: any, b: any) => a.name.localeCompare(b.name));
		files.sort((a: any, b: any) => a.name.localeCompare(b.name));
		return { folders, files };
	}

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		const header = contentEl.createDiv("vq-browser-header");
		header.createDiv("vq-browser-title").setText("📂 Vokabeldatei auswählen");
		const bc = header.createDiv("vq-browser-breadcrumb");
		const rootCrumb = bc.createSpan({ cls: "vq-crumb vq-crumb-link", text: "⌂ Vault" });
		rootCrumb.onclick = () => { this.currentPath = ""; this.render(); };

		if (this.currentPath) {
			const parts = this.currentPath.split("/");
			for (let i = 0; i < parts.length; i++) {
				bc.createSpan({ cls: "vq-crumb-sep", text: " › " });
				const crumbPath = parts.slice(0, i + 1).join("/");
				const isLast = i === parts.length - 1;
				const crumb = bc.createSpan({
					cls: isLast ? "vq-crumb vq-crumb-current" : "vq-crumb vq-crumb-link",
					text: parts[i],
				});
				if (!isLast) crumb.onclick = () => { this.currentPath = crumbPath; this.render(); };
			}
		}

		const list = contentEl.createDiv("vq-browser-list");
		const { folders, files } = this.getChildren(this.currentPath);

		if (this.currentPath !== "") {
			const back = list.createDiv("vq-browser-row vq-browser-row-back");
			back.createSpan({ cls: "vq-browser-icon", text: "↩" });
			back.createSpan({ cls: "vq-browser-name", text: ".. zurück" });
			back.onclick = () => {
				this.currentPath = this.currentPath.split("/").slice(0, -1).join("/");
				this.render();
			};
		}

		if (folders.length === 0 && files.length === 0)
			list.createDiv({ cls: "vq-browser-empty", text: "Keine Ordner oder .md-Dateien hier." });

		for (const folder of folders) {
			const row = list.createDiv("vq-browser-row vq-browser-row-folder");
			row.createSpan({ cls: "vq-browser-icon", text: "📁" });
			row.createSpan({ cls: "vq-browser-name", text: folder.name });
			row.createSpan({ cls: "vq-browser-chevron", text: "›" });
			row.onclick = () => { this.currentPath = folder.path; this.render(); };
		}

		for (const file of files) {
			const row = list.createDiv("vq-browser-row vq-browser-row-file");
			row.createSpan({ cls: "vq-browser-icon", text: "📄" });
			row.createSpan({ cls: "vq-browser-name", text: file.name });
			row.onclick = () => { this.onSelect(file.path); this.close(); };
		}

		const footer = contentEl.createDiv("vq-browser-footer");
		footer.createEl("button", { cls: "vq-btn vq-btn-cancel", text: "Abbrechen" })
			.onclick = () => this.close();
	}
}

// ─── Launch Modal ─────────────────────────────────────────────────────────────

class LaunchModal extends Modal {
	private plugin: VocabQuizPlugin;
	private selectedDirection: QuizDirection;

	constructor(app: App, plugin: VocabQuizPlugin) {
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

	private render() {
		const { contentEl } = this;
		contentEl.empty();

		const header = contentEl.createDiv("vq-launch-header");
		header.createDiv("vq-launch-logo").setText("🇪🇸 ↔ 🇩🇪");
		header.createDiv("vq-launch-title").setText("Vokabel-Quiz");
		header.createDiv("vq-launch-sub").setText("Einstellungen für diese Runde");

		const body = contentEl.createDiv("vq-launch-body");
		const filePath = this.plugin.settings.vocabFilePath;

		// ── Datei ──
		const fileSection = body.createDiv("vq-launch-section");
		fileSection.createDiv({ cls: "vq-launch-label", text: "Vokabeldatei" });
		const picker = fileSection.createDiv("vq-launch-file-picker");
		const display = picker.createDiv("vq-launch-file-display");
		if (filePath) {
			const wrap = display.createDiv("vq-launch-file-name-wrap");
			wrap.createSpan({ cls: "vq-launch-file-icon", text: "📄" });
			const info = wrap.createDiv("vq-launch-file-info");
			info.createDiv({ cls: "vq-launch-file-name", text: filePath.split("/").pop() ?? filePath });
			info.createDiv({ cls: "vq-launch-file-path", text: filePath });
		} else {
			display.createSpan({ cls: "vq-launch-file-none", text: "⚠️ Keine Datei gewählt" });
		}
		picker.createEl("button", { cls: "vq-btn vq-btn-outline", text: "📂 Wählen" })
			.onclick = () => {
				const startFolder = filePath ? filePath.split("/").slice(0, -1).join("/") : "";
				new FolderBrowserModal(this.app, startFolder, async (path) => {
					this.plugin.settings.vocabFilePath = path;
					await this.plugin.saveSettings();
					this.render();
				}).open();
			};

		// ── Richtung ──
		const dirSection = body.createDiv("vq-launch-section");
		dirSection.createDiv({ cls: "vq-launch-label", text: "Abfragerichtung" });
		const dirOptions = dirSection.createDiv("vq-launch-dir-options");
		const directions: { value: QuizDirection; icon: string; label: string; sub: string }[] = [
			{ value: "random",  icon: "🎲", label: "Zufall",   sub: "Gemischt" },
			{ value: "spanish", icon: "🇪🇸", label: "ES → DE", sub: "Du siehst Spanisch" },
			{ value: "german",  icon: "🇩🇪", label: "DE → ES", sub: "Du siehst Deutsch" },
		];
		for (const opt of directions) {
			const card = dirOptions.createDiv({
				cls: `vq-dir-card ${this.selectedDirection === opt.value ? "vq-dir-card-active" : ""}`,
			});
			card.createDiv({ cls: "vq-dir-card-icon",  text: opt.icon });
			card.createDiv({ cls: "vq-dir-card-label", text: opt.label });
			card.createDiv({ cls: "vq-dir-card-sub",   text: opt.sub });
			card.onclick = () => { this.selectedDirection = opt.value; this.render(); };
		}

		// ── Footer ──
		const footer = contentEl.createDiv("vq-launch-footer");
		const startBtn = footer.createEl("button", {
			cls: "vq-btn vq-btn-primary vq-btn-start" + (!filePath ? " vq-btn-disabled" : ""),
			text: "▶  Quiz starten",
		});
		startBtn.disabled = !filePath;
		startBtn.onclick = async () => {
			if (!filePath) return;
			this.close();
			await this.plugin.startQuiz(this.selectedDirection);
		};
		if (!filePath)
			footer.createDiv({ cls: "vq-launch-hint", text: "Bitte zuerst eine Vokabeldatei auswählen." });
		footer.createEl("button", { cls: "vq-btn vq-btn-cancel", text: "Abbrechen" })
			.onclick = () => this.close();
	}
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────

class VocabQuizSettingTab extends PluginSettingTab {
	plugin: VocabQuizPlugin;

	constructor(app: App, plugin: VocabQuizPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;
		containerEl.empty();
		containerEl.createEl("h2", { text: "Vokabel-Quiz Einstellungen" });

		// ── File picker ──
		containerEl.createEl("h3", { text: "Vokabeldatei" });
		const wrap = containerEl.createDiv("vq-settings-file-wrap");
		const currentPath = this.plugin.settings.vocabFilePath;
		const display = wrap.createDiv("vq-settings-file-display");
		if (currentPath) {
			display.createSpan({ cls: "vq-settings-file-icon", text: "📄" });
			const info = display.createDiv("vq-settings-file-info");
			info.createDiv({ cls: "vq-settings-file-name", text: currentPath.split("/").pop() ?? currentPath });
			info.createDiv({ cls: "vq-settings-file-full", text: currentPath });
		} else {
			display.createSpan({ cls: "vq-settings-file-icon", text: "📂" });
			display.createDiv({ cls: "vq-settings-file-none", text: "Keine Datei ausgewählt" });
		}
		wrap.createEl("button", { cls: "vq-btn vq-btn-outline", text: "📂 Durchsuchen" })
			.onclick = () => {
				const startFolder = currentPath ? currentPath.split("/").slice(0, -1).join("/") : "";
				new FolderBrowserModal(this.app, startFolder, async (path) => {
					this.plugin.settings.vocabFilePath = path;
					await this.plugin.saveSettings();
					this.display();
				}).open();
			};

		new Setting(containerEl)
			.setName("Trennzeichen")
			.setDesc('Für einfache Textdateien (Standard: |). Alternativ ";" oder ",".')
			.addText((text) =>
				text.setPlaceholder("|")
					.setValue(this.plugin.settings.delimiter)
					.onChange(async (value) => {
						this.plugin.settings.delimiter = value || "|";
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Strenger Modus")
			.setDesc("Wenn aktiviert, werden kleine Tippfehler (1–2 Zeichen) nicht mehr als richtig gewertet.")
			.addToggle((toggle) =>
				toggle.setValue(this.settings.strictMode)
					.onChange(async (value) => {
						this.settings.strictMode = value;
						await this.plugin.saveSettings();
					})
			);

		new Setting(containerEl)
			.setName("Beispieldatei erstellen")
			.setDesc("Erstellt eine Demo-Datei mit Spanisch-Deutsch-Vokabeln.")
			.addButton((btn) =>
				btn.setButtonText("Erstellen").onClick(async () => {
					await this.plugin.createExampleFile();
					this.display();
				})
			);

		containerEl.createEl("h3", { text: "Dateiformat" });
		const help = containerEl.createDiv("vq-settings-help");
		help.createEl("p", { text: "Das Plugin unterstützt zwei Formate:" });
		help.createEl("strong", { text: "1. Markdown-Tabelle (empfohlen):" });
		help.createEl("pre").createEl("code", {
			text: "| Spanisch | Deutsch |\n|----------|---------|\n| hola     | Hallo   |\n| gracias  | Danke   |",
		});
		help.createEl("strong", { text: "2. Textdatei mit Trennzeichen:" });
		help.createEl("pre").createEl("code", { text: "hola | Hallo\ngracias | Danke\ncasa | Haus" });
		help.createEl("p", { text: "💡 Zeilen mit # oder // werden als Kommentare ignoriert." });
		help.createEl("p", { text: "💡 Slash-getrennte Alternativen werden alle akzeptiert: z.B. \"wollen / lieben\"." });
	}
}

// ─── Main Plugin ──────────────────────────────────────────────────────────────

export default class VocabQuizPlugin extends Plugin {
	settings: VocabQuizSettings = DEFAULT_SETTINGS;

	async onload() {
		await this.loadSettings();

		this.addRibbonIcon("languages", "Vokabel-Quiz starten", () => {
			new LaunchModal(this.app, this).open();
		});

		this.addCommand({
			id: "start-vocab-quiz",
			name: "Vokabel-Quiz starten",
			callback: () => { new LaunchModal(this.app, this).open(); },
		});

		this.addCommand({
			id: "start-vocab-quiz-spanish",
			name: "Quiz: Spanisch → Deutsch",
			callback: async () => { await this.startQuiz("spanish"); },
		});

		this.addCommand({
			id: "start-vocab-quiz-german",
			name: "Quiz: Deutsch → Spanisch",
			callback: async () => { await this.startQuiz("german"); },
		});

		this.addCommand({
			id: "start-vocab-quiz-random",
			name: "Quiz: Zufällige Richtung",
			callback: async () => { await this.startQuiz("random"); },
		});

		this.addSettingTab(new VocabQuizSettingTab(this.app, this));
		this.injectStyles();
	}

	async startQuiz(direction?: QuizDirection) {
		const dir = direction ?? this.settings.quizDirection;
		const path = this.settings.vocabFilePath;
		const file = this.app.vault.getAbstractFileByPath(path);

		if (!file || !(file instanceof TFile)) {
			new Notice(`❌ Vokabeldatei nicht gefunden: "${path}"`);
			return;
		}

		const content = await this.app.vault.read(file);
		const vocab = parseVocabFile(content, this.settings.delimiter);

		if (vocab.length === 0) {
			new Notice(`⚠️ Keine Vokabeln in "${path}" gefunden. Bitte Format prüfen.`);
			return;
		}

		new Notice(`✅ ${vocab.length} Vokabeln geladen. Quiz startet!`);
		new QuizModal(this.app, vocab, dir, this.settings.strictMode).open();
	}

	async createExampleFile() {
		const path = this.settings.vocabFilePath || "vokabeln.md";
		const content = `# Spanisch-Deutsch Vokabeln\n\n| Spanisch | Deutsch |\n|----------|---------|\n| hola | Hallo |\n| adiós | Auf Wiedersehen |\n| buenos días | Guten Morgen |\n| gracias | Danke |\n| de nada | Bitte / Gern geschehen |\n| por favor | Bitte |\n| perdón | Entschuldigung |\n| sí | Ja |\n| no | Nein |\n| casa | Haus |\n| libro | Buch |\n| agua | Wasser |\n| comida | Essen |\n| amigo | Freund |\n| trabajo | Arbeit |\n| tiempo | Zeit / Wetter |\n| ciudad | Stadt |\n| dinero | Geld |\n| hablar | sprechen |\n| comer | essen |\n| vivir | leben |\n| querer | wollen / lieben |\n| poder | können |\n| ir | gehen |\n| venir | kommen |\n| hacer | machen / tun |\n| tener | haben |\n| ser | sein (dauerhaft) |\n| estar | sein (vorübergehend) |\n| grande | groß |\n`;
		try {
			if (this.app.vault.getAbstractFileByPath(path)) {
				new Notice(`⚠️ Datei existiert bereits: "${path}"`);
				return;
			}
			const dir = path.split("/").slice(0, -1).join("/");
			if (dir) { try { await this.app.vault.createFolder(dir); } catch {} }
			await this.app.vault.create(path, content);
			if (!this.settings.vocabFilePath) {
				this.settings.vocabFilePath = path;
				await this.saveSettings();
			}
			new Notice(`✅ Beispieldatei erstellt: "${path}"`);
		} catch (e) {
			new Notice(`❌ Fehler: ${e}`);
		}
	}

	private injectStyles() {
		const el = document.createElement("style");
		el.id = "vocab-quiz-styles";
		el.textContent = QUIZ_STYLES;
		document.head.appendChild(el);
	}

	onunload() {
		document.getElementById("vocab-quiz-styles")?.remove();
	}

	async loadSettings() {
		this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
	}

	async saveSettings() {
		await this.saveData(this.settings);
	}
}

// ─── Styles ───────────────────────────────────────────────────────────────────

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

/* ══ Card ════════════════════════════════════════════════ */
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

/* ══ Input area ══════════════════════════════════════════ */
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

/* ══ Result area ══════════════════════════════════════════ */
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

/* ══ Buttons ═════════════════════════════════════════════ */
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

/* ══ Finish Card ═════════════════════════════════════════ */
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

/* ══ Launch Modal ════════════════════════════════════════ */
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

/* ══ Folder Browser ══════════════════════════════════════ */
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

/* ══ Settings ════════════════════════════════════════════ */
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