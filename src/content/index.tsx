import { createRoot } from 'react-dom/client';
import { WidgetApp } from './WidgetApp';

// Inject Widget UI
const injectWidget = () => {
  const container = document.createElement('div');
  container.id = 'netspy-root';
  
  // Use shadow DOM to prevent CSS collision
  const shadow = container.attachShadow({ mode: 'open' });
  const rootDiv = document.createElement('div');
  rootDiv.id = 'netspy-widget-container';
  
  // Inject global styles into shadow DOM
  const styleLink = document.createElement('link');
  styleLink.rel = 'stylesheet';
  styleLink.href = chrome.runtime.getURL('assets/index.css'); // Ensure this name matches build output or generic css
  
  shadow.appendChild(styleLink);
  shadow.appendChild(rootDiv);
  document.body.appendChild(container);
  
  createRoot(rootDiv).render(<WidgetApp /> as any);
};

if (document.readyState === 'complete') {
  injectWidget();
} else {
  window.addEventListener('load', injectWidget);
}

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
    const meta: any = {
      title: document.title,
      description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
      keywords: document.querySelector('meta[name="keywords"]')?.getAttribute('content'),
      ogTitle: document.querySelector('meta[property="og:title"]')?.getAttribute('content'),
      ogDescription: document.querySelector('meta[property="og:description"]')?.getAttribute('content'),
      ogImage: document.querySelector('meta[property="og:image"]')?.getAttribute('content'),
      canonical: document.querySelector('link[rel="canonical"]')?.getAttribute('href'),
    };
    sendResponse(meta);
    return true;
  }

  if (message.type === 'TOGGLE_OUTLINES') {
    const id = 'dev-sphere-outlines';
    let style = document.getElementById(id);
    if (style) {
      style.remove();
      sendResponse({ active: false });
    } else {
      style = document.createElement('style');
      style.id = id;
      style.textContent = '* { outline: 1px solid rgba(255,0,0,0.3) !important; }';
      document.head.appendChild(style);
      sendResponse({ active: true });
    }
    return true;
  }

  if (message.type === 'CLEAR_STORAGE') {
    localStorage.clear();
    sessionStorage.clear();
    // Cookies can only be cleared for the current domain via document.cookie
    document.cookie.split(';').forEach(c => {
      document.cookie = c.replace(/^ +/, '').replace(/=.*/, '=;expires=' + new Date().toUTCString() + ';path=/');
    });
    sendResponse({ ok: true });
    return true;
  }

  if (message.type === 'GET_HEALTH') {
    const all = document.querySelectorAll('*');
    let maxDepth = 0;
    const getDepth = (el: Element, depth: number): number => {
      maxDepth = Math.max(maxDepth, depth);
      if (el.children.length > 0) {
        Array.from(el.children).forEach(c => getDepth(c, depth + 1));
      }
      return maxDepth;
    };
    getDepth(document.body, 1);
    
    sendResponse({
      totalElements: all.length,
      maxDepth: maxDepth,
      accessibilityIssues: document.querySelectorAll('img:not([alt])').length + document.querySelectorAll('button:not([aria-label]):not([title])').length
    });
    return true;
  }
});

