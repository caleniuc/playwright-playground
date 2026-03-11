# Playwright Playground

Interactive browser for testing Playwright locators and code against your existing Chrome session — no test runner needed.

## Prerequisites

1. **Node.js** 18+
2. **`@playwright/cli`** installed globally:
   ```bash
   npm i -g @playwright/cli
   ```
3. **Playwright MCP Bridge** Chrome extension:
   [Install from Chrome Web Store](https://chromewebstore.google.com/detail/playwright-mcp-bridge/mmlmfjhmonkocbjadbfplnigmagldckm)

## Usage

```bash
npm start
```

- Click the **Playwright MCP Bridge** extension icon in Chrome to connect
- Open `http://localhost:7331` in your browser
- Write Playwright code using `page` — `async (page) => { ... }`
- **Ctrl+Enter** or click **▶ Run** to execute

### Custom port

```bash
PORT=8080 npm start
```

## Why

Lets you test Playwright locators against a live page where you're already logged in, without restarting Chrome or managing auth state.
