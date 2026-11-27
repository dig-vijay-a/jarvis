/**
 * NOVA Entity Resolution Service
 * Resolves natural language user entities into canonical applications, system utilities,
 * files, websites, and context references.
 * Prevents literal phrases (e.g. "my latest presentation") from being erroneously treated as app names.
 */

export const CANONICAL_APPLICATIONS = {
  // Text & Editors
  notepad: { canonical: 'notepad', executable: 'notepad.exe', type: 'APPLICATION', displayName: 'Notepad' },
  'writing workspace': { canonical: 'notepad', executable: 'notepad.exe', type: 'APPLICATION', displayName: 'Notepad' },
  'editor': { canonical: 'notepad', executable: 'notepad.exe', type: 'APPLICATION', displayName: 'Notepad' },
  'editor windows': { canonical: 'notepad', executable: 'notepad.exe', type: 'APPLICATION', displayName: 'Notepad' },
  'quick draft': { canonical: 'notepad', executable: 'notepad.exe', type: 'APPLICATION', displayName: 'Notepad' },
  'text editor': { canonical: 'notepad', executable: 'notepad.exe', type: 'APPLICATION', displayName: 'Notepad' },
  'notes': { canonical: 'notepad', executable: 'notepad.exe', type: 'APPLICATION', displayName: 'Notepad' },
  code: { canonical: 'code', executable: 'code.cmd', type: 'APPLICATION', displayName: 'Visual Studio Code' },
  vscode: { canonical: 'code', executable: 'code.cmd', type: 'APPLICATION', displayName: 'Visual Studio Code' },
  'vs code': { canonical: 'code', executable: 'code.cmd', type: 'APPLICATION', displayName: 'Visual Studio Code' },
  'visual studio code': { canonical: 'code', executable: 'code.cmd', type: 'APPLICATION', displayName: 'Visual Studio Code' },
  'coding environment': { canonical: 'code', executable: 'code.cmd', type: 'APPLICATION', displayName: 'Visual Studio Code' },
  'code editor': { canonical: 'code', executable: 'code.cmd', type: 'APPLICATION', displayName: 'Visual Studio Code' },
  antigravity: { canonical: 'antigravity', executable: 'code.cmd', type: 'APPLICATION', displayName: 'Antigravity IDE' },
  'antigravity ide': { canonical: 'antigravity', executable: 'code.cmd', type: 'APPLICATION', displayName: 'Antigravity IDE' },
  sublime: { canonical: 'subl', executable: 'subl.exe', type: 'APPLICATION', displayName: 'Sublime Text' },

  // Browsers
  chrome: { canonical: 'chrome', executable: 'chrome.exe', type: 'APPLICATION', displayName: 'Google Chrome' },
  googlechrome: { canonical: 'chrome', executable: 'chrome.exe', type: 'APPLICATION', displayName: 'Google Chrome' },
  'google chrome': { canonical: 'chrome', executable: 'chrome.exe', type: 'APPLICATION', displayName: 'Google Chrome' },
  browser: { canonical: 'chrome', executable: 'chrome.exe', type: 'APPLICATION', displayName: 'Web Browser' },
  'web browser': { canonical: 'chrome', executable: 'chrome.exe', type: 'APPLICATION', displayName: 'Web Browser' },
  'internet navigator': { canonical: 'chrome', executable: 'chrome.exe', type: 'APPLICATION', displayName: 'Web Browser' },
  'web browsing': { canonical: 'chrome', executable: 'chrome.exe', type: 'APPLICATION', displayName: 'Web Browser' },
  'web browsing window': { canonical: 'chrome', executable: 'chrome.exe', type: 'APPLICATION', displayName: 'Web Browser' },
  'browsing tabs and frames': { canonical: 'chrome', executable: 'chrome.exe', type: 'APPLICATION', displayName: 'Web Browser' },
  'browsing tabs': { canonical: 'chrome', executable: 'chrome.exe', type: 'APPLICATION', displayName: 'Web Browser' },
  edge: { canonical: 'msedge', executable: 'msedge.exe', type: 'APPLICATION', displayName: 'Microsoft Edge' },
  msedge: { canonical: 'msedge', executable: 'msedge.exe', type: 'APPLICATION', displayName: 'Microsoft Edge' },
  firefox: { canonical: 'firefox', executable: 'firefox.exe', type: 'APPLICATION', displayName: 'Mozilla Firefox' },
  brave: { canonical: 'brave', executable: 'brave.exe', type: 'APPLICATION', displayName: 'Brave Browser' },

  // Utilities & Math
  calculator: { canonical: 'calculator', executable: 'calc.exe', type: 'APPLICATION', displayName: 'Calculator' },
  calc: { canonical: 'calculator', executable: 'calc.exe', type: 'APPLICATION', displayName: 'Calculator' },
  'utility i use for calculations': { canonical: 'calculator', executable: 'calc.exe', type: 'APPLICATION', displayName: 'Calculator' },
  'calculator screens': { canonical: 'calculator', executable: 'calc.exe', type: 'APPLICATION', displayName: 'Calculator' },
  paint: { canonical: 'mspaint', executable: 'mspaint.exe', type: 'APPLICATION', displayName: 'Paint' },
  mspaint: { canonical: 'mspaint', executable: 'mspaint.exe', type: 'APPLICATION', displayName: 'Paint' },

  // Windows System Management & Snap-ins
  'device manager': { canonical: 'devmgmt', executable: 'devmgmt.msc', type: 'SYSTEM_UTILITY', displayName: 'Device Manager' },
  devicemanager: { canonical: 'devmgmt', executable: 'devmgmt.msc', type: 'SYSTEM_UTILITY', displayName: 'Device Manager' },
  devmgmt: { canonical: 'devmgmt', executable: 'devmgmt.msc', type: 'SYSTEM_UTILITY', displayName: 'Device Manager' },
  'task manager': { canonical: 'taskmgr', executable: 'taskmgr.exe', type: 'SYSTEM_UTILITY', displayName: 'Task Manager' },
  taskmanager: { canonical: 'taskmgr', executable: 'taskmgr.exe', type: 'SYSTEM_UTILITY', displayName: 'Task Manager' },
  taskmgr: { canonical: 'taskmgr', executable: 'taskmgr.exe', type: 'SYSTEM_UTILITY', displayName: 'Task Manager' },
  'control panel': { canonical: 'control', executable: 'control.exe', type: 'SYSTEM_UTILITY', displayName: 'Control Panel' },
  controlpanel: { canonical: 'control', executable: 'control.exe', type: 'SYSTEM_UTILITY', displayName: 'Control Panel' },
  control: { canonical: 'control', executable: 'control.exe', type: 'SYSTEM_UTILITY', displayName: 'Control Panel' },
  settings: { canonical: 'settings', executable: 'ms-settings:', type: 'SYSTEM_UTILITY', displayName: 'Windows Settings' },
  'windows settings': { canonical: 'settings', executable: 'ms-settings:', type: 'SYSTEM_UTILITY', displayName: 'Windows Settings' },
  'windows settings panel': { canonical: 'settings', executable: 'ms-settings:', type: 'SYSTEM_UTILITY', displayName: 'Windows Settings' },
  'settings panel': { canonical: 'settings', executable: 'ms-settings:', type: 'SYSTEM_UTILITY', displayName: 'Windows Settings' },
  
  // Terminals & System
  terminal: { canonical: 'terminal', executable: 'wt.exe', type: 'APPLICATION', displayName: 'Windows Terminal' },
  'terminal session': { canonical: 'terminal', executable: 'wt.exe', type: 'APPLICATION', displayName: 'Windows Terminal' },
  'new terminal session': { canonical: 'terminal', executable: 'wt.exe', type: 'APPLICATION', displayName: 'Windows Terminal' },
  cmd: { canonical: 'cmd', executable: 'cmd.exe', type: 'APPLICATION', displayName: 'Command Prompt' },
  'command prompt': { canonical: 'cmd', executable: 'cmd.exe', type: 'APPLICATION', displayName: 'Command Prompt' },
  powershell: { canonical: 'powershell', executable: 'powershell.exe', type: 'APPLICATION', displayName: 'PowerShell' },
  explorer: { canonical: 'explorer', executable: 'explorer.exe', type: 'APPLICATION', displayName: 'File Explorer' },
  files: { canonical: 'explorer', executable: 'explorer.exe', type: 'APPLICATION', displayName: 'File Explorer' },

  // Media & Social
  spotify: { canonical: 'spotify', executable: 'Spotify.exe', type: 'APPLICATION', displayName: 'Spotify' },
  discord: { canonical: 'discord', executable: 'Discord.exe', type: 'APPLICATION', displayName: 'Discord' },
  slack: { canonical: 'slack', executable: 'slack.exe', type: 'APPLICATION', displayName: 'Slack' },

  // Office Suite
  word: { canonical: 'word', executable: 'winword.exe', type: 'APPLICATION', displayName: 'Microsoft Word' },
  excel: { canonical: 'excel', executable: 'excel.exe', type: 'APPLICATION', displayName: 'Microsoft Excel' },
  powerpoint: { canonical: 'powerpoint', executable: 'powerpnt.exe', type: 'APPLICATION', displayName: 'Microsoft PowerPoint' }
};

export class EntityResolutionService {
  /**
   * Resolves an entity query into a typed classification
   */
  static resolveEntity(rawInput) {
    if (!rawInput || typeof rawInput !== 'string') {
      return { type: 'UNKNOWN', original: '' };
    }

    const trimmed = rawInput.trim();
    const normalized = trimmed.toLowerCase().replace(/^(?:the|my|a|an)\s+/i, '').trim();
    const cleanAlpha = normalized.replace(/[^a-z0-9]/g, '');

    // 1. Check for pronoun or anaphoric reference
    if (/^(it|that|this|them|the result|the second result|the document|the draft|the file)$/i.test(trimmed)) {
      return {
        type: 'PRONOUN_REFERENCE',
        original: trimmed,
        referenceKey: trimmed.toLowerCase()
      };
    }

    // 2. Check for File / Document queries (e.g. "my latest presentation", "project proposal.docx", "report.pdf")
    if (/(?:presentation|slides|deck|report|proposal|resume|notes|budget|spreadsheet|document|\.pptx|\.docx|\.pdf|\.txt|\.xlsx|\.csv|\.json|\.md)/i.test(normalized)) {
      let pattern = '*';
      if (/presentation|slides|deck|\.pptx/i.test(normalized)) pattern = '*.pptx';
      else if (/report|proposal|document|\.docx/i.test(normalized)) pattern = '*.docx';
      else if (/pdf|\.pdf/i.test(normalized)) pattern = '*.pdf';
      else if (/spreadsheet|budget|\.xlsx|\.csv/i.test(normalized)) pattern = '*.xlsx';
      else if (/notes|\.txt|\.md/i.test(normalized)) pattern = '*.txt';

      return {
        type: 'FILE',
        original: trimmed,
        pattern,
        isLatest: /latest|newest|recent|last/i.test(normalized),
        searchTerm: normalized
      };
    }

    // 3. Check for Website / URL
    if (/(?:https?:\/\/|www\.|\.com|\.org|\.io|\.net|\.ai|\.dev|youtube|github|reddit|wikipedia)/i.test(normalized)) {
      let url = trimmed;
      if (!/^https?:\/\//i.test(url)) {
        if (/^(?:youtube|github|reddit|wikipedia)/i.test(normalized)) {
          url = `https://www.${normalized.split(/[\s/]/)[0]}.com`;
        } else {
          url = `https://${url}`;
        }
      }
      return {
        type: 'WEBSITE',
        original: trimmed,
        url
      };
    }

    // 4. Check Canonical Applications & System Utilities
    if (CANONICAL_APPLICATIONS[normalized]) {
      const app = CANONICAL_APPLICATIONS[normalized];
      return {
        type: app.type,
        canonical: app.canonical,
        executable: app.executable,
        displayName: app.displayName,
        original: trimmed
      };
    }

    if (CANONICAL_APPLICATIONS[cleanAlpha]) {
      const app = CANONICAL_APPLICATIONS[cleanAlpha];
      return {
        type: app.type,
        canonical: app.canonical,
        executable: app.executable,
        displayName: app.displayName,
        original: trimmed
      };
    }

    // Check word-boundary matches in canonical apps (avoid matching 'code' inside 'codename')
    for (const [key, app] of Object.entries(CANONICAL_APPLICATIONS)) {
      const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (key === normalized || key === cleanAlpha || new RegExp(`\\b${escapedKey}\\b`, 'i').test(normalized)) {
        return {
          type: app.type,
          canonical: app.canonical,
          executable: app.executable,
          displayName: app.displayName,
          original: trimmed
        };
      }
    }

    // Default unknown / general entity
    return {
      type: 'UNKNOWN',
      original: trimmed,
      clean: cleanAlpha
    };
  }

  /**
   * Resolves canonical application name string or null if not an app
   */
  static resolveApplicationName(rawName) {
    const res = this.resolveEntity(rawName);
    if (res.type === 'APPLICATION' || res.type === 'SYSTEM_UTILITY') {
      return res.canonical;
    }
    return null;
  }
}

export default EntityResolutionService;
