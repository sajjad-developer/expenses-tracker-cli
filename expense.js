#!/usr/bin/env node

import chalk from "chalk";
import { execSync } from "child_process";
import { Command } from "commander";
import fs from "fs";
import { createRequire } from "module";
import os from "os";
import path from "path";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import readline from "readline";
import { fileURLToPath } from "url";

// Declare the program at the top
const program = new Command();

// --- THE KEY CHANGE: Disable Commander's automatic help option for all commands ---
program.helpOption(false); // This stops Commander from adding -h, --help to all commands.
program.addHelpCommand(false); // <--- ADDED: Prevents Commander from creating the 'help' command entry

// Define command examples - NEWLY ADDED BLOCK
const commandExamples = {
  add: 'expense add 50 "Groceries for the week" --currency USD',
  "change-currency": "expense change-currency --currency EUR",
  edit: 'expense edit 12 --amount 75.50 --description "Updated item" --currency GBP --date 2025-07-30',
  reset: "expense reset",
  delete: "expense delete 5",
  recover: "expense recover 5",
  list: "expense list --month 7 --year 2025 --reindex",
  total: "expense total --month 7 --year 2025 --all",
  export: "expense export --pdf --month 7 --open",
  manual: "expense manual --open", // Example for the manual command itself
  undo: "expense undo",
  redo: "expense redo",
};

// --- START: PRE-PARSING INTERCEPTION LOGIC FOR ALL COMMANDS ---
// This block runs BEFORE Commander's program.parse()
const rawArgs = process.argv.slice(2); // Get arguments excluding 'node' and 'expense.js'
const potentialCommand = rawArgs[0]; // The first argument, which could be a command or flag

// Helper function for Levenshtein Distance (remains unchanged)
function calculateLevenshteinDistance(s1, s2) {
  s1 = s1.toLowerCase();
  s2 = s2.toLowerCase();
  const costs = [];
  for (let i = 0; i <= s1.length; i++) {
    let lastValue = i;
    for (let j = 0; j <= s2.length; j++) {
      if (i === 0) {
        costs[j] = j;
      } else if (j > 0) {
        let newValue = costs[j - 1];
        if (s1.charAt(i - 1) !== s2.charAt(j - 1)) {
          newValue = Math.min(newValue, lastValue, costs[j]) + 1;
        }
        costs[j - 1] = lastValue;
        lastValue = newValue;
      }
    }
    if (i > 0) {
      costs[s2.length] = lastValue;
    }
  }
  return costs[s2.length];
}

// Function to provide command suggestions based on Levenshtein distance (remains unchanged)
function suggestCommand(unknownCmd, commandList) {
  let closestMatch = null;
  let minDistance = Infinity;
  const threshold = 2; // Adjust for more/less aggressive suggestions

  for (const cmd of commandList) {
    const distance = calculateLevenshteinDistance(unknownCmd, cmd);
    if (distance < minDistance && distance <= threshold) {
      minDistance = distance;
      closestMatch = cmd;
    }
  }
  return closestMatch;
}

// --- IMPORTANT: Manually list your commands and their aliases here ---
// This list needs to be kept in sync with your program.command definitions.
const knownCommandsAndAliases = new Set([
  "add",
  "a",
  "change-currency",
  "edit",
  "reset",
  "delete",
  "d",
  "recover",
  "list",
  "l",
  "total",
  "t",
  "export",
  "x",
  "manual", // <--- ADDED: Include the new manual command
  "undo", // ADDED: undo command
  "redo", // ADDED: redo command
]);

// Check if a command was provided as the first argument
if (potentialCommand) {
  // Define global flags that Commander itself should handle directly,
  // preventing our custom unknown command logic from interfering.
  const globalCommanderFlags = new Set(["--help", "-h", "--version", "-v"]);

  // If the potentialCommand is NOT a known command/alias
  // AND it's NOT one of the global flags that Commander should handle directly
  if (
    !knownCommandsAndAliases.has(potentialCommand) &&
    !globalCommanderFlags.has(potentialCommand)
  ) {
    // This block handles 'expense <typo>' OR 'expense <typo> --help'
    // since we're now letting Commander handle valid --help/--version on their own.

    const suggestion = suggestCommand(
      potentialCommand,
      Array.from(knownCommandsAndAliases),
    );

    if (suggestion) {
      console.error(
        chalk.red(
          `\n❌ Error: Unknown command '${potentialCommand}'. Did you mean ${chalk.bold(
            suggestion,
          )}?`,
        ),
      );
      console.error(
        chalk.blue(
          `For help with '${suggestion}', type: ${chalk.bold(
            `expense ${suggestion} --help`,
          )}`,
        ),
      );
    } else {
      console.error(
        chalk.red(`\n❌ Error: Unknown command '${potentialCommand}'.`),
      );
      console.error(
        chalk.blue(
          `\nFor a list of available commands, type: ${chalk.bold(
            "expense --help",
          )}`,
        ),
      );
    }
    process.exit(1); // Exit if it's a completely unknown command or an unknown command with a help flag
  }
  // If potentialCommand IS a known command, or if it's a global help/version flag,
  // then we let Commander's program.parse() handle it.
}
// --- END: PRE-PARSING INTERCEPTION LOGIC ---

// --- IMPORTANT: This configuration allows tests to use a temporary directory ---
const dataDir =
  process.env.EXPENSE_DATA_DIR || path.join(os.homedir(), ".expense");
const dataFile = path.join(dataDir, "data.json");
const configFile = path.join(dataDir, "config.json");
// NEW: Undo and Redo stack files
const undoStackFile = path.join(dataDir, "undoStack.json"); // ADDED
const redoStackFile = path.join(dataDir, "redoStack.json"); // ADDED

// Define __dirname for consistent path resolution in ES Modules (remains unchanged)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.join(path.dirname(__filename));

// Use createRequire to load all-currencies.json (remains unchanged)
const require = createRequire(import.meta.url);
const allCurrencies = require(path.join(__dirname, "all-currencies.json"));

// Ensure data file and config file exist (remains unchanged)
function ensureDataFile() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(dataFile)) fs.writeFileSync(dataFile, "[]", "utf-8");
  if (!fs.existsSync(configFile)) fs.writeFileSync(configFile, "{}", "utf-8");
  // NEW: Ensure undo and redo stack files exist
  if (!fs.existsSync(undoStackFile))
    fs.writeFileSync(undoStackFile, "[]", "utf-8");
  if (!fs.existsSync(redoStackFile))
    fs.writeFileSync(redoStackFile, "[]", "utf-8");
}

// Helper function to read config (get saved currency) (remains unchanged)
function getConfig() {
  if (fs.existsSync(configFile)) {
    try {
      const configData = fs.readFileSync(configFile, "utf-8");
      // Handle case where file is empty
      const config = configData ? JSON.parse(configData) : {};

      if (!config.currencyHistory) {
        config.currencyHistory = [];
      }
      // Explicitly check for undefined to distinguish from a null value that might be set intentionally
      if (config.preferredCurrency === undefined) {
        config.preferredCurrency = null; // Set to null if it doesn't exist
      }
      return config;
    } catch {
      console.error(
        chalk.red("❌ Error reading config file. Creating a new one."),
      );
      fs.writeFileSync(configFile, "{}", "utf-8");
      return { preferredCurrency: null, currencyHistory: [] };
    }
  }
  return { preferredCurrency: null, currencyHistory: [] };
}

// Helper function to save config (store currency) (remains unchanged)
function saveConfig(config) {
  fs.writeFileSync(configFile, JSON.stringify(config, null, 2), "utf-8");
}

// --- Currency Validation Helpers --- (remains unchanged)
function isValidCurrencyCode(code) {
  return Object.prototype.hasOwnProperty.call(allCurrencies, code);
}

function getClosestCurrencyMatch(inputCode) {
  const upperInput = inputCode.toUpperCase();

  if (isValidCurrencyCode(upperInput)) {
    return upperInput;
  }

  for (const code in allCurrencies) {
    if (allCurrencies[code].toUpperCase().includes(upperInput)) {
      return code;
    }
  }

  if (upperInput.length >= 2) {
    for (const code in allCurrencies) {
      if (code.startsWith(upperInput)) {
        return code;
      }
    }
  }
  return null;
}

// validateAndSuggestCurrency
async function validateAndSuggestCurrency(currencyInput) {
  let validatedCurrency = null;
  let attempts = 0;
  const maxAttempts = 3; // Enforce 3 attempts

  while (validatedCurrency === null && attempts < maxAttempts) {
    let currentInput = currencyInput;
    if (attempts > 0) {
      stopLoadingMessage();

      console.log(
        chalk.blue(
          `\nTo find correct 3-letter currency codes (ISO 4217), please check these reliable resources:`,
        ),
      );
      console.log(
        `  ${chalk.underline.bold(
          "1. Thomson Reuters (ISO 4217 list): https://www.thomsonreuters.com/content/helpandsupp/en-us/help/legal-tracker/law-firm/international-currencies/list-of-currency-codes.html",
        )}`,
      );
      console.log(
        `  ${chalk.underline.bold(
          "2. IBAN.com (Currency Codes by Country): https://www.iban.com/currency-codes",
        )}`,
      );
      const openLinkConfirmation = await promptConfirmation(
        chalk.blue(
          "Would you like to open one of these links in your browser now?",
        ),
      );

      if (openLinkConfirmation) {
        let linkChoice = "";
        while (!["1", "2"].includes(linkChoice)) {
          const rlChoice = readline.createInterface({
            input: process.stdin,
            output: process.stdout,
          });
          linkChoice = await new Promise((resolve) => {
            rlChoice.question(
              chalk.cyan(
                "Enter the number of the link you want to open (1 or 2): ",
              ),
              (answer) => {
                rlChoice.close();
                resolve(answer.trim());
              },
            );
          });
          if (!["1", "2"].includes(linkChoice)) {
            console.log(chalk.yellow("Invalid choice. Please enter 1 or 2."));
          }
        }

        let urlToOpen;
        if (linkChoice === "1")
          urlToOpen =
            "https://www.thomsonreuters.com/content/helpandsupp/en-us/help/legal-tracker/law-firm/international-currencies/list-of-currency-codes.html";
        else if (linkChoice === "2")
          urlToOpen = "https://www.iban.com/currency-codes";

        if (urlToOpen) {
          openUrlInBrowser(urlToOpen);
        }
      }

      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });
      currentInput = await new Promise((resolve) => {
        rl.question(
          chalk.yellow(
            `\nPlease enter a valid currency code (Attempt ${
              attempts + 1
            }/${maxAttempts}): `,
          ),
          (answer) => {
            rl.close();
            resolve(answer.trim());
          },
        );
      });
    }

    let upperInput = currentInput.toUpperCase();

    if (isValidCurrencyCode(upperInput)) {
      validatedCurrency = upperInput;
      break;
    }

    stopLoadingMessage();

    const suggestedCurrency = getClosestCurrencyMatch(upperInput);

    if (suggestedCurrency) {
      const confirmation = await promptConfirmation(
        chalk.yellow(
          `"${currentInput}" is not a standard code. Did you mean "${suggestedCurrency}" (${allCurrencies[suggestedCurrency]})?`,
        ),
      );
      if (confirmation) {
        validatedCurrency = suggestedCurrency;
        break;
      } else {
        console.log(chalk.yellow("Suggestion not accepted."));
      }
    } else {
      console.error(
        chalk.red(
          `❌ "${currentInput}" is not a recognized currency code and no close match was found.`,
        ),
      );
    }
    attempts++;
  }

  if (validatedCurrency === null && attempts >= maxAttempts) {
    console.error(
      chalk.red(
        `\nExceeded maximum attempts (${maxAttempts}). Please run the command again with a valid currency code.`,
      ),
    );
    console.log(
      chalk.blue(
        `For a list of supported currencies, refer to ISO 4217 currency codes (e.g., USD, EUR, BDT).`,
      ),
    );
  }

  return validatedCurrency;
}

// Main function to change preferred currency and optionally convert past expenses (remains unchanged)
async function changeCurrency(
  newCurrency,
  convertPast = false,
  exchangeRate = null,
) {
  const config = getConfig();
  const oldPreferredCurrency = config.preferredCurrency;

  if (oldPreferredCurrency !== newCurrency) {
    if (oldPreferredCurrency !== null) {
      const historyEntry = {
        date: new Date().toISOString(),
        previousPreferredCurrency: oldPreferredCurrency,
        newPreferredCurrency: newCurrency,
        exchangeRate: exchangeRate,
      };
      config.currencyHistory.push(historyEntry);
    }
    config.preferredCurrency = newCurrency;
    saveConfig(config);
    console.log(
      chalk.green(`✅ Preferred currency changed to ${newCurrency}.`),
    );

    if (
      convertPast &&
      oldPreferredCurrency !== null &&
      oldPreferredCurrency !== newCurrency
    ) {
      await convertPastExpenses(
        oldPreferredCurrency,
        newCurrency,
        exchangeRate,
      );
    } else if (oldPreferredCurrency === null) {
      console.log(
        chalk.blue(
          `ℹ️  This is the first time setting a preferred currency. No past expenses to convert.`,
        ),
      );
    }
  } else {
    console.log(
      chalk.yellow(
        `ℹ️  Preferred currency is already set to ${newCurrency}. No change needed.`,
      ),
    );
  }
}

// Function to convert past expenses to the new preferred currency (remains unchanged)
async function convertPastExpenses(
  oldPreferredCurrency,
  newPreferredCurrency,
  exchangeRate,
) {
  console.log(
    chalk.yellow(`\n🔄 Converting past expenses to ${newPreferredCurrency}...`),
  );
  let expenses = readExpenses();
  let convertedCount = 0;

  if (exchangeRate === null) {
    console.warn(
      chalk.yellow(
        `⚠️  No exchange rate provided. Expenses previously in ${oldPreferredCurrency} will be marked with ${newPreferredCurrency}, but their amounts will remain unchanged.`,
      ),
    );
  }

  for (const expense of expenses) {
    expense.originalAmount = expense.originalAmount ?? expense.amount;
    expense.originalCurrency = expense.originalCurrency ?? expense.currency;

    // Only convert if the expense's current currency matches the old preferred currency
    if (expense.currency === oldPreferredCurrency) {
      if (exchangeRate !== null) {
        expense.amount = expense.originalAmount * exchangeRate; // Use originalAmount for precise conversion
      }
      expense.currency = newPreferredCurrency;
      convertedCount++;
    }
  }

  writeExpenses(expenses);
  console.log(
    chalk.green(
      `✅ Processed ${convertedCount} past expenses to align with ${newPreferredCurrency}.`,
    ),
  );
}

// Generate export labels for filename and PDF title
function generateExportLabels(options) {
  let baseLabel = "";

  // Helper variables for cleaner label construction
  const monthName = options.month ? getMonthName(options.month) : null;
  const yearLabelSuffix = options.year ? `_${options.year}` : "_AllYears";
  // No need for monthLabelPrefix as we construct it dynamically now

  if (options.date) {
    baseLabel = options.date; // Most specific: exact date
  } else if (options.week && options.month) {
    // e.g., "5thWeek_July_2025" or "5thWeek_July_AllYears"
    // This implicitly requires year for full date context if not explicitly AllYears
    baseLabel = `${getWeekSuffix(options.week)}_${monthName}${yearLabelSuffix}`;
  } else if (options.day && options.month) {
    // NEW: Handle day + month combination
    // e.g., "Wednesday_July_2025" or "Wednesday_July_AllYears"
    baseLabel = `${options.day}_${monthName}${yearLabelSuffix}`;
  } else if (options.day && options.year) {
    // NEW: Handle day + year combination (e.g., Wednesday_AllMonths_2024)
    baseLabel = `${options.day}_AllMonths_${options.year}`;
  } else if (options.month) {
    // e.g., "July_2025" or "July_AllYears"
    baseLabel = `${monthName}${yearLabelSuffix}`;
  } else if (options.day) {
    // e.g., "Wednesday_AllMonths_AllYears"
    baseLabel = `${options.day}_AllMonths_AllYears`;
  } else if (options.year) {
    // e.g., "2025" (most general time filter)
    baseLabel = options.year;
  }

  if (!baseLabel) {
    baseLabel = "AllTime"; // Fallback if no specific filter is applied
  }

  return {
    filenameLabel: `Expense_${baseLabel}`,
    titleLabel: baseLabel,
  };
}

// --- Week of the Month Calculation (Original Logic) --- (remains unchanged)
function getWeekOfMonth(date) {
  const firstDayOfMonth = new Date(date.getFullYear(), date.getMonth(), 1);
  const daysFromStartOfMonth = Math.floor(
    (date - firstDayOfMonth) / (1000 * 60 * 60 * 24),
  );
  return Math.ceil((daysFromStartOfMonth + 1) / 7);
}

// --- Helper for Week Suffix (1st, 2nd, 3rd, 4th) --- (remains unchanged)
function getWeekSuffix(weekNumber) {
  const num = parseInt(weekNumber, 10);
  if (isNaN(num)) return String(weekNumber); // Return as is if not a number
  if (num === 1) return "1stWeek";
  if (num === 2) return "2ndWeek";
  if (num === 3) return "3rdWeek";
  return `${num}thWeek`;
}

// Convert month number to month name (remains unchanged)
function getMonthName(month) {
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  return monthNames[month - 1];
}

// Helper function to compare dates without time (remains unchanged)
function isSameDate(date1, date2) {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

// Helper function to format date for CSV/PDF (remains unchanged)
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString("en-GB", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
}

// Ensure that the data and config files exist (remains unchanged)
ensureDataFile();

// Function to read expenses from the data file (remains unchanged)
function readExpenses() {
  const data = fs.readFileSync(dataFile, "utf-8");
  return JSON.parse(data);
}

// Function to write expenses to the data file (remains unchanged)
function writeExpenses(expenses) {
  fs.writeFileSync(dataFile, JSON.stringify(expenses, null, 2), "utf-8");
}

// Function to prompt for confirmation (remains unchanged)
function promptConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  return new Promise((resolve) => {
    rl.question(question + " (y/N): ", (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase() === "y");
    });
  });
}

// Function to get the downloads folder path (remains unchanged)
function getDownloadsFolder() {
  const platform = process.platform;

  if (platform === "win32") {
    try {
      let rawPath = execSync(
        "powershell -command \"(Get-ItemProperty -Path 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders').'{374DE290-123F-4565-9164-39C4925E467B}'\"",
        { encoding: "utf-8" },
      ).trim();
      rawPath = rawPath.replace(/^%USERPROFILE%/, os.homedir());
      return path.normalize(rawPath);
    } catch {
      return path.join(os.homedir(), "Downloads");
    }
  } else if (platform === "darwin") {
    return path.join(os.homedir(), "Downloads");
  } else if (platform === "linux") {
    return path.join(os.homedir(), "Downloads");
  }
  return path.join(os.homedir(), "Downloads");
}

// Function to open the exported file (remains unchanged)
function openFile(filePath) {
  const platform = process.platform;
  let command;
  if (platform === "win32") {
    command = `start "" "${filePath}"`;
  } else if (platform === "darwin") {
    command = `open "${filePath}"`;
  } else if (platform === "linux") {
    command = `xdg-open "${filePath}"`;
  } else {
    console.warn(
      chalk.yellow("Automatic file opening not supported on this platform."),
    );
    return;
  }

  console.log(chalk.blue(`\n📂 Opening the file automatically...`));

  try {
    execSync(command, { stdio: "ignore" });
  } catch (err) {
    console.error(chalk.red(`Failed to open file: ${filePath}`), err);
  }
}

// Function to filter expenses by date and other filters
function filterExpenses(expenses, filters, includeDeleted = false) {
  return expenses.filter((e) => {
    // 1. Filter out deleted expenses if --all is not used
    if (!includeDeleted && e.isDeleted) {
      return false;
    }

    const date = new Date(e.date); // Convert expense date string to Date object once

    // 2. Filter by specific date (YYYY-MM-DD)
    // No need for warnings here; assume validation happens in command action
    if (filters.date) {
      const filterDate = new Date(filters.date);
      if (!isSameDate(date, filterDate)) return false;
    }

    // 3. Filter by day name (e.g., Monday)
    if (filters.day) {
      const dayName = date.toLocaleDateString("en-US", { weekday: "long" });
      if (dayName.toLowerCase() !== filters.day.toLowerCase()) return false;
    }

    // 4. Handle month and year filtering (consolidated logic)
    // This section now correctly handles combinations and single filters.
    // Assumes monthNum and yearNum are valid integers if present.
    const expenseMonth = date.getMonth() + 1; // 1-12
    const expenseYear = date.getFullYear();

    if (filters.month) {
      const filterMonth = parseInt(filters.month);
      if (expenseMonth !== filterMonth) return false;
    }

    if (filters.year) {
      const filterYear = parseInt(filters.year);
      if (expenseYear !== filterYear) return false;
    }

    // 5. Filter by week number of the month
    // This logic only runs IF filters.week is present.
    // It assumes filters.month is also present and valid because of prior validation in command action.
    if (filters.week) {
      const weekNum = parseInt(filters.week); // Guaranteed to be valid (1-5) by now

      // At this point, if filters.month and filters.year (if present) were used,
      // the expense has ALREADY passed those checks.
      // So, we just need to compare the expense's week of month.
      const weekOfMonth = getWeekOfMonth(date);
      if (weekOfMonth !== weekNum) return false;
    }

    // If the expense passes all applied filters, keep it
    return true;
  });
}

// --- NEW: Function for common filter validation ---
function validateFilterOptions(options) {
  // 1. Check for mutually exclusive filters (date vs. other time filters)
  const hasAnyTimeFilter =
    options.day || options.month || options.week || options.year;

  if (options.date) {
    if (hasAnyTimeFilter) {
      console.error(
        chalk.red(
          `❌ Error: Cannot use --date with --day, --month, --week, or --year. Please choose one filtering method.`,
        ),
      );
      process.exit(1);
    }
    // Validate --date format (YYYY-MM-DD)
    const parsedDate = new Date(options.date);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(options.date) ||
      isNaN(parsedDate.getTime())
    ) {
      console.error(
        chalk.red(
          `❌ Error: Invalid --date format. Please use YYYY-MM-DD (e.g., 2025-07-29).`,
        ),
      );
      process.exit(1);
    }
  }

  // 2. Validate --week combination and range
  if (options.week) {
    const weekNum = parseInt(options.week);

    if (isNaN(weekNum) || weekNum < 1 || weekNum > 5) {
      console.error(
        chalk.red(
          `❌ Error: Invalid --week value '${options.week}'. Must be between 1 and 5 for week of month.`,
        ),
      );
      process.exit(1);
    }

    if (!options.month) {
      console.error(
        chalk.red(
          `❌ Error: The --week option must be used with --month (and optionally --year) for meaningful filtering.`,
        ),
      );
      process.exit(1);
    }
  }

  // 3. Validate --month range
  if (options.month) {
    const monthNum = parseInt(options.month);
    if (isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
      console.error(
        chalk.red(`❌ Error: Invalid --month value. Must be between 1 and 12.`),
      );
      process.exit(1);
    }
  }

  // 4. Validate --year format
  if (options.year) {
    const yearNum = parseInt(options.year);
    if (isNaN(yearNum) || String(yearNum).length !== 4) {
      console.error(
        chalk.red(
          `❌ Error: Invalid --year value. Please use a 4-digit year (e.g., 2025).`,
        ),
      );
      process.exit(1);
    }
  }

  // 5. Validate --day name
  if (options.day) {
    const validDays = [
      "monday",
      "tuesday",
      "wednesday",
      "thursday",
      "friday",
      "saturday",
      "sunday",
    ];
    if (!validDays.includes(options.day.toLowerCase())) {
      console.error(
        chalk.red(
          `❌ Error: Invalid --day value. Must be one of: ${validDays
            .map((d) => d.charAt(0).toUpperCase() + d.slice(1))
            .join(", ")}.`,
        ),
      );
      process.exit(1);
    }
  }
}
// --- END NEW: Function for common filter validation ---

// --- New: Global loading indicator and timer --- (remains unchanged)
let loadingInterval;
let startTime;
let loadingMessagePrefix = "Please wait"; // Default prefix

function startLoadingMessage(prefix = "Please wait") {
  startTime = process.hrtime.bigint(); // High-resolution time
  loadingMessagePrefix = prefix;
  let dots = 0;
  // Clear any existing loading message remnants before starting a new one
  readline.cursorTo(process.stdout, 0);
  readline.clearLine(process.stdout, 1);
  process.stdout.write(chalk.gray(`${loadingMessagePrefix}...`));

  loadingInterval = setInterval(() => {
    dots = (dots + 1) % 4;
    readline.cursorTo(process.stdout, 0);
    process.stdout.write(
      chalk.gray(`${loadingMessagePrefix}${".".repeat(dots)}`),
    );
  }, 300);
}

function stopLoadingMessage() {
  if (loadingInterval) {
    clearInterval(loadingInterval);
    const endTime = process.hrtime.bigint();
    const durationMs = Number(endTime - startTime) / 1_000_000; // Convert nanoseconds to milliseconds
    readline.cursorTo(process.stdout, 0); // Move cursor to the beginning of the line
    readline.clearLine(process.stdout, 1); // Clear the current line
    if (durationMs >= 100) {
      // Only show duration if it's more than 100ms
      console.log(
        chalk.gray(`Operation completed in ${durationMs.toFixed(2)} ms.`),
      );
    }
    loadingInterval = null; // Reset interval ID
  }
}

// --- Global helper for opening URLs in browser --- (remains unchanged)
const openUrlInBrowser = (url) => {
  const platform = process.platform;
  let command;
  if (platform === "win32") {
    command = `start "" "${url}"`;
  } else if (platform === "darwin") {
    command = `open "${url}"`;
  } else if (platform === "linux") {
    command = `xdg-open "${url}"`;
  } else {
    console.warn(
      chalk.yellow("Automatic browser opening not supported on this platform."),
    );
    return;
  }

  try {
    execSync(command, { stdio: "ignore" });
    console.log(chalk.gray(`(Opened ${url} in your default browser)`));
  } catch (err) {
    console.error(chalk.red(`Failed to open URL: ${url}`), err);
  }
};
// --- End of openUrlInBrowser definition ---

// --- GLOBAL UTILITY: Moved wrapTextForPdf here to be accessible by multiple commands ---
function wrapTextForPdf(text, maxWidth, font, fontSize) {
  const explicitLines = text.split("\n");
  let finalLines = [];
  explicitLines.forEach((linePart) => {
    const words = linePart.split(" ");
    let currentLine = "";
    if (linePart.trim() === "") {
      finalLines.push("");
      return;
    }
    words.forEach((word) => {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);
      if (width > maxWidth) {
        if (currentLine) {
          finalLines.push(currentLine);
        }
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    });
    if (currentLine) {
      finalLines.push(currentLine);
    }
  });
  return finalLines;
}
// --- END GLOBAL UTILITY ---

// --- NEW: Undo/Redo Stack Management Functions ---
// Store states with a 'command' property for better user feedback
function readStack(stackFile) {
  try {
    const data = fs.readFileSync(stackFile, "utf-8");
    return JSON.parse(data);
  } catch {
    // If file is empty or corrupt, return an empty array
    return [];
  }
}

function writeStack(stackFile, stack) {
  fs.writeFileSync(stackFile, JSON.stringify(stack, null, 2), "utf-8");
}

function pushToUndoStack(commandName) {
  const undoStack = readStack(undoStackFile);
  const currentData = fs.readFileSync(dataFile, "utf-8");
  const currentConfig = fs.readFileSync(configFile, "utf-8");

  undoStack.push({
    command: commandName, // Store the name of the command being undone
    data: JSON.parse(currentData),
    config: JSON.parse(currentConfig),
  });

  const MAX_UNDO_STATES = 5; // Keep the last 5 states
  if (undoStack.length > MAX_UNDO_STATES) {
    undoStack.shift(); // Remove the oldest state
  }
  writeStack(undoStackFile, undoStack);
}

function popFromUndoStack() {
  const undoStack = readStack(undoStackFile);
  if (undoStack.length > 0) {
    const prevState = undoStack.pop();
    writeStack(undoStackFile, undoStack); // Save the undo stack after popping

    // Push the current (before undo) state to redo stack
    pushToRedoStack(prevState.command); // Use the command name from the undone state

    // Revert data.json and config.json
    fs.writeFileSync(
      dataFile,
      JSON.stringify(prevState.data, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      configFile,
      JSON.stringify(prevState.config, null, 2),
      "utf-8",
    );
    return prevState.command; // Return the name of the undone command
  }
  return null; // Nothing to undo
}

function pushToRedoStack(commandName) {
  const redoStack = readStack(redoStackFile);
  const currentData = fs.readFileSync(dataFile, "utf-8");
  const currentConfig = fs.readFileSync(configFile, "utf-8");

  redoStack.push({
    command: commandName, // Store the name of the command being redone
    data: JSON.parse(currentData),
    config: JSON.parse(currentConfig),
  });

  const MAX_REDO_STATES = 5; // Keep the last 5 redo states
  if (redoStack.length > MAX_REDO_STATES) {
    redoStack.shift(); // Remove the oldest state
  }
  writeStack(redoStackFile, redoStack);
}

function popFromRedoStack() {
  const redoStack = readStack(redoStackFile);
  if (redoStack.length > 0) {
    const nextState = redoStack.pop();
    writeStack(redoStackFile, redoStack); // Save the redo stack after popping

    // Push the current (before redo) state to undo stack
    // This allows undoing the redo itself
    pushToUndoStack(nextState.command);

    // Revert data.json and config.json
    fs.writeFileSync(
      dataFile,
      JSON.stringify(nextState.data, null, 2),
      "utf-8",
    );
    fs.writeFileSync(
      configFile,
      JSON.stringify(nextState.config, null, 2),
      "utf-8",
    );
    return nextState.command; // Return the name of the redone command
  }
  return null; // Nothing to redo
}

function clearRedoStack() {
  writeStack(redoStackFile, []); // Empty the redo stack
}
// --- END NEW: Undo/Redo Stack Management Functions ---

// *** NEW FEATURE: Function to handle initial currency setup on first run ***
async function promptForInitialCurrency() {
  const config = getConfig();

  // This check is slightly redundant if called from main(), but good for standalone robustness
  if (config.preferredCurrency !== null) {
    return true;
  }

  stopLoadingMessage(); // Ensure no spinners are running

  console.log(chalk.cyan("\n👋 Welcome to expenses-tracker-cli!"));
  console.log(chalk.blue("To get started, let's set your default currency."));
  console.log(
    chalk.gray(
      "This will be used for all future expenses unless you specify a different one.",
    ),
  );
  console.log(
    chalk.gray(
      "You can change **this default currency** at any time with 'expense change-currency.\n",
    ),
  );

  // Prompt for the initial currency code
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const initialInput = await new Promise((resolve) => {
    rl.question(
      chalk.yellow(
        "Please enter your preferred 3-letter currency code (e.g., USD, EUR, BDT): ",
      ),
      (answer) => {
        rl.close();
        resolve(answer.trim());
      },
    );
  });

  if (!initialInput) {
    console.log(
      chalk.yellow(
        "\nSetup cancelled. You can set the currency later using the 'change-currency' command.",
      ),
    );
    return false;
  }

  // Use the existing robust validation function
  const chosenCurrency = await validateAndSuggestCurrency(initialInput);

  if (chosenCurrency) {
    config.preferredCurrency = chosenCurrency;
    saveConfig(config);
    console.log(
      chalk.green(
        `\n✅ Your preferred currency has been set to ${chosenCurrency}.`,
      ),
    );
    return true;
  } else {
    // validateAndSuggestCurrency handles its own error messages for failure
    console.log(
      chalk.yellow(
        "\nSetup cancelled. You can set the currency later using the 'change-currency' command.",
      ),
    );
    return false;
  }
}

// --- Commander.js Command Definitions ---

program
  .name("expense") // <--- Updated name
  .description(
    "A simple command-line expense tracker. \nYou can also filter expenses based on week, month, year, or specific date when typing list,total or export subcommand. \n\nFor a comprehensive PDF manual, type: expense manual [--open]",
  )
  .version("1.0.0", "-v, --version", "Show version number"); // Global version option

// === THE KEY CHANGE: Disable Commander's automatic help option for all commands ===
program.helpOption(false); // This stops Commander from adding -h, --help to all commands.
program.addHelpCommand(false); // ADDED: Prevents Commander from creating the 'help' command entry

// Manually define a global help option action.
// When 'expense --help' or 'expense -h' is encountered, this action is triggered.
program.option("-h, --help", "display help for command", () => {
  // Check if there's a subcommand specified (e.g., 'expense list --help')
  // and that the subcommand isn't also a global help/version flag.
  const subcommandName = process.argv[2]; // The argument right after 'expense'

  // This block specifically handles 'expense --help' or 'expense -h'
  // and 'expense <valid-subcommand> --help'
  if (
    subcommandName &&
    !["--help", "-h", "--version", "-v"].includes(subcommandName)
  ) {
    const command = program.commands.find(
      (c) =>
        c.name() === subcommandName || c.aliases().includes(subcommandName),
    );
    if (command) {
      command.outputHelp(); // Show help for that specific subcommand
      process.exit(0);
    }
  }
  // Otherwise, show global help (e.g., if no subcommand or if the subcommand was -h/-v)
  program.outputHelp();
  process.exit(0);
});

// The rest of your command definitions (add, change-currency, edit, reset, delete, recover, list, total, export)
// remain exactly the same as they were. No changes needed to their internal logic for pre-parsing interception
// because the interception happens at the top level before Commander even tries to match.

program
  .command("add <amount> <description...>")
  .alias("a")
  .description(
    "Add a new expense. E.g., Use '--currency EUR' for a specific currency on this expense.",
  )
  .option(
    "-c, --currency <code>",
    "Currency code, e.g. USD, EUR (defaults to preferred currency)",
  )
  .action(async (amount, description, options) => {
    startLoadingMessage("Adding expense");
    try {
      pushToUndoStack("add"); // Save current state before modification
      clearRedoStack(); // Clear redo stack on new command

      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        console.error(
          chalk.red("❌ Invalid amount. Please enter a positive number."),
        );
        return;
      }

      const config = getConfig();
      let transactionCurrency = config.preferredCurrency || "USD";

      if (options.currency) {
        // validateAndSuggestCurrency internally stops the spinner before prompt
        const validatedOptionCurrency = await validateAndSuggestCurrency(
          options.currency,
        );
        // If validation needed a prompt, the spinner was stopped.
        // It should NOT be restarted here just to be stopped again immediately.
        if (validatedOptionCurrency) {
          transactionCurrency = validatedOptionCurrency;
        } else {
          console.error(
            chalk.red(
              "❌ Invalid currency code provided for this expense. Using preferred/default currency.",
            ),
          );
        }
      }

      const expenses = readExpenses();
      const expense = {
        id: expenses.length
          ? Math.max(...expenses.map((exp) => exp.id)) + 1
          : 1,
        amount: parsedAmount,
        description: description.join(" "),
        date: new Date().toISOString(),
        currency: transactionCurrency,
        originalAmount: parsedAmount,
        originalCurrency: transactionCurrency,
        isDeleted: false,
        deletedAt: null,
      };

      expenses.push(expense);
      writeExpenses(expenses);
      console.log(
        chalk.green(
          `✅ Added expense #${expense.id}: ${expense.amount.toFixed(
            2,
          )} ${transactionCurrency} - ${expense.description}`,
        ),
      );
    } finally {
      stopLoadingMessage();
    }
  });

program
  .command("change-currency")
  .description(
    "Change the preferred currency for future transactions and optionally convert past ones. E.g., Use '--currency USD' to set USD.",
  )
  .option(
    "-c, --currency <code>",
    "New currency code (e.g., USD, EUR, BDT)",
    true,
  ) // `true` makes it required
  .action(async (options) => {
    // --- START: THE FIX ---
    // This check now correctly handles the case where the --currency flag is missing entirely.
    if (typeof options.currency !== "string") {
      console.error(
        chalk.red(
          "❌ Error: The --currency flag is required for this command.",
        ),
      );
      console.log(
        chalk.blue("\nExample: expense change-currency --currency USD"),
      );
      return; // Exit the function gracefully
    }
    // --- END: THE FIX ---

    startLoadingMessage("Changing currency");
    try {
      pushToUndoStack("change-currency");
      clearRedoStack();

      const newCurrency = await validateAndSuggestCurrency(options.currency);

      if (!newCurrency) {
        return; // Exit if currency validation failed and no valid currency was chosen
      }

      const config = getConfig();
      const oldPreferredCurrency = config.preferredCurrency;

      if (oldPreferredCurrency !== newCurrency) {
        let confirmedConversion = false;
        let exchangeRate = null;

        if (oldPreferredCurrency !== null) {
          stopLoadingMessage();
          confirmedConversion = await promptConfirmation(
            chalk.blue(
              `Do you want to convert past expenses from ${oldPreferredCurrency} to ${newCurrency}?`,
            ),
          );

          if (confirmedConversion) {
            // --- START: Exchange Rate Input Loop with Limit ---
            let rateAttempts = 0;
            const maxRateAttempts = 3; // Define the limit for exchange rate input
            let isValidRate = false;

            while (!isValidRate && rateAttempts < maxRateAttempts) {
              stopLoadingMessage();

              console.log(
                chalk.blue(
                  `\nTo find live exchange rates for ${oldPreferredCurrency} to ${newCurrency}, you can visit one of these reliable sites:`,
                ),
              );
              console.log(
                `  ${chalk.underline.bold(
                  "1. XE.com: https://www.xe.com/currencyconverter/",
                )}`,
              );
              console.log(
                `  ${chalk.underline.bold(
                  "2. Wise: https://wise.com/currency-converter/",
                )}`,
              );
              console.log(
                `  ${chalk.underline.bold(
                  "3. OANDA: https://www.oanda.com/currency-converter/en/",
                )}\n`,
              );

              const openLinkConfirmation = await promptConfirmation(
                chalk.blue(
                  "Would you like to open one of these links in your browser now?",
                ),
              );

              if (openLinkConfirmation) {
                let linkChoice = "";
                while (!["1", "2", "3"].includes(linkChoice)) {
                  const rlChoice = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout,
                  });
                  linkChoice = await new Promise((resolve) => {
                    rlChoice.question(
                      chalk.cyan(
                        "Enter the number of the link you want to open (1, 2, or 3): ",
                      ),
                      (answer) => {
                        rlChoice.close();
                        resolve(answer.trim());
                      },
                    );
                  });
                  if (!["1", "2", "3"].includes(linkChoice)) {
                    console.log(
                      chalk.yellow("Invalid choice. Please enter 1, 2, or 3."),
                    );
                  }
                }

                let urlToOpen;
                if (linkChoice === "1")
                  urlToOpen = "https://www.xe.com/currencyconverter/";
                else if (linkChoice === "2")
                  urlToOpen = "https://wise.com/currency-converter/";
                else if (linkChoice === "3")
                  urlToOpen = "https://www.oanda.com/currency-converter/en/";

                if (urlToOpen) {
                  openUrlInBrowser(urlToOpen);
                }
              }

              const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
              });
              const rateInput = await new Promise((resolve) => {
                rl.question(
                  chalk.cyan(
                    `Enter the exchange rate (1 ${oldPreferredCurrency} = X ${newCurrency}) (Attempt ${
                      rateAttempts + 1
                    }/${maxRateAttempts}): `,
                  ), // Added attempt counter to prompt
                  (answer) => {
                    rl.close();
                    resolve(answer.trim());
                  },
                );
              });

              const parsedRate = parseFloat(rateInput);
              if (!isNaN(parsedRate) && parsedRate > 0) {
                exchangeRate = parsedRate;
                isValidRate = true;
              } else {
                console.error(
                  chalk.red(
                    "❌ Invalid exchange rate. Please enter a positive number.",
                  ),
                );
              }
              rateAttempts++;
            } // --- END: Exchange Rate Input Loop with Limit ---

            if (!isValidRate) {
              console.error(
                chalk.red(
                  `\nExceeded maximum attempts (${maxRateAttempts}) for exchange rate. Conversion of past expenses aborted.`,
                ),
              );
              // Optionally, you could exit here, but allowing the currency change without conversion
              // might be a softer user experience. Let's proceed without conversion.
              confirmedConversion = false; // Ensure conversion doesn't happen
              exchangeRate = null; // Reset exchange rate
            }
          }
        }
        await changeCurrency(newCurrency, confirmedConversion, exchangeRate);
      } else {
        console.log(
          chalk.yellow(
            `ℹ️  Preferred currency is already set to ${newCurrency}. No change needed.`,
          ),
        );
      }
    } finally {
      stopLoadingMessage();
    }
  });

program
  .command("edit <id>")
  .description("Modify an existing expense's details.")
  .option(
    "-d, --description <description...>",
    "New description for the expense",
  )
  .option("-a, --amount <amount>", "New amount for the expense (number)")
  .option(
    "-c, --currency <code>",
    "New currency for the expense (e.g., USD, EUR)",
  )
  .option("--date <YYYY-MM-DD>", "New date for the expense (e.g., 2024-07-28)")
  .action(async (id, options) => {
    startLoadingMessage(`Preparing to edit expense #${id}`);
    try {
      pushToUndoStack("edit"); // Save current state before modification
      clearRedoStack(); // Clear redo stack on new command

      const expenseId = parseInt(id);
      if (isNaN(expenseId) || expenseId <= 0) {
        // Changed parsedAmount to expenseId here
        console.error(
          chalk.red("❌ Invalid expense ID. Please enter a positive number."),
        );
        return;
      }

      let expenses = readExpenses();
      const expenseToEdit = expenses.find((exp) => exp.id === expenseId);

      if (!expenseToEdit) {
        console.log(
          chalk.yellow(`ℹ️  Expense with ID #${expenseId} not found.`),
        );
        return;
      }

      // --- START OF NEW FEEDBACK LOGIC ---
      const noOptionsProvided = !(
        options.description ||
        options.amount ||
        options.currency ||
        options.date
      );

      if (noOptionsProvided) {
        stopLoadingMessage(); // Stop the spinner before printing messages
        console.log(
          chalk.yellow(
            `\nℹ️  To edit expense #${expenseId}, please provide at least one option:`,
          ),
        );
        console.log(`    - ${chalk.bold("--amount <number>")} (e.g., 75.50)`);
        console.log(
          `    - ${chalk.bold(
            "--description <text...>",
          )} (e.g., "Updated item for lunch")`,
        );
        console.log(`    - ${chalk.bold("--currency <CODE>")} (e.g., GBP)`);
        console.log(
          `    - ${chalk.bold("--date <YYYY-MM-DD>")} (e.g., 2025-07-30)`,
        );
        console.log(
          chalk.yellow(
            `\n    Example: ${chalk.bold(
              `expense edit ${expenseId} --amount 120 --description "Lunch with team"`,
            )}`,
          ),
        );
        return; // Exit the action as no edit options were provided
      }
      // --- END OF NEW FEEDBACK LOGIC ---

      let changesMade = false;
      let oldDetails = {
        description: expenseToEdit.description,
        amount: expenseToEdit.amount,
        currency: expenseToEdit.currency,
        date: expenseToEdit.date,
      };
      let newDetails = {
        description: expenseToEdit.description,
        amount: expenseToEdit.amount,
        currency: expenseToEdit.currency,
        date: expenseToEdit.date,
      };

      if (options.description) {
        const newDescription = options.description.join(" ");
        if (expenseToEdit.description !== newDescription) {
          expenseToEdit.description = newDescription;
          newDetails.description = newDescription;
          changesMade = true;
        }
      }

      if (options.amount) {
        const newAmount = parseFloat(options.amount);
        if (isNaN(newAmount) || newAmount <= 0) {
          console.error(
            chalk.red(
              "❌ Invalid amount provided. Amount must be a positive number.",
            ),
          );
        } else if (Math.abs(expenseToEdit.amount - newAmount) > 0.001) {
          expenseToEdit.amount = newAmount;
          newDetails.amount = newAmount;
          changesMade = true;
        }
      }

      if (options.currency) {
        const validatedCurrency = await validateAndSuggestCurrency(
          options.currency,
        );
        if (validatedCurrency) {
          if (expenseToEdit.currency !== validatedCurrency) {
            expenseToEdit.currency = validatedCurrency;
            newDetails.currency = validatedCurrency;
            expenseToEdit.originalCurrency = validatedCurrency;
            changesMade = true;
          }
        } else {
          console.error(chalk.red("❌ Invalid currency code provided."));
        }
      }

      if (options.date) {
        const parsedDate = new Date(options.date);
        if (isNaN(parsedDate.getTime())) {
          console.error(
            chalk.red("❌ Invalid date format. Please use YYYY-MM-DD."),
          );
        } else {
          const oldDate = new Date(expenseToEdit.date);
          if (!isSameDate(oldDate, parsedDate)) {
            expenseToEdit.date = parsedDate.toISOString();
            newDetails.date = parsedDate.toISOString();
            changesMade = true;
          }
        }
      }

      if (!changesMade) {
        console.log(chalk.yellow("ℹ️  No changes detected or applied."));
        return;
      }

      stopLoadingMessage();
      let confirmationMessage = chalk.blue(
        `❓ Are you sure you want to apply these changes to expense #${expenseId}?\n`,
      );
      confirmationMessage += `  Current: ${oldDetails.amount.toFixed(2)} ${
        oldDetails.currency
      } - "${oldDetails.description}" (${formatDate(oldDetails.date)})\n`;
      confirmationMessage += `  New:     ${newDetails.amount.toFixed(2)} ${
        newDetails.currency
      } - "${newDetails.description}" (${formatDate(newDetails.date)})`;

      const confirmed = await promptConfirmation(confirmationMessage);

      if (!confirmed) {
        console.log(
          chalk.yellow("Operation cancelled. Expense was not modified."),
        );
        return;
      }

      writeExpenses(expenses);
      console.log(
        chalk.green(`✅ Expense #${expenseId} has been successfully updated.`),
      );
    } finally {
      stopLoadingMessage();
    }
  });

program
  .command("reset")
  .description("Erase all expenses data (irreversible without undo).")
  .action(async () => {
    startLoadingMessage("Preparing to reset all expenses");
    try {
      pushToUndoStack("reset"); // Save current state before modification
      clearRedoStack(); // Clear redo stack on new command

      stopLoadingMessage();
      const confirmed = await promptConfirmation(
        chalk.red(
          "⚠️  Are you sure you want to erase all expenses? This action will clear all your data. Use 'expense undo' to revert immediately after.",
        ),
      );

      if (!confirmed) {
        console.log(chalk.yellow("Operation cancelled. No data was erased."));
        return;
      }
      writeExpenses([]);
      console.log(chalk.green("✅ All expenses have been erased."));
    } finally {
      stopLoadingMessage();
    }
  });

program
  .command("delete <id>")
  .alias("d")
  .description("Mark a specific expense as deleted (soft delete).")
  .action(async (id) => {
    startLoadingMessage(`Preparing to delete expense #${id}`);
    try {
      pushToUndoStack("delete"); // Save current state before modification
      clearRedoStack(); // Clear redo stack on new command

      const expenseId = parseInt(id);
      if (isNaN(expenseId) || expenseId <= 0) {
        console.error(
          chalk.red("❌ Invalid expense ID. Please enter a positive number."),
        );
        return;
      }

      let expenses = readExpenses();
      const expenseToMarkAsDeleted = expenses.find(
        (exp) => exp.id === expenseId,
      );

      if (!expenseToMarkAsDeleted) {
        console.log(
          chalk.yellow(`ℹ️  Expense with ID #${expenseId} not found.`),
        );
        return;
      }

      if (expenseToMarkAsDeleted.isDeleted) {
        console.log(
          chalk.yellow(
            `ℹ️  Expense #${expenseId} is already marked as deleted.`,
          ),
        );
        return;
      }

      stopLoadingMessage();
      const confirmed = await promptConfirmation(
        chalk.red(
          `⚠️  Are you sure you want to delete expense #${
            expenseToMarkAsDeleted.id
          }: ${expenseToMarkAsDeleted.amount.toFixed(2)} ${
            expenseToMarkAsDeleted.currency
          } - ${
            expenseToMarkAsDeleted.description
          }? It will be hidden from default lists but can be recovered.`,
        ),
      );

      if (!confirmed) {
        console.log(
          chalk.yellow(
            "Operation cancelled. No expense was marked as deleted.",
          ),
        );
        return;
      }

      expenseToMarkAsDeleted.isDeleted = true;
      expenseToMarkAsDeleted.deletedAt = new Date().toISOString();

      writeExpenses(expenses);
      console.log(
        chalk.green(
          `✅ Expense #${expenseToMarkAsDeleted.id} has been marked as deleted.`,
        ),
      );
    } finally {
      stopLoadingMessage();
    }
  });

program
  .command("recover <id>")
  .description("Recover a previously deleted expense by its ID.")
  .action(async (id) => {
    startLoadingMessage(`Preparing to recover expense #${id}`);
    try {
      pushToUndoStack("recover"); // Save current state before modification
      clearRedoStack(); // Clear redo stack on new command

      const expenseId = parseInt(id);
      if (isNaN(expenseId) || expenseId <= 0) {
        console.error(
          chalk.red("❌ Invalid expense ID. Please enter a positive number."),
        );
        return;
      }

      let expenses = readExpenses();
      const expenseToRecover = expenses.find((exp) => exp.id === expenseId);

      if (!expenseToRecover) {
        console.log(
          chalk.yellow(`ℹ️  Expense with ID #${expenseId} not found.`),
        );
        return;
      }

      if (!expenseToRecover.isDeleted) {
        console.log(
          chalk.yellow(
            `ℹ️  Expense #${expenseId} is not currently marked as deleted.`,
          ),
        );
        return;
      }

      stopLoadingMessage();
      const confirmed = await promptConfirmation(
        chalk.blue(
          `❓ Are you sure you want to recover expense #${
            expenseToRecover.id
          }: ${expenseToRecover.amount.toFixed(2)} ${
            expenseToRecover.currency
          } - ${
            expenseToRecover.description
          }? It will reappear in your expense lists.`,
        ),
      );

      if (!confirmed) {
        console.log(
          chalk.yellow("Operation cancelled. No expense was recovered."),
        );
        return;
      }

      expenseToRecover.isDeleted = false;
      expenseToRecover.deletedAt = null;

      writeExpenses(expenses);
      console.log(
        chalk.green(
          `✅ Expense #${expenseToRecover.id} has been successfully recovered.`,
        ),
      );
    } finally {
      stopLoadingMessage();
    }
  });

program
  .command("list [filter]") // MODIFIED: Added optional [filter] argument to catch invalid inputs
  .alias("l")
  .description("List all expenses")
  .option("--reindex", "Temporarily show sequential IDs (reindex expenses)")
  .option("--date <YYYY-MM-DD>", "Filter by specific date")
  .option("--day <Day>", "Filter by day name (e.g., Monday)")
  .option("--month <1-12>", "Filter by month")
  .option("--week <1-5>", "Filter by week number of the month (1-5)")
  .option("--year <YYYY>", "Filter by year")
  .option("--all", "Include deleted expenses in the list")
  .action((filter, options) => {
    // MODIFIED: Action now receives "filter" and "options"
    // --- ADDED: Block to catch and reject direct arguments ---
    if (filter) {
      console.error(chalk.red("\n❌ Error: Invalid command format."));
      console.error(
        chalk.yellow(
          "Please provide filters using options like --date, --month, or --year.",
        ),
      );
      console.log(chalk.blue("\nFor example:"));
      console.log(chalk.green("  expense list --date 2025-08-01"));
      console.log(chalk.green("  expense list --month 8 --year 2025"));
      process.exit(1);
    }
    // --- END of new block ---

    // The original logic of the command continues below
    validateFilterOptions(options);

    startLoadingMessage("Loading expenses");
    try {
      let expenses = readExpenses();
      expenses = filterExpenses(expenses, options, options.all);

      if (expenses.length === 0) {
        console.log(
          chalk.yellow("📭 No expenses found for the selected filters."),
        );
        return;
      }

      const { titleLabel: label } = generateExportLabels(options);

      let displayLabel = label;
      if (options.all) {
        displayLabel += " (Including Deleted)";
      }

      console.log(
        chalk.cyan(
          `\n💸 Expense List for ${displayLabel} (${expenses.length} items):\n`,
        ),
      );

      if (options.reindex) {
        expenses = [...expenses].sort((a, b) => a.id - b.id);
        expenses.forEach((expense, index) => {
          expense._displayId = index + 1;
        });
      }

      expenses.forEach((expense) => {
        const date = new Date(expense.date);
        const formattedDate = `${date.toLocaleDateString(
          "en-GB",
        )} ${date.toLocaleTimeString("en-GB", {
          hour: "2-digit",
          minute: "2-digit",
        })}`;

        const safeOriginalAmount = expense.originalAmount ?? expense.amount;
        const safeOriginalCurrency =
          expense.originalCurrency ?? expense.currency;

        const convertedDisplay = `${expense.amount.toFixed(2)} ${
          expense.currency
        }`;
        const originalDisplay =
          Math.abs(safeOriginalAmount - expense.amount) > 0.001 ||
          safeOriginalCurrency !== expense.currency
            ? ` (Original: ${safeOriginalAmount.toFixed(
                2,
              )} ${safeOriginalCurrency})`
            : "";

        const deletedIndicator = expense.isDeleted
          ? chalk.red(" [DELETED]")
          : "";
        const idToDisplay =
          options.reindex && expense._displayId !== undefined
            ? expense._displayId
            : expense.id;

        console.log(
          `${idToDisplay}. ${convertedDisplay}${originalDisplay} - ${expense.description} (${formattedDate})${deletedIndicator}`,
        );
      });
    } finally {
      stopLoadingMessage();
    }
  });

program
  .command("total [filter]") // MODIFIED: Added optional [filter] argument to catch invalid inputs
  .alias("t")
  .description("Show total amount spent per currency")
  .option("--date <YYYY-MM-DD>", "Filter by specific date")
  .option("--day <Day>", "Filter by day name (e.g., Monday)")
  .option("--month <1-12>", "Filter by month")
  .option("--week <1-5>", "Filter by week number of the month (1-5)")
  .option("--year <YYYY>", "Filter by year")
  .option("--all", "Include deleted expenses in the total calculation")
  .action(async (filter, options) => {
    // MODIFIED: Action now receives "filter" and "options"
    // --- ADDED: Block to catch and reject direct arguments ---
    if (filter) {
      console.error(chalk.red("\n❌ Error: Invalid command format."));
      console.error(
        chalk.yellow(
          "Please provide filters using options like --date, --month, or --year.",
        ),
      );
      console.log(chalk.blue("\nFor example:"));
      console.log(chalk.green("  expense total --date 2025-08-01"));
      console.log(chalk.green("  expense total --month 8 --year 2025"));
      process.exit(1);
    }
    // --- END of new block ---

    // The original logic of the command continues below
    validateFilterOptions(options);

    startLoadingMessage("Calculating total expenses");
    try {
      const allExpenses = readExpenses();
      let filteredExpenses = filterExpenses(allExpenses, options, options.all);

      if (!filteredExpenses.length) {
        console.log(chalk.yellow("ℹ️  No expenses to total."));
        return;
      }

      const { titleLabel: label } = generateExportLabels(options);
      let displayLabel = label;
      if (options.all) {
        displayLabel += " (Including Deleted)";
      }
      console.log(chalk.blueBright(`\n💸 Total Spent for ${displayLabel}:`));

      const config = getConfig();
      const preferredCurrency = config.preferredCurrency || "USD";

      const totals = {};
      const unconvertedCurrenciesInFilteredSet = new Set();
      for (const e of filteredExpenses) {
        const currentCurrency = e.currency ?? e.originalCurrency ?? "USD";
        if (!totals[currentCurrency]) totals[currentCurrency] = 0;
        totals[currentCurrency] += e.amount;
        if (currentCurrency !== preferredCurrency) {
          unconvertedCurrenciesInFilteredSet.add(currentCurrency);
        }
      }

      const currencies = Object.keys(totals);
      currencies.sort((a, b) => {
        if (a === preferredCurrency) return -1;
        if (b === preferredCurrency) return 1;
        return a.localeCompare(b);
      });

      if (currencies.length > 0) {
        currencies.forEach((currency) => {
          const amount = totals[currency].toFixed(2);
          if (currency === preferredCurrency) {
            console.log(`  ${chalk.green(currency)}: ${amount} (Preferred)`);
          } else {
            console.log(
              `  ${currency}: ${amount} (Not converted to Preferred Currency ${preferredCurrency})`,
            );
          }
        });
      } else {
        console.log(chalk.red(`No expenses found with any currency.`));
      }
      console.log();

      if (
        unconvertedCurrenciesInFilteredSet.size > 0 &&
        preferredCurrency !== null
      ) {
        stopLoadingMessage();

        const confirmedConversion = await promptConfirmation(
          chalk.blue(
            `Do you want to convert unconverted currencies from this filtered list to your Preferred Currency (${preferredCurrency})?`,
          ),
        );

        if (confirmedConversion) {
          pushToUndoStack("currency-conversion");
          clearRedoStack();

          let expensesToWrite = readExpenses();
          let totalConvertedCount = 0;

          const sortedUnconvertedCurrencies = Array.from(
            unconvertedCurrenciesInFilteredSet,
          ).sort();

          for (const currencyToConvert of sortedUnconvertedCurrencies) {
            if (currencyToConvert === preferredCurrency) continue;

            console.log(
              chalk.blue(
                `\n--- Converting ${currencyToConvert} to ${preferredCurrency} ---`,
              ),
            );
            console.log(
              chalk.blue(
                `To find live exchange rates for 1 ${currencyToConvert} to ${preferredCurrency}, you can visit:`,
              ),
            );
            console.log(
              `  ${chalk.underline.bold(
                "1. XE.com: https://www.xe.com/currencyconverter/",
              )}`,
            );
            console.log(
              `  ${chalk.underline.bold(
                "2. Wise: https://wise.com/currency-converter/",
              )}`,
            );
            console.log(
              `  ${chalk.underline.bold(
                "3. OANDA: https://www.oanda.com/currency-converter/en/",
              )}\n`,
            );

            const openLinkConfirmation = await promptConfirmation(
              chalk.blue(
                "Would you like to open one of these links in your browser now?",
              ),
            );

            if (openLinkConfirmation) {
              let linkChoice = "";
              while (!["1", "2", "3"].includes(linkChoice)) {
                const rlChoice = readline.createInterface({
                  input: process.stdin,
                  output: process.stdout,
                });
                linkChoice = await new Promise((resolve) => {
                  rlChoice.question(
                    chalk.cyan(
                      "Enter the number of the link you want to open (1, 2, or 3): ",
                    ),
                    (answer) => {
                      rlChoice.close();
                      resolve(answer.trim());
                    },
                  );
                });
                if (!["1", "2", "3"].includes(linkChoice)) {
                  console.log(
                    chalk.yellow("Invalid choice. Please enter 1, 2, or 3."),
                  );
                }
              }

              let urlToOpen;
              if (linkChoice === "1")
                urlToOpen = "https://www.xe.com/currencyconverter/";
              else if (linkChoice === "2")
                urlToOpen = "https://wise.com/currency-converter/";
              else if (linkChoice === "3")
                urlToOpen = "https://www.oanda.com/currency-converter/en/";

              if (urlToOpen) {
                openUrlInBrowser(urlToOpen);
              }
            }

            let exchangeRate = null;
            let rateAttempts = 0;
            const maxRateAttempts = 3;
            let isValidRate = false;

            while (!isValidRate && rateAttempts < maxRateAttempts) {
              const rl = readline.createInterface({
                input: process.stdin,
                output: process.stdout,
              });
              const rateInput = await new Promise((resolve) => {
                rl.question(
                  chalk.cyan(
                    `Enter the exchange rate (1 ${currencyToConvert} = X ${preferredCurrency}) (Attempt ${
                      rateAttempts + 1
                    }/${maxRateAttempts}): `,
                  ),
                  (answer) => {
                    rl.close();
                    resolve(answer.trim());
                  },
                );
              });

              const parsedRate = parseFloat(rateInput);
              if (!isNaN(parsedRate) && parsedRate > 0) {
                exchangeRate = parsedRate;
                isValidRate = true;
              } else {
                console.error(
                  chalk.red(
                    "❌ Invalid exchange rate. Please enter a positive number.",
                  ),
                );
              }
              rateAttempts++;
            }

            if (isValidRate) {
              let currentCurrencyConvertedCount = 0;
              for (const expense of expensesToWrite) {
                const isExpenseInFilteredSet = filteredExpenses.some(
                  (fe) => fe.id === expense.id,
                );

                if (
                  isExpenseInFilteredSet &&
                  expense.currency === currencyToConvert
                ) {
                  expense.originalAmount =
                    expense.originalAmount ?? expense.amount;
                  expense.originalCurrency =
                    expense.originalCurrency ?? expense.currency;
                  expense.amount = expense.originalAmount * exchangeRate;
                  expense.currency = preferredCurrency;
                  currentCurrencyConvertedCount++;
                }
              }
              totalConvertedCount += currentCurrencyConvertedCount;
              console.log(
                chalk.green(
                  `✅ Converted ${currentCurrencyConvertedCount} expenses from ${currencyToConvert} to ${preferredCurrency}.`,
                ),
              );
            } else {
              console.log(
                chalk.yellow(
                  `Conversion for ${currencyToConvert} cancelled due to invalid exchange rate input.`,
                ),
              );
            }
          }

          if (totalConvertedCount > 0) {
            writeExpenses(expensesToWrite);
            console.log(
              chalk.green(
                `\n✨ All eligible expenses have been converted to ${preferredCurrency}.`,
              ),
            );
            console.log(
              chalk.blueBright(`\n💸 Updated Total Spent for ${displayLabel}:`),
            );

            const updatedFilteredExpenses = filterExpenses(
              expensesToWrite,
              options,
              options.all,
            );

            const updatedTotals = {};
            for (const e of updatedFilteredExpenses) {
              const currentCurrency = e.currency ?? e.originalCurrency ?? "USD";
              if (!updatedTotals[currentCurrency])
                updatedTotals[currentCurrency] = 0;
              updatedTotals[currentCurrency] += e.amount;
            }

            const updatedCurrencies = Object.keys(updatedTotals);
            updatedCurrencies.sort((a, b) => {
              if (a === preferredCurrency) return -1;
              if (b === preferredCurrency) return 1;
              return a.localeCompare(b);
            });

            updatedCurrencies.forEach((currency) => {
              const amount = updatedTotals[currency].toFixed(2);
              if (currency === preferredCurrency) {
                console.log(
                  `  ${chalk.green(currency)}: ${amount} (Preferred)`,
                );
              } else {
                console.log(
                  `  ${currency}: ${amount} (Not converted to Preferred Currency ${preferredCurrency})`,
                );
              }
            });
            console.log();
          } else {
            console.log(chalk.yellow("No expenses were converted."));
          }
        } else {
          console.log(
            chalk.yellow("Keeping unconverted currencies as they are."),
          );
        }
      } else if (preferredCurrency === null) {
        console.log(
          chalk.yellow(
            "ℹ️  No preferred currency set. Run `expense change-currency --currency <CODE>` to set one.",
          ),
        );
      }
    } finally {
      stopLoadingMessage();
    }
  });

program
  .command("export [filter]") // MODIFIED: Added optional [filter] argument to catch invalid inputs
  .alias("x")
  .description("Export expenses to CSV or PDF")
  .option("--csv", "Export to CSV file")
  .option("--pdf", "Export to PDF receipt file")
  .option("--date <YYYY-MM-DD>", "Filter by specific date")
  .option("--day <Day>", "Filter by day name (e.g., Monday)")
  .option("--month <1-12>", "Filter by month")
  .option("--week <1-5>", "Filter by week number of the month (1-5)")
  .option("--year <YYYY>", "Filter by year")
  .option("--open", "Open the exported file automatically")
  .option("--all", "Include deleted expenses in the export")
  .action(async (filter, options) => {
    // MODIFIED: Action now receives "filter" and "options"
    // --- ADDED: Block to catch and reject direct arguments ---
    if (filter) {
      console.error(chalk.red("\n❌ Error: Invalid command format."));
      console.error(
        chalk.yellow(
          "Please provide filters using options like --date, --month, or --year.",
        ),
      );
      console.log(chalk.blue("\nFor example:"));
      console.log(chalk.green("  expense export --pdf --date 2025-08-01"));
      console.log(chalk.green("  expense export --csv --month 8"));
      process.exit(1);
    }
    // --- END of new block ---

    // The original logic of the command continues below
    validateFilterOptions(options);

    startLoadingMessage("Exporting expenses");
    try {
      if (!options.csv && !options.pdf) {
        console.log(
          chalk.yellow("ℹ️  Please specify an export format: --pdf or --csv."),
        );
        return;
      }

      let expenses = readExpenses();
      expenses = filterExpenses(expenses, options, options.all);

      if (!expenses.length) {
        console.log(chalk.yellow("ℹ️  No expenses to export."));
        return;
      }

      const downloadsDir = getDownloadsFolder();
      const { filenameLabel, titleLabel } = generateExportLabels(options);

      const config = getConfig();
      const preferredCurrency = config.preferredCurrency || "USD";

      function escapeCsv(text) {
        if (typeof text !== "string") text = String(text);
        if (text.includes(",") || text.includes("\n") || text.includes('"')) {
          return `"${text.replace(/"/g, '""')}"`;
        }
        return text;
      }

      if (options.csv) {
        const headers = [
          "Expense ID",
          "Converted Amount",
          "Converted Currency",
          "Original Amount",
          "Original Currency",
          "Description",
          "Date",
          "Is Deleted",
          "Deleted At",
        ];
        const csvHeader =
          headers.map((header) => escapeCsv(header)).join(",") + "\n";
        const csvRows = expenses
          .map((e) => {
            const safeOriginalAmount = e.originalAmount ?? e.amount;
            const safeOriginalCurrency = e.originalCurrency ?? e.currency;
            return [
              e.id,
              e.amount.toFixed(2),
              e.currency,
              safeOriginalAmount.toFixed(2),
              safeOriginalCurrency,
              e.description,
              formatDate(e.date),
              e.isDeleted ? "Yes" : "No",
              e.deletedAt || "",
            ]
              .map((cell) => escapeCsv(cell))
              .join(",");
          })
          .join("\n");

        const csvPath = path.join(
          downloadsDir,
          `${filenameLabel}_${Date.now()}.csv`,
        );
        fs.writeFileSync(csvPath, csvHeader + csvRows, "utf-8");

        console.log(
          chalk.green(`✅ Exported CSV to your Downloads folder: ${csvPath}`),
        );
        if (options.open) openFile(csvPath);
      }

      const footerMargin = 30;

      if (options.pdf) {
        try {
          const pdfDoc = await PDFDocument.create();
          let page = pdfDoc.addPage();
          const { width, height } = page.getSize();
          const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
          const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
          const headerFontSize = 9;
          const cellFontSize = 8;
          const headerLineHeight = headerFontSize + 3;
          const cellLineHeight = cellFontSize + 4;
          const columnPaddingX = 5;

          let y = height - 60;

          page.drawText(`Expense Receipt for ${titleLabel}`, {
            x: 50,
            y,
            size: 18,
            font: boldFont,
            color: rgb(0, 0, 0),
          });
          y -= 40;

          const rawHeaders = [
            "ID",
            `Converted Amount\n(${preferredCurrency})`,
            "Converted\nCurrency",
            "Original\nAmount",
            "Original\nCurrency",
            "Description",
            "Date",
            "Deleted?",
            "Deleted At",
          ];
          const columnWidths = [30, 60, 50, 60, 50, 85, 75, 40, 75];

          const drawHeaders = (currentPageParam, currentY) => {
            let maxLines = 1;
            const wrappedHeadersForDrawing = rawHeaders.map(
              (headerText, index) => {
                const headerMaxWidth = columnWidths[index] - columnPaddingX;
                const lines = wrapTextForPdf(
                  headerText,
                  headerMaxWidth,
                  boldFont,
                  headerFontSize,
                );
                maxLines = Math.max(maxLines, lines.length);
                return lines;
              },
            );

            const blockHeight = maxLines * headerLineHeight;
            let currentXForHeaders = 50;

            for (let i = 0; i < maxLines; i++) {
              currentXForHeaders = 50;
              wrappedHeadersForDrawing.forEach((headerLines, colIndex) => {
                if (headerLines[i]) {
                  currentPageParam.drawText(headerLines[i], {
                    x: currentXForHeaders + columnPaddingX / 2,
                    y: currentY - i * headerLineHeight,
                    size: headerFontSize,
                    font: boldFont,
                    color: rgb(0, 0, 0),
                  });
                }
                currentXForHeaders += columnWidths[colIndex];
              });
            }
            return { newY: currentY - blockHeight, blockHeight: blockHeight };
          };

          const headerDrawResult = drawHeaders(page, y);
          y = headerDrawResult.newY;
          y -= 10;
          page.drawLine({
            start: { x: 50, y },
            end: { x: width - 50, y },
            color: rgb(0, 0, 0),
            thickness: 1,
          });
          y -= 20;

          expenses.forEach((e) => {
            const safeOriginalAmount = e.originalAmount ?? e.amount;
            const safeOriginalCurrency = e.originalCurrency ?? e.currency;

            const descriptionLines = wrapTextForPdf(
              e.description,
              columnWidths[5] - columnPaddingX,
              font,
              cellFontSize,
            );
            const requiredTextHeight =
              Math.max(1, descriptionLines.length) * cellLineHeight;
            const requiredRowHeight = requiredTextHeight + 15;

            if (y - requiredRowHeight < footerMargin) {
              page = pdfDoc.addPage();
              y = height - 60;

              const newPageHeaderDrawResult = drawHeaders(page, y);
              y = newPageHeaderDrawResult.newY;
              y -= 10;
              page.drawLine({
                start: { x: 50, y },
                end: { x: width - 50, y },
                color: rgb(0, 0, 0),
                thickness: 1,
              });
              y -= 20;
            }

            const rowData = [
              `${e.id}`,
              `${e.amount.toFixed(2)}`,
              `${e.currency}`,
              `${safeOriginalAmount.toFixed(2)}`,
              `${safeOriginalCurrency}`,
              e.description,
              formatDate(e.date),
              e.isDeleted ? "Yes" : "No",
              e.deletedAt ? formatDate(e.deletedAt) : "",
            ];

            let currentX = 50;
            let cellY = y;

            rowData.forEach((cell, cellIndex) => {
              if (cellIndex === 5) {
                const wrappedText = wrapTextForPdf(
                  cell,
                  columnWidths[5] - columnPaddingX,
                  font,
                  cellFontSize,
                );
                wrappedText.forEach((line, lineIndex) => {
                  page.drawText(line, {
                    x: currentX + columnPaddingX / 2,
                    y: cellY - lineIndex * cellLineHeight,
                    size: cellFontSize,
                    font,
                    color: rgb(0, 0, 0),
                  });
                });
              } else {
                page.drawText(cell, {
                  x: currentX + columnPaddingX / 2,
                  y: cellY,
                  size: cellFontSize,
                  font,
                  color: rgb(0, 0, 0),
                });
              }
              currentX += columnWidths[cellIndex];
            });

            y -= requiredTextHeight;
            y -= 10;
            page.drawLine({
              start: { x: 50, y },
              end: { x: width - 50, y },
              color: rgb(0, 0, 0),
              thickness: 1,
            });
            y -= 15;
          });

          const pageCount = pdfDoc.getPages().length;
          for (let i = 0; i < pageCount; i++) {
            pdfDoc.getPages()[i].drawText(`Page ${i + 1} of ${pageCount}`, {
              x: width - 120,
              y: footerMargin,
              size: 10,
              font: font,
              color: rgb(0.5, 0.5, 0.5),
            });
          }

          const pdfBytes = await pdfDoc.save();
          const pdfPath = path.join(
            downloadsDir,
            `${filenameLabel}_${Date.now()}.pdf`,
          );
          fs.writeFileSync(pdfPath, Buffer.from(pdfBytes));

          console.log(
            chalk.green(`✅ Exported PDF to your Downloads folder: ${pdfPath}`),
          );
          if (options.open) openFile(pdfPath);
        } catch (err) {
          console.error(chalk.red("❌ Failed to export PDF:"), err);
        }
      }
    } finally {
      stopLoadingMessage();
    }
  });

// New 'manual' command definition - NEWLY ADDED BLOCK
program
  .command("manual")
  .description(
    "Generate a PDF manual with all commands, options, and examples.",
  )
  .option("--open", "Open the generated PDF automatically")
  .action(async (options) => {
    startLoadingMessage("Generating manual");
    try {
      const pdfDoc = await PDFDocument.create();
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
      const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      let currentPage = pdfDoc.addPage();
      const { width, height } = currentPage.getSize();

      // --- FIX: Define layout variables here, before they are used ---
      const margin = 50;
      const lineHeight = 12; // Base line height for text
      const sectionSpacing = 20; // Space between major sections/commands
      let y = height - 50; // Initial Y position
      // --- END FIX ---

      const addPageIfNeeded = (requiredHeight = lineHeight * 3) => {
        // Default to space for 3 lines of text
        if (y < margin + requiredHeight) {
          currentPage = pdfDoc.addPage();
          y = height - 50;
        }
      };

      // Title
      currentPage.drawText("expenses-tracker-cli Manual", {
        x: margin,
        y,
        size: 24,
        font: boldFont,
        color: rgb(0, 0, 0),
      });
      y -= 40; // Space after title

      // Introduction
      addPageIfNeeded();
      currentPage.drawText(
        "This manual provides a comprehensive guide to all commands and options available in the Expense Tracker CLI.",
        {
          x: margin,
          y,
          size: 10,
          font: font,
          color: rgb(0.2, 0.2, 0.2),
        },
      );
      y -= lineHeight * 2;

      // Global Options Section
      addPageIfNeeded();
      currentPage.drawText("Global Options:", {
        x: margin,
        y,
        size: 16,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= lineHeight * 1.5;

      // Filter out internal Commander options like --no-color if they are exposed via program.options
      const filteredGlobalOptions = program.options.filter(
        (opt) => opt.flags === "-h, --help" || opt.flags === "-v, --version",
      );

      filteredGlobalOptions.forEach((opt) => {
        addPageIfNeeded();
        const optionName = opt.flags;
        const optionDesc = opt.description;
        const optText = `${optionName}: ${optionDesc}`;
        const wrappedOptText = wrapTextForPdf(
          optText,
          width - 2 * margin - 10,
          font,
          10,
        );
        wrappedOptText.forEach((line) => {
          currentPage.drawText(line, {
            x: margin + 10,
            y,
            size: 10,
            font: font,
            color: rgb(0.2, 0.2, 0.2),
          });
          y -= lineHeight;
        });
        y -= lineHeight * 0.5; // Small space between options
      });
      y -= 20; // Space after global options section

      // Commands Section
      currentPage.drawText("Commands:", {
        x: margin,
        y,
        size: 16,
        font: boldFont,
        color: rgb(0.1, 0.1, 0.1),
      });
      y -= lineHeight * 1.5;

      const allCommands = program.commands;

      for (const cmd of allCommands) {
        // Estimate required height for the command section to decide on new page
        // Name (1.2 line), Desc (min 1 line, potentially more), Usage (1.5 line), Options (variable), Example (1.5 line), Spacing (2 lines)
        let estimatedCmdHeight = lineHeight * (1.2 + 1 + 1.5 + 1.5 + 2); // Base estimate
        if (cmd.options.length > 0) {
          estimatedCmdHeight += cmd.options.length * (lineHeight * 1.1); // Add height for options
        }
        addPageIfNeeded(estimatedCmdHeight);

        const cmdName = cmd.name();
        const cmdAliases = cmd.aliases().join(", ");
        const cmdDescription = cmd.description();
        // Commander's .usage() is generally useful for argument syntax (e.g., "<amount> <description...>")
        const usageArgs = cmd.usage();
        const fullUsage = `${program.name()} ${cmdName}${
          usageArgs ? ` ${usageArgs}` : ""
        }`;

        const example = commandExamples[cmdName] || `expense ${cmdName}`; // Fallback example

        // Command Name
        currentPage.drawText(
          `${cmdName}${cmdAliases ? ` (${cmdAliases})` : ""}`,
          {
            x: margin,
            y,
            size: 14,
            font: boldFont,
            color: rgb(0.1, 0.4, 0.8),
          },
        );
        y -= lineHeight * 1.2;

        // Description
        const descLines = wrapTextForPdf(
          cmdDescription,
          width - 2 * margin - 10,
          font,
          10,
        );
        descLines.forEach((line) => {
          currentPage.drawText(line, {
            x: margin + 10,
            y,
            size: 10,
            font: font,
            color: rgb(0.2, 0.2, 0.2),
          });
          y -= lineHeight;
        });
        y -= lineHeight * 0.5;

        // Usage
        currentPage.drawText(`Usage: ${fullUsage}`, {
          x: margin + 10,
          y,
          size: 10,
          font: font,
          color: rgb(0.3, 0.3, 0.3),
        });
        y -= lineHeight * 1.5;

        // Options
        if (cmd.options.length > 0) {
          currentPage.drawText("Options:", {
            x: margin + 10,
            y,
            size: 11,
            font: boldFont,
            color: rgb(0.3, 0.3, 0.3),
          });
          y -= lineHeight * 1.2;
          cmd.options.forEach((opt) => {
            addPageIfNeeded(); // Check for space before each option
            const optionFlags = opt.flags;
            const optionDesc = opt.description;
            const optionDefault =
              opt.defaultValue !== undefined
                ? ` (default: ${opt.defaultValue})`
                : "";
            const optLine = `${optionFlags}: ${optionDesc}${optionDefault}`;
            const wrappedOptLines = wrapTextForPdf(
              optLine,
              width - 2 * margin - 20,
              font,
              9,
            );
            wrappedOptLines.forEach((line) => {
              currentPage.drawText(line, {
                x: margin + 20,
                y,
                size: 9,
                font: font,
                color: rgb(0.4, 0.4, 0.4),
              });
              y -= lineHeight * 0.9;
            });
            y -= lineHeight * 0.2;
          });
          y -= lineHeight * 0.5;
        }

        // Example
        if (example) {
          currentPage.drawText("Example:", {
            x: margin + 10,
            y,
            size: 11,
            font: boldFont,
            color: rgb(0.3, 0.3, 0.3),
          });
          y -= lineHeight * 1.2;
          currentPage.drawText(example, {
            x: margin + 20,
            y,
            size: 10,
            font: font,
            color: rgb(0.1, 0.5, 0.1),
          });
          y -= sectionSpacing;
        }
        y -= sectionSpacing; // Extra space between commands
      }

      // Footer for page numbers
      const pages = pdfDoc.getPages();
      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        page.drawText(`Page ${i + 1} of ${pages.length}`, {
          x: width - margin - 50,
          y: margin / 2,
          size: 8,
          font: font,
          color: rgb(0.5, 0.5, 0.5),
        });
      }

      const pdfBytes = await pdfDoc.save();
      const downloadsDir = getDownloadsFolder();
      const manualPath = path.join(
        downloadsDir,
        `expenses-tracker-cli-manual_${Date.now()}.pdf`,
      );
      fs.writeFileSync(manualPath, Buffer.from(pdfBytes));

      console.log(chalk.green(`✅ PDF manual generated at: ${manualPath}`));
      if (options.open) {
        openFile(manualPath);
      }
    } catch (error) {
      console.error(chalk.red("❌ Failed to generate PDF manual:"), error);
    } finally {
      stopLoadingMessage();
    }
  });

// --- NEW: Undo and Redo Commands ---
program
  .command("undo")
  .description("Revert the last data-modifying operation.")
  .action(async () => {
    startLoadingMessage("Attempting to undo last operation");
    try {
      stopLoadingMessage(); // Stop spinner before confirmation
      const undoStack = readStack(undoStackFile);
      const undoneCommand =
        undoStack.length > 0 ? undoStack[undoStack.length - 1].command : null;

      const confirmQuestion = undoneCommand
        ? chalk.red(
            `⚠️  Are you sure you want to undo the last '${undoneCommand}' operation? This will revert your data to the previous state.`,
          )
        : chalk.red(
            "⚠️  Are you sure you want to undo the last operation? This will revert your data to the previous state.",
          );

      const confirmed = await promptConfirmation(confirmQuestion);

      if (!confirmed) {
        console.log(chalk.yellow("Operation cancelled. Nothing was undone."));
        return;
      }

      const result = popFromUndoStack();
      if (result) {
        console.log(
          chalk.green(`✅ Last operation ('${result}') successfully undone.`),
        );
      } else {
        console.log(
          chalk.yellow("ℹ️  Nothing to undo. The undo history is empty."),
        );
      }
    } finally {
      stopLoadingMessage();
    }
  });

program
  .command("redo")
  .description("Re-apply the last undone operation.")
  .action(async () => {
    startLoadingMessage("Attempting to redo last operation");
    try {
      stopLoadingMessage(); // Stop spinner before confirmation
      const redoStack = readStack(redoStackFile);
      const redoneCommand =
        redoStack.length > 0 ? redoStack[redoStack.length - 1].command : null;

      const confirmQuestion = redoneCommand
        ? chalk.blue(
            `❓ Are you sure you want to redo the last '${redoneCommand}' operation? This will re-apply the previously undone changes.`,
          )
        : chalk.blue(
            "❓ Are you sure you want to redo the last operation? This will re-apply the previously undone changes.",
          );

      const confirmed = await promptConfirmation(confirmQuestion);

      if (!confirmed) {
        console.log(chalk.yellow("Operation cancelled. Nothing was redone."));
        return;
      }

      const result = popFromRedoStack();
      if (result) {
        console.log(
          chalk.green(`✅ Last operation ('${result}') successfully redone.`),
        );
      } else {
        console.log(
          chalk.yellow(
            "ℹ️  Nothing to redo. The redo history is empty or cleared by a new command.",
          ),
        );
      }
    } finally {
      stopLoadingMessage();
    }
  });

// *** NEW FEATURE: Main execution logic to handle startup checks ***
async function main() {
  // Handle the case where no subcommand is provided (just 'expense')
  if (process.argv.length === 2) {
    console.log(
      chalk.cyan(
        "\nWelcome to expenses-tracker-cli! Your personal expense tracker.",
      ),
    );
    console.log(
      chalk.yellow("--------------------------------------------------"),
    );
    console.log(chalk.yellow("To get started, try one of these commands:"));
    console.log(
      `  ${chalk.green(
        "expense add <amount> <description>",
      )} - Add a new expense`,
    );
    console.log(`  ${chalk.green("expense list")} - View all your expenses`);
    console.log(`  ${chalk.green("expense total")} - See your total spending`);
    console.log(
      `  ${chalk.green(
        "expense change-currency --currency <3-letter currency code e.g., USD, EUR>",
      )} - Set your preferred currency`,
    );
    console.log(
      chalk.yellow(
        `\nYou can also filter expenses based on week, month, year, or specific date when typing list,total or export subcommand.`,
      ),
    );
    console.log(
      chalk.blue(
        `\nFor a full list of commands and options, type: ${chalk.bold(
          "expense --help",
        )}`,
      ),
    );
    console.log(
      chalk.blue(
        `For a comprehensive PDF manual, type: ${chalk.bold(
          "expense manual [--open]",
        )}`,
      ),
    );
    console.log(
      chalk.blue(
        `To undo your last action, type: ${chalk.bold("expense undo")}`,
      ),
    );
    console.log(
      chalk.blue(
        `To redo your last undone action, type: ${chalk.bold("expense redo")}`,
      ),
    );
    process.exit(0);
  }

  // First Run Currency Setup Logic
  const config = getConfig();
  const commandToRun = process.argv[2]; // The potential command

  // List of commands that should NOT trigger the initial currency setup
  const exemptCommands = new Set([
    "change-currency",
    "manual",
    "undo",
    "redo",
    "reset",
    "delete",
    "d", // alias for delete
    "recover",
    "--help",
    "-h",
    "--version",
    "-v",
  ]);

  // Trigger prompt if currency is not set AND it's not the welcome screen AND it's not an exempt command
  if (config.preferredCurrency === null && !exemptCommands.has(commandToRun)) {
    const setupSuccess = await promptForInitialCurrency();
    if (!setupSuccess) {
      process.exit(0); // Exit gracefully if user cancels setup
    }
    // Add a separator for cleaner UI after the initial setup
    console.log(
      chalk.gray("--------------------------------------------------"),
    );
  }

  // Parse arguments. This should be the very last step for Commander to process arguments.
  // Any command not caught by the top-level interception (i.e., a valid command or --help/-v)
  // will be handled by Commander's built-in parsing.
  program.parse(process.argv);
}

// Call the main async function and catch any top-level errors
main().catch((err) => {
  stopLoadingMessage(); // Ensure spinner is stopped on error
  console.error(chalk.red("\nAn unexpected error occurred:"), err);
  process.exit(1);
});
