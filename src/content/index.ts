// Content script — NetSpy
// Responds to messages from the popup

// ── Console log capture ───────────────────────────────────────────────────────

interface LogEntry {
  level: 'log' | 'warn' | 'error' | 'info';
  message: string;
  timestamp: number;
}

const capturedLogs: LogEntry[] = [];
const MAX_LOGS = 200;

(['log', 'warn', 'error', 'info'] as const).forEach(level => {
  const original = console[level].bind(console);
  console[level] = (...args: unknown[]) => {
    original(...args);
    capturedLogs.push({
      level,
      message: args.map(a => {
        try { return typeof a === 'object' ? JSON.stringify(a) : String(a); }
        catch { return String(a); }
      }).join(' '),
      timestamp: Date.now(),
    });
    if (capturedLogs.length > MAX_LOGS) capturedLogs.shift();
  };
});

// ── Message handler ───────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_PAGE_LINKS') {
    const links: string[] = [];
    document.querySelectorAll('a[href]').forEach(el => {
      const href = (el as HTMLAnchorElement).href;
      if (href) links.push(href);
    });
    sendResponse(links);
    return true;
  }

  if (message.type === 'GET_CONSOLE_LOGS') {
    sendResponse([...capturedLogs]);
    return true;
  }

  if (message.type === 'CLEAR_CONSOLE_LOGS') {
    capturedLogs.length = 0;
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'GET_PAGE_META') {
    sendResponse({
      title: document.title,
      url: location.href,
      cookies: document.cookie ? document.cookie.split(';').length : 0,
      scripts: document.querySelectorAll('script[src]').length,
      iframes: document.querySelectorAll('iframe').length,
      forms: document.querySelectorAll('form').length,
      inputs: document.querySelectorAll('input[type=password]').length,
    });
    return true;
  }
});
