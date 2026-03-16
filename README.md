# 🇪🇸↔🇩🇪 Vokabel-Quiz Plugin für Obsidian

Ein vollständiger interaktiver Vokabeltrainer für Spanisch-Deutsch direkt in Obsidian.

---

## ✨ Features

- 📋 **Lädt Vokabeln** aus einer Markdown-Datei in deinem Vault
- 🎴 **Karteikarten-Quiz** mit Aufdecken der Antwort
- 🔀 **3 Abfragerichtungen**: Spanisch → Deutsch, Deutsch → Spanisch, Zufall
- 📊 **Statistiken**: Richtig, Falsch, Übersprungen, Trefferquote, Zeit
- 🔁 **Falsch gewusste Karten** kommen erneut in den Stack
- ⚙️ **Einstellungen** direkt in Obsidian konfigurierbar
- 🎨 **Dark/Light Mode** kompatibel

---

## 🚀 Installation

### Option A: Manuell (ohne Build)

1. Lade die Release-Dateien herunter (`main.js`, `manifest.json`)
2. Erstelle einen Ordner: `<dein-vault>/.obsidian/plugins/vocab-quiz-es-de/`
3. Kopiere `main.js` und `manifest.json` in diesen Ordner
4. Obsidian → Einstellungen → Community Plugins → Installierte Plugins → aktivieren

### Option B: Selbst bauen

```bash
# Voraussetzungen: Node.js >= 16

git clone <dieses-repo>
cd vocab-quiz-es-de

npm install
npm run build
```

Danach `main.js` und `manifest.json` in deinen Plugin-Ordner kopieren.

---

## 📄 Vokabeldatei erstellen

Das Plugin liest eine Markdown-Datei aus deinem Vault. Unterstützte Formate:

### Format 1: Markdown-Tabelle (empfohlen)

```markdown
| Spanisch | Deutsch |
|----------|---------|
| hola | Hallo |
| gracias | Danke |
| casa | Haus |
```

### Format 2: Einfache Textdatei mit Trennzeichen

```
hola | Hallo
gracias | Danke
casa | Haus
```

**Hinweise:**
- Die **erste Spalte** ist immer Spanisch, die **zweite** Deutsch
- Zeilen mit `#` oder `//` werden als Kommentare ignoriert
- Tabellentrennzeilen (`|---|---|`) werden automatisch übersprungen
- Trennzeichen kann in den Einstellungen angepasst werden (Standard: `|`)

---

## ⚙️ Einstellungen

| Einstellung | Beschreibung |
|---|---|
| **Vokabeldatei** | Pfad zur `.md`-Datei in deinem Vault, z.B. `Sprachen/vokabeln.md` |
| **Abfragerichtung** | 🎲 Zufall / 🇪🇸 ES→DE / 🇩🇪 DE→ES |
| **Trennzeichen** | Trennzeichen für einfache Textdateien (Standard: `\|`) |

Unter den Einstellungen gibt es auch einen Button **"Beispieldatei erstellen"**, der automatisch eine Demo-Vokabeldatei im konfigurierten Pfad anlegt.

---

## 🎮 Benutzung

### Quiz starten

**3 Wege:**
1. **Ribbon-Icon** (Sprachensymbol) in der linken Seitenleiste klicken
2. **Command Palette** (`Strg/Cmd + P`) → "Vokabel-Quiz starten"
3. Command Palette → spezifische Richtung wählen

### Im Quiz

| Aktion | Erklärung |
|---|---|
| **Antwort anzeigen** | Deckt die Übersetzung auf |
| **✓ Gewusst** | Karte aus dem Stack entfernen |
| **✗ Nicht gewusst** | Karte an zufälliger Position zurück in den Stack |
| **Überspringen** | Karte überspringen (zählt als übersprungen) |
| **Beenden** | Quiz abbrechen |

### Ergebnis

Am Ende siehst du:
- Anzahl richtig / falsch / übersprungen
- Trefferquote in Prozent
- Benötigte Zeit
- Option für eine weitere Runde

---

## 📁 Projektstruktur

```
vocab-quiz-es-de/
├── main.ts          ← Vollständiger Plugin-Code (TypeScript)
├── main.js          ← Compiliertes Bundle (wird generiert)
├── manifest.json    ← Plugin-Metadaten für Obsidian
├── package.json     ← Node.js Dependencies
├── tsconfig.json    ← TypeScript-Konfiguration
├── esbuild.config.mjs ← Build-Konfiguration
└── vokabeln-beispiel.md ← Beispiel-Vokabeldatei
```

---

## 📜 Lizenz

MIT License – frei zu verwenden, anpassen und teilen.
