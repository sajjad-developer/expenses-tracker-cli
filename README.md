# `expenses-tracker-cli` 💰

<p align="center">
  <img src="./assets/banner/expense-banner.png" alt="expenses-tracker-cli banner showcasing a simple command-line expense tracker" width="100%" />
</p>

<h1 align="center">expenses-tracker-cli</h1>

<p align="center">
  <strong>💸 Take control of your finances! Effortlessly track, categorize, and analyze your personal expenses right from your terminal. 📈</strong>
</p>

<p align="center">
  <code>expenses-tracker-cli</code> — A beginner-friendly yet powerful CLI tool that simplifies personal expense tracking. Add transactions, view totals, manage currencies, export reports, and more — all from your terminal.
</p>

<p align="center">
<a href="https://www.npmjs.com/package/expenses-tracker-cli" target="_blank" rel="noopener noreferrer">
  <img src="https://img.shields.io/npm/v/expenses-tracker-cli?label=npm%20version" alt="npm version" title="Current npm version" />
</a>
<a href="https://github.com/sajjad-developer/expenses-tracker-cli/actions/workflows/ci.yml" target="_blank" rel="noopener noreferrer">
  <img src="https://github.com/sajjad-developer/expenses-tracker-cli/actions/workflows/ci.yml/badge.svg" alt="build status" title="Build status" />
</a>
<a href="https://github.com/sajjad-developer/expenses-tracker-cli/blob/main/LICENSE" target="_blank" rel="noopener noreferrer">
  <img src="https://img.shields.io/github/license/sajjad-developer/expenses-tracker-cli?label=license" alt="license" title="License information" />
</a>
<a href="https://github.com/sajjad-developer/expenses-tracker-cli/issues?q=is%3Aissue+is%3Aopen+label%3A%22good+first+issue%22" target="_blank" rel="noopener noreferrer">
  <img src="https://img.shields.io/github/issues/sajjad-developer/expenses-tracker-cli/good%20first%20issue?label=good%20first%20issue" alt="good first issues" title="Good first issues" />
</a>
<a href="https://github.com/sajjad-developer/expenses-tracker-cli/issues?q=is%3Aissue+is%3Aopen+label%3Ahelp-wanted" target="_blank" rel="noopener noreferrer">
  <img src="https://img.shields.io/github/issues/sajjad-developer/expenses-tracker-cli/help-wanted?label=help%20wanted" alt="help wanted" title="Help wanted issues" />
</a>
<a href="https://packagephobia.com/result?p=expenses-tracker-cli" target="_blank" rel="noopener noreferrer">
  <img src="https://packagephobia.com/badge?p=expenses-tracker-cli" alt="install size" title="Install size (via PackagePhobia)" />
</a>
<a href="https://www.npmjs.com/package/expenses-tracker-cli" target="_blank" rel="noopener noreferrer">
  <img src="https://img.shields.io/npm/dt/expenses-tracker-cli?label=total%20downloads" alt="total npm downloads" title="Total npm downloads" />
<a href="https://github.com/sajjad-developer/expenses-tracker-cli/stargazers" target="_blank" rel="noopener noreferrer"><img src="https://img.shields.io/github/stars/sajjad-developer/expenses-tracker-cli?style=social" alt="GitHub stars" title="Like this project? Star it on GitHub!" /></a>
</a>
</p>

---

## 📑 Table of Contents

- [✨ Features](#-features)
- [🚀 Live Demonstration](#-live-demonstration)
- [📦 Installation](#-installation)
  - [📝 Node.js and VS Code Setup (for non-programmers)](#step-1-install-nodejs)
  - [🌍 Global Installation](#option-1-global-installation)
  - [🚀 Run Directly Using npx](#option-2-run-directly-using-npx)
- [📋 Usage](#-usage)
- [📝 Commands](#-commands)
- [✅ Quality Assurance](#-quality-assurance)
- [🤝 Contributing](#-contributing)
- [☕ Support My Work](#-support-my-work)
- [📄 License](#-license)

---

## ✨ Features

- Add new expenses with descriptions and currency.
- Intelligent currency handling with ISO 4217 suggestions.
- Filter expenses by date, day, month, week, or year.
- Undo/redo support for safe data manipulation.
- View totals grouped by currency.
- Export to clean PDF or CSV reports.
- Built-in manual generation via `manual` command.
- Clear CLI prompts, smart error messages, and typo suggestions.

---

## 🚀 Live Demonstration

A picture is worth a thousand words, and a GIF is worth a million. See for yourself how expenses-tracker-cli makes financial tracking simple and powerful.

### 💱 Interactive Currency Conversion

_(Your GIF showing the `expense change-currency --currency EUR` flow would go here)_

### 📄 PDF Export and Auto-Open

_(Your GIF showing the `expense export --pdf --open` flow would go here)_

### 🔎 Advanced Filtering

_(Your GIF showing a `list` or `total` command with filters would go here)_

---

## 📦 Installation

**Note**: If you're already familiar with **VS Code** and **Node.js**, you can skip the following installation steps and jump straight to the [Global Installation](#option-1-global-installation) or [Run Directly Using npx](#option-2-run-directly-using-npx) section.

Before using the **Bachelor Meal CLI Tool**, you'll need to have **Node.js** and **VS Code** installed on your computer. Follow the instructions below to set everything up.

### Step 1: Install Node.js

1. Visit the [Node.js download page](https://nodejs.org/).
2. Download the version labeled **LTS** (Long-Term Support).
3. Run the installer and follow the prompts to complete the installation.

You can verify that Node.js is installed by opening your terminal and typing the following command:

```bash
node -v
```

If you see the version number, Node.js is installed correctly.

### Step 2: Install VS Code (Visual Studio Code)

1. Visit the [VS Code download page](https://code.visualstudio.com/).
2. Download and install the appropriate version for your operating system.
3. Once installed, open any existing or newly created folder with the VS Code editor. To open the integrated terminal, press Ctrl + `on Windows (or Cmd +` on Mac), or use Ctrl + J on Windows (or Cmd + J on Mac) to toggle the panel that contains the terminal.

### Option 1: Global Installation

```bash
npm install -g expenses-tracker-cli
```

### Option 2: Run Directly Using `npx`

```bash
npx expenses-tracker-cli <command>
```

---

## 📋 Usage

To view usage instructions:

```bash
expense
```

Example output:

```
Welcome to expenses-tracker-cli! Your personal expense tracker.
--------------------------------------------------
To get started, try one of these commands:
  expense add <amount> <description>       Add a new expense
  expense list                             View all your expenses
  expense total                            See your total spending

For help on a command: expense <command> --help
```

---

## 📝 Commands

- `expense reset` – Clears all stored expenses (with confirmation prompt)

- `expense add <amount> <description>` – Add a new expense
- `expense list` – Show expenses with filtering options
- `expense total` – Show totals by currency
- `expense change-currency` – Set base currency and convert data
- `expense edit` – Edit an existing record
- `expense delete` – Soft-delete an entry
- `expense recover` – Recover a deleted entry
- `expense export --csv / --pdf` – Export data
- `expense undo` / `redo` – Undo/redo last action
- `expense manual` – Generate user manual PDF

---

---

## ✅ Our Approach to Quality

This CLI tool has been rigorously tested to ensure all features work as expected. Due to the highly interactive nature of many commands (e.g., multi-step prompts for currency conversion), we have focused on end-to-end manual testing, which best simulates the real-world user experience.

Every command has been manually verified, including:

- Adding, editing, deleting, and recovering expenses.
- Listing and totaling with all filter combinations.
- The full interactive currency conversion flow.
- Successful generation and content of PDF and CSV exports.
- The undo/redo/reset functionality.

---

## 🤝 Contributing

We welcome all contributions!  
If you'd like to fix a bug, suggest a new feature, or help with documentation:

1. Read [CONTRIBUTING.md](./CONTRIBUTING.md)
2. Fork the repo and make your changes
3. Submit a pull request

> 💡 Check issues labeled `good first issue` or `help wanted`.

---

## ☕ Support My Work

✨ This project is developed and maintained by me during my personal time.  
If **expenses-tracker-cli** has saved you time or improved your workflow, please consider leaving a **voluntary tip** to support ongoing development:

[![☕ Tip the Developer ❤️](https://img.shields.io/badge/%E2%98%95%EF%B8%8F%20Tip%20the%20Developer%20%E2%9D%A4%EF%B8%8F-brightgreen "Your support helps keep the expenses-tracker-cli tool free, polished, and open for everyone.")](https://eco-starfish-coder.com/tip)

> ⚠️ Tips are optional and go directly to the maintainer. This project is free and open-source.

---

## 📄 License

Licensed under the **MIT License**. See the [LICENSE](LICENSE) file for more info.
