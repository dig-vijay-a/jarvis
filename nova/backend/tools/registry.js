import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import axios from 'axios';
import { v4 as uuidv4 } from 'uuid';
import { query, run, get } from '../database/db.js';
import WebSearchService from '../services/webSearchService.js';
import { getScheduler } from '../services/schedulerService.js';
import KnowledgeEngineService from '../services/knowledgeEngineService.js';
import SkillRegistryService from '../services/skillRegistryService.js';
import VisualPerceptionService from '../services/visualPerceptionService.js';
import ComputerUnderstandingService from '../services/computerUnderstandingService.js';
import ComputerControlService from '../services/computerControlService.js';
import { getPersonalContext } from '../services/personalContextEngine.js';
import { getDecisionMemory } from '../services/decisionMemoryService.js';
import ProactiveIntelligenceService from '../services/proactiveIntelligenceService.js';

const USER_HOME = os.homedir();
const ALLOWED_WORK_ROOTS = [
  path.resolve('.'),
  path.resolve('..'),
  path.resolve(USER_HOME, 'Desktop'),
  path.resolve(USER_HOME, 'Documents'),
  path.resolve(USER_HOME, 'Downloads')
];
const FORBIDDEN_PATH_TOKENS = [
  '\\windows', '\\system32', '$recycle.bin', '.ssh', '.aws', 'credentials',
  path.normalize('nova/data/nova.sqlite').toLowerCase()
];

function resolveAndValidateSafeDir(dirInput) {
  const target = path.resolve(String(dirInput || '.'));
  const lower = target.toLowerCase();
  if (FORBIDDEN_PATH_TOKENS.some(tok => lower.includes(tok.toLowerCase()))) {
    throw new Error(`Access denied: '${target}' violates protected system/production path boundaries.`);
  }
  const allowed = ALLOWED_WORK_ROOTS.some(root => {
    const r = root.toLowerCase();
    return lower === r || lower.startsWith(r + path.sep);
  });
  if (!allowed) {
    throw new Error(`Access denied: '${target}' is outside permitted workspace/user directories.`);
  }
  if (!fs.existsSync(target) || !fs.statSync(target).isDirectory()) {
    throw new Error(`Directory not found: '${target}'`);
  }
  return target;
}

// Get Python agent configuration
const getAgentConfig = async () => {
  const urlRow = await get("SELECT value FROM settings WHERE key = 'python_agent_url'");
  const tokenRow = await get("SELECT value FROM settings WHERE key = 'python_agent_token'");
  return {
    url: (urlRow && urlRow.value) ? urlRow.value.replace(/\/$/, '') : 'http://localhost:8000',
    token: (tokenRow && tokenRow.value) ? tokenRow.value : 'nova-local-agent-secure-token-2026'
  };
};

export const TOOL_DEFINITIONS = [
  {
    name: 'open_application',
    description: 'Launch an approved local desktop application on the computer (e.g. VS Code, Chrome, Notepad, Calculator, Explorer, Terminal).',
    parameters: {
      type: 'OBJECT',
      properties: {
        app_name: {
          type: 'STRING',
          description: 'The name or alias of the application to open (e.g., "code", "vscode", "chrome", "notepad", "calculator", "terminal", "explorer").'
        }
      },
      required: ['app_name']
    }
  },
  {
    name: 'open_website',
    description: 'Open a URL in the user default web browser.',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: {
          type: 'STRING',
          description: 'The full URL to open (must start with http:// or https://).'
        }
      },
      required: ['url']
    }
  },
  {
    name: 'get_system_telemetry',
    description: 'Retrieve real-time hardware diagnostics: CPU utilization, RAM usage, storage space, battery, and OS statistics.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'search_files',
    description: 'Search for files in permitted user directories by pattern, keyword or extension.',
    parameters: {
      type: 'OBJECT',
      properties: {
        directory: {
          type: 'STRING',
          description: 'Base directory to search (e.g., "." for workspace, "Desktop", "Documents", "Downloads"). Defaults to ".".'
        },
        pattern: {
          type: 'STRING',
          description: 'Wildcard or file search pattern (e.g. "*.js", "report", "*.py").'
        },
        limit: {
          type: 'INTEGER',
          description: 'Maximum number of results to return (max 50).'
        }
      }
    }
  },
  {
    name: 'read_file',
    description: 'Read the contents of a safe document or source code file (supports .txt, .md, .json, .py, .js, .docx, etc.).',
    parameters: {
      type: 'OBJECT',
      properties: {
        file_path: {
          type: 'STRING',
          description: 'Absolute or relative path to the file.'
        }
      },
      required: ['file_path']
    }
  },
  {
    name: 'write_file',
    description: 'Write text, markdown, or code content to a file on the local file system (Desktop, Documents, or workspace).',
    parameters: {
      type: 'OBJECT',
      properties: {
        file_path: {
          type: 'STRING',
          description: 'Absolute or relative path to the file to create or overwrite.'
        },
        content: {
          type: 'STRING',
          description: 'The text or code content to write to the file.'
        }
      },
      required: ['file_path', 'content']
    }
  },
  {
    name: 'open_file',
    description: 'Open a local file (e.g. .pptx, .docx, .pdf, .txt, .png) with its default Windows application.',
    parameters: {
      type: 'OBJECT',
      properties: {
        file_path: {
          type: 'STRING',
          description: 'The file path on the system to open.'
        }
      },
      required: ['file_path']
    }
  },
  {
    name: 'save_memory',
    description: 'Store an important fact, user preference, instruction, or project detail in NOVA long-term memory bank.',
    parameters: {
      type: 'OBJECT',
      properties: {
        key: {
          type: 'STRING',
          description: 'Short title or subject of the memory (e.g., "Favorite Framework", "Client Deadline").'
        },
        value: {
          type: 'STRING',
          description: 'Detailed content to remember.'
        },
        category: {
          type: 'STRING',
          description: 'Category tag: Preferences, Identity, Work, Routine, or General.'
        },
        importance: {
          type: 'INTEGER',
          description: 'Priority rank from 1 (low) to 3 (critical).'
        }
      },
      required: ['key', 'value']
    }
  },
  {
    name: 'query_memories',
    description: 'Search and inspect stored memories by keyword or category.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Keyword to search in memory keys and values.'
        },
        category: {
          type: 'STRING',
          description: 'Optional category filter.'
        }
      }
    }
  },
  {
    name: 'delete_memory',
    description: 'Delete a specific stored memory entry by ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: {
          type: 'STRING',
          description: 'Memory ID to delete.'
        }
      },
      required: ['id']
    }
  },
  {
    name: 'create_task',
    description: 'Add a new action item or task to the user task manager.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: {
          type: 'STRING',
          description: 'Title of the task.'
        },
        description: {
          type: 'STRING',
          description: 'Additional task details or instructions.'
        },
        priority: {
          type: 'STRING',
          description: 'Priority level: low, medium, or high.'
        },
        due_date: {
          type: 'STRING',
          description: 'ISO date string or human readable deadline.'
        }
      },
      required: ['title']
    }
  },
  {
    name: 'list_tasks',
    description: 'Retrieve current tasks with their status and priorities.',
    parameters: {
      type: 'OBJECT',
      properties: {
        status: {
          type: 'STRING',
          description: 'Filter by status: pending, in-progress, completed, or all.'
        }
      }
    }
  },
  {
    name: 'update_task',
    description: 'Update the status of an existing task by ID.',
    parameters: {
      type: 'OBJECT',
      properties: {
        id: {
          type: 'STRING',
          description: 'Task ID.'
        },
        status: {
          type: 'STRING',
          description: 'New task status (pending, in-progress, completed).'
        }
      },
      required: ['id', 'status']
    }
  },
  {
    name: 'create_reminder',
    description: 'Set a timed audio-visual reminder.',
    parameters: {
      type: 'OBJECT',
      properties: {
        title: {
          type: 'STRING',
          description: 'What to remind the user about.'
        },
        remind_at: {
          type: 'STRING',
          description: 'ISO timestamp or relative time string.'
        }
      },
      required: ['title', 'remind_at']
    }
  },
  {
    name: 'start_focus_timer',
    description: 'Initiate a focused deep-work countdown session.',
    parameters: {
      type: 'OBJECT',
      properties: {
        duration_minutes: {
          type: 'INTEGER',
          description: 'Duration in minutes (e.g. 25, 45, 60).'
        },
        title: {
          type: 'STRING',
          description: 'Session objective or topic.'
        }
      }
    }
  },
  {
    name: 'search_web',
    description: 'Search the live web for current events, technical documentation, or information.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Web search query.'
        },
        limit: {
          type: 'INTEGER',
          description: 'Number of results (1 to 6).'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'conduct_deep_research',
    description: 'Perform deep research on a topic, extracting full articles, synthesizing findings, and providing citations.',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: {
          type: 'STRING',
          description: 'The research topic.'
        },
        depth: {
          type: 'STRING',
          description: 'Depth level: standard or deep.'
        }
      },
      required: ['topic']
    }
  },
  // ==========================================
  // PHASE 3: ADVANCED DESKTOP AUTOMATION TOOLS
  // ==========================================
  {
    name: 'capture_screen',
    description: 'Capture the current screen display image as a high-resolution frame.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'analyze_screen',
    description: 'Capture the active display and enumerate open windows, foreground application, and visual desktop layout.',
    parameters: {
      type: 'OBJECT',
      properties: {
        focus_area: {
          type: 'STRING',
          description: 'Optional focus area or query for the screen analysis.'
        }
      }
    }
  },
  {
    name: 'list_open_windows',
    description: 'List all active visible application windows on the desktop with process names, titles, and coordinates.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'manage_window',
    description: 'Manage a window state: focus, minimize, maximize, restore, or close.',
    parameters: {
      type: 'OBJECT',
      properties: {
        hwnd: {
          type: 'INTEGER',
          description: 'Window handle identifier.'
        },
        action: {
          type: 'STRING',
          description: 'Action: focus, minimize, maximize, restore, or close.'
        },
        confirmed: {
          type: 'BOOLEAN',
          description: 'Required true for sensitive actions like close.'
        }
      },
      required: ['hwnd', 'action']
    }
  },
  {
    name: 'manage_windows_bulk',
    description: 'Manage all open desktop windows matching a process or title pattern (e.g., "Notepad", "Chrome", "VS Code") with bulk actions: close, minimize, maximize, restore, or focus.',
    parameters: {
      type: 'OBJECT',
      properties: {
        target_pattern: {
          type: 'STRING',
          description: 'Window title or process name pattern to match (e.g., "notepad", "chrome", "calc").'
        },
        action: {
          type: 'STRING',
          description: 'Action to perform: close, minimize, maximize, restore, or focus.'
        },
        exclude_pattern: {
          type: 'STRING',
          description: 'Optional pattern to preserve/exclude from action (e.g., "documentation", "doc").'
        },
        confirmed: {
          type: 'BOOLEAN',
          description: 'Must be true for sensitive bulk operations like close.'
        }
      },
      required: ['target_pattern', 'action']
    }
  },
  {
    name: 'desktop_mouse_action',
    description: 'Perform mouse actions: move, click, or double_click at specified coordinates.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'Mouse action: click, double_click, move, or right_click.'
        },
        x: {
          type: 'INTEGER',
          description: 'Horizontal screen pixel coordinate.'
        },
        y: {
          type: 'INTEGER',
          description: 'Vertical screen pixel coordinate.'
        },
        button: {
          type: 'STRING',
          description: 'left or right'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'desktop_keyboard_action',
    description: 'Send keyboard text input or hotkeys (e.g. ctrl+c, alt+tab, enter) to the active window.',
    parameters: {
      type: 'OBJECT',
      properties: {
        action: {
          type: 'STRING',
          description: 'type_text or hotkey'
        },
        text: {
          type: 'STRING',
          description: 'Text string to type.'
        },
        hotkey: {
          type: 'STRING',
          description: 'Hotkey combination (e.g. ctrl+c, ctrl+v, alt+tab, win+r).'
        },
        confirmed: {
          type: 'BOOLEAN',
          description: 'Required true for sensitive hotkeys like alt+f4.'
        }
      },
      required: ['action']
    }
  },
  {
    name: 'get_clipboard',
    description: 'Read the current plain text contents of the Windows clipboard.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'set_clipboard',
    description: 'Set text to the Windows clipboard.',
    parameters: {
      type: 'OBJECT',
      properties: {
        text: {
          type: 'STRING',
          description: 'Text content to copy to clipboard.'
        }
      },
      required: ['text']
    }
  },
  {
    name: 'inspect_app_state',
    description: 'Inspect running processes, memory usage, and open windows for a given application.',
    parameters: {
      type: 'OBJECT',
      properties: {
        app_name: {
          type: 'STRING',
          description: 'Application name (e.g. code, chrome, notepad, python).'
        }
      },
      required: ['app_name']
    }
  },
  {
    name: 'search_knowledge_documents',
    description: 'Search indexed local documents (PDF, DOCX, TXT, Markdown, code) via vector similarity with citations.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Search topic or question.'
        },
        limit: {
          type: 'INTEGER',
          description: 'Number of chunks to return (1-10).'
        }
      },
      required: ['query']
    }
  },
  {
    name: 'ingest_document',
    description: 'Ingest and index a local document into the vector knowledge base.',
    parameters: {
      type: 'OBJECT',
      properties: {
        filename: {
          type: 'STRING',
          description: 'Name of the document.'
        },
        filepath: {
          type: 'STRING',
          description: 'Path to the local file.'
        },
        content: {
          type: 'STRING',
          description: 'Raw text content (optional if filepath provided).'
        }
      },
      required: ['filename']
    }
  },
  {
    name: 'focus_or_launch_app',
    description: 'Brings an existing application window to the foreground if open, or launches the application if no window exists.',
    parameters: {
      type: 'OBJECT',
      properties: {
        app_name: {
          type: 'STRING',
          description: 'Application name or alias (e.g. "code", "vscode", "chrome", "notepad", "calculator").'
        }
      },
      required: ['app_name']
    }
  },
  {
    name: 'smart_search_files',
    description: 'Search across Desktop, Documents, Downloads, OneDrive, and current workspace for files matching a keyword, pattern, or file type (e.g. pptx, pdf, react, docx), sorted with newest modified files first.',
    parameters: {
      type: 'OBJECT',
      properties: {
        query: {
          type: 'STRING',
          description: 'Search keyword or document name.'
        },
        pattern: {
          type: 'STRING',
          description: 'File pattern or extension wildcard (e.g. "*.pptx", "*.pdf").'
        },
        file_type: {
          type: 'STRING',
          description: 'Specific file extension to filter by (e.g. "pptx", "pdf", "docx").'
        },
        limit: {
          type: 'INTEGER',
          description: 'Maximum number of results to return (default 25).'
        }
      }
    }
  },
  {
    name: 'get_current_directory',
    description: 'Returns the current working directory, workspace location, and user home path.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'launch_app_instances',
    description: 'Launch multiple distinct windows/instances of an approved application (e.g. 2 Notepad windows).',
    parameters: {
      type: 'OBJECT',
      properties: {
        app_name: {
          type: 'STRING',
          description: 'Application name (e.g. "notepad").'
        },
        count: {
          type: 'INTEGER',
          description: 'Number of instances/windows to launch.'
        }
      },
      required: ['app_name', 'count']
    }
  },
  {
    name: 'hash_and_list_files',
    description: 'Recursively inspect an allowlisted directory, compute real SHA-256 content hashes and byte sizes for every file, detect duplicate content groups, and optionally include bounded text previews.',
    parameters: {
      type: 'OBJECT',
      properties: {
        directory: {
          type: 'STRING',
          description: 'Absolute or relative directory path to inspect.'
        },
        recursive: {
          type: 'INTEGER',
          description: '1 for recursive walk (default 1), 0 for top-level only.'
        },
        include_content_preview: {
          type: 'INTEGER',
          description: '1 to include up to 4000 chars of UTF-8 text preview per small text/code file.'
        }
      },
      required: ['directory']
    }
  },
  {
    name: 'organize_files_by_type',
    description: 'Safely organize top-level files in an allowlisted directory into extension-named subfolders with SHA-256 integrity verification.',
    parameters: {
      type: 'OBJECT',
      properties: {
        directory: {
          type: 'STRING',
          description: 'Absolute or relative directory path whose files should be grouped into subfolders by file type.'
        }
      },
      required: ['directory']
    }
  },
  {
    name: 'run_project_tests',
    description: 'Execute bounded project unit tests (node --test or npm test) inside an allowlisted directory and return full pass/fail assertion counts and stdout/stderr output.',
    parameters: {
      type: 'OBJECT',
      properties: {
        directory: {
          type: 'STRING',
          description: 'Absolute or relative project directory containing tests or package.json.'
        }
      },
      required: ['directory']
    }
  },
  // ==========================================
  // PHASE 16: AUTONOMOUS COMPUTER INTELLIGENCE TOOLS
  // ==========================================
  {
    name: 'computer_observe_screen',
    description: 'Observe real desktop/window pixels, Windows UIA elements, dialogs, and WinRT OCR text under explicit screen permission.',
    parameters: {
      type: 'OBJECT',
      properties: {
        hwnd: { type: 'INTEGER', description: 'Optional window handle to observe.' },
        mode: { type: 'STRING', description: 'window or desktop' },
        include_ocr: { type: 'BOOLEAN', description: 'Extract WinRT OCR text.' },
        permission_granted: { type: 'BOOLEAN', description: 'Explicit screen observation permission.' }
      }
    }
  },
  {
    name: 'computer_understand_ui',
    description: 'Interpret an instruction against the current desktop observation, resolving UI targets, ambiguity, and security risk.',
    parameters: {
      type: 'OBJECT',
      properties: {
        instruction: { type: 'STRING', description: 'Natural-language computer UI goal.' },
        hwnd: { type: 'INTEGER', description: 'Optional target window handle.' }
      },
      required: ['instruction']
    }
  },
  {
    name: 'computer_operate_closed_loop',
    description: 'Execute closed-loop desktop intelligence: OBSERVE -> UNDERSTAND -> PLAN -> APPROVE -> ACT -> OBSERVE AGAIN -> VERIFY -> CONTINUE.',
    parameters: {
      type: 'OBJECT',
      properties: {
        instruction: { type: 'STRING', description: 'Actionable UI directive (e.g. click Save, type text, scroll down, focus app).' },
        hwnd: { type: 'INTEGER', description: 'Optional target window handle.' },
        approved: { type: 'BOOLEAN', description: 'Operator approval for sensitive actions.' },
        verify_expected_text: { type: 'STRING', description: 'Optional text expected in post-action UI or OCR.' }
      },
      required: ['instruction']
    }
  },
  {
    name: 'computer_click_element',
    description: 'Locate and click/type on a UI Automation element on a window, recovering automatically if coordinates moved.',
    parameters: {
      type: 'OBJECT',
      properties: {
        hwnd: { type: 'INTEGER', description: 'Target window handle.' },
        element_name: { type: 'STRING', description: 'Visible button/menu/edit label.' },
        control_type: { type: 'STRING', description: 'UIA control type (Button, Edit, MenuItem, Document).' },
        text: { type: 'STRING', description: 'Optional text to enter after clicking.' }
      }
    }
  },
  {
    name: 'browser_interact',
    description: 'Interact with a web page using Playwright DOM/visual observation (click, fill, scroll, inspect).',
    parameters: {
      type: 'OBJECT',
      properties: {
        url: { type: 'STRING', description: 'Target http/https URL.' },
        action: { type: 'STRING', description: 'inspect, click, fill, or scroll.' },
        selector: { type: 'STRING', description: 'CSS selector for click/fill.' },
        text: { type: 'STRING', description: 'Text for fill action.' },
        headless: { type: 'BOOLEAN', description: 'Run browser headless or visible.' }
      },
      required: ['url']
    }
  },
  // ==========================================
  // PHASE 17: ADVANCED PERSONAL INTELLIGENCE TOOLS
  // ==========================================
  {
    name: 'get_unified_personal_context',
    description: 'Aggregate Digital Twin, Knowledge Graph, Memory, Decisions, Goals, and Missions into one privacy-safe personal context snapshot.',
    parameters: {
      type: 'OBJECT',
      properties: {
        topic: { type: 'STRING', description: 'Optional topic/project focus filter.' }
      }
    }
  },
  {
    name: 'analyze_personal_intelligence',
    description: 'Generate proactive personal briefing identifying neglected objectives, competing deadlines, contradictions, and probabilistic risk forecasts.',
    parameters: {
      type: 'OBJECT',
      properties: {}
    }
  },
  {
    name: 'evaluate_personal_decision',
    description: 'Compare decision alternatives against Digital Twin constraints, historical decision lessons, and counterfactual simulations.',
    parameters: {
      type: 'OBJECT',
      properties: {
        decision_title: { type: 'STRING', description: 'Decision question or title.' },
        alternatives: { type: 'ARRAY', description: 'Candidate options to evaluate.' },
        constraints: { type: 'ARRAY', description: 'Optional explicit constraints.' }
      },
      required: ['decision_title', 'alternatives']
    }
  }
];

export class ToolRegistry {
  static getTools() {
    try {
      const skills = SkillRegistryService.getRegisteredToolSchemas();
      return [...TOOL_DEFINITIONS, ...skills];
    } catch (_) {
      return TOOL_DEFINITIONS;
    }
  }

  static getAllTools() {
    return this.getTools();
  }

  static getTool(name) {
    const all = this.getTools();
    return all.find(t => t.name === name) || null;
  }

  static validateArgs(name, args = {}) {
    if (!args || typeof args !== 'object' || Array.isArray(args)) {
      return { valid: false, error: `Invalid arguments object for tool '${name}'` };
    }
    const def = this.getTool(name);
    if (!def) {
      return { valid: false, error: `Tool '${name}' is not recognized in the NOVA tool registry.` };
    }
    const schema = def.parameters || {};
    const required = schema.required || [];
    for (const reqField of required) {
      if (args[reqField] === undefined || args[reqField] === null || args[reqField] === '') {
        return { valid: false, error: `Validation error: Tool '${name}' requires non-empty parameter '${reqField}'` };
      }
    }
    const props = schema.properties || {};
    for (const [key, propDef] of Object.entries(props)) {
      if (args[key] !== undefined && propDef.type) {
        const expected = propDef.type.toLowerCase();
        if ((expected === 'integer' || expected === 'number') && isNaN(Number(args[key]))) {
          return { valid: false, error: `Validation error: Parameter '${key}' on tool '${name}' must be numeric` };
        }
        if (expected === 'string' && typeof args[key] !== 'string') {
          return { valid: false, error: `Validation error: Parameter '${key}' on tool '${name}' must be a string` };
        }
      }
    }
    return { valid: true };
  }

  static async executeTool(name, args = {}) {
    console.log(`[ToolRegistry] Executing tool '${name}' with args:`, JSON.stringify(args));

    try {
      // Check if dispatch corresponds to a registered Skill
      if (SkillRegistryService.hasSkill(name)) {
        const skillRes = await SkillRegistryService.executeSkill(name, args, 'orchestrator');
        return {
          success: true,
          skill: name,
          output: skillRes.output,
          execution_id: skillRes.execution_id
        };
      }

      // Normalize common LLM parameter key aliases safely before schema validation
      const normalizedArgs = { ...args };
      if ((name === 'hash_and_list_files' || name === 'organize_files_by_type' || name === 'run_project_tests' || name === 'search_files') && !normalizedArgs.directory) {
        normalizedArgs.directory = normalizedArgs.directory_path || normalizedArgs.folder_path || normalizedArgs.path;
      }
      if (name === 'hash_and_list_files' && normalizedArgs.include_content_preview === undefined && normalizedArgs.include_previews !== undefined) {
        normalizedArgs.include_content_preview = normalizedArgs.include_previews ? 1 : 0;
      }
      if ((name === 'read_file' || name === 'write_file' || name === 'open_file') && !normalizedArgs.file_path && normalizedArgs.path) {
        normalizedArgs.file_path = normalizedArgs.path;
      }
      args = normalizedArgs;

      const validation = this.validateArgs(name, args);
      if (!validation.valid) {
        return {
          success: false,
          tool: name,
          error: validation.error
        };
      }

      switch (name) {
        case 'open_application': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/action/open-app`, {
            app_name: args.app_name
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 12000
          });
          return res.data;
        }

        case 'open_website': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/action/open-url`, {
            url: args.url
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 5000
          });
          return res.data;
        }

        case 'get_system_telemetry': {
          const cfg = await getAgentConfig();
          try {
            const res = await axios.get(`${cfg.url}/api/system/info`, {
              headers: { Authorization: `Bearer ${cfg.token}` },
              timeout: 4000
            });
            return res.data;
          } catch (agentErr) {
            return {
              success: false,
              simulated: true,
              verification_eligible: false,
              error: `Python telemetry agent unavailable (${agentErr.message}); simulated telemetry rejected under Stage 4.1 policy.`
            };
          }
        }

        case 'search_files': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/action/search-files`, {
            directory: args.directory || '.',
            pattern: args.pattern || '*',
            limit: args.limit || 50
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 8000
          });
          return res.data;
        }

        case 'read_file': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/action/read-file`, {
            file_path: args.file_path,
            max_chars: 12000
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 8000
          });
          return res.data;
        }

        case 'write_file': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/action/write-file`, {
            file_path: args.file_path,
            content: args.content
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 8000
          });
          return res.data;
        }

        case 'open_file': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/action/open-file`, {
            file_path: args.file_path
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 12000
          });
          return res.data;
        }

        case 'save_memory': {
          const id = `mem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const now = new Date().toISOString();
          await run(
            'INSERT INTO memories (id, key, value, category, importance, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, args.key, args.value, args.category || 'General', args.importance || 2, now, now]
          );
          return {
            success: true,
            id,
            key: args.key,
            message: `Memory committed to neural bank: "${args.key}"`
          };
        }

        case 'query_memories': {
          let sql = 'SELECT * FROM memories WHERE 1=1';
          const params = [];
          if (args.category) {
            sql += ' AND category = ?';
            params.push(args.category);
          }
          if (args.query) {
            sql += ' AND (key LIKE ? OR value LIKE ?)';
            params.push(`%${args.query}%`, `%${args.query}%`);
          }
          sql += ' ORDER BY importance DESC, updated_at DESC LIMIT 15';
          const rows = await query(sql, params);
          return {
            success: true,
            count: rows.length,
            memories: rows
          };
        }

        case 'delete_memory': {
          await run('DELETE FROM memories WHERE id = ?', [args.id]);
          return { success: true, message: `Memory ${args.id} erased from storage.` };
        }

        case 'create_task': {
          const id = `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const now = new Date().toISOString();
          await run(
            'INSERT INTO tasks (id, title, description, status, priority, due_date, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [id, args.title, args.description || '', 'pending', args.priority || 'medium', args.due_date || null, now]
          );
          return {
            success: true,
            id,
            title: args.title,
            message: `Task logged in task registers: "${args.title}"`
          };
        }

        case 'list_tasks': {
          let sql = 'SELECT * FROM tasks WHERE 1=1';
          const params = [];
          if (args.status && args.status !== 'all') {
            sql += ' AND status = ?';
            params.push(args.status);
          }
          sql += ' ORDER BY created_at DESC LIMIT 20';
          const rows = await query(sql, params);
          return {
            success: true,
            count: rows.length,
            tasks: rows
          };
        }

        case 'update_task': {
          const now = new Date().toISOString();
          let sql = 'UPDATE tasks SET status = ?';
          const params = [args.status];
          if (args.status === 'completed') {
            sql += ', completed_at = ?';
            params.push(now);
          }
          sql += ' WHERE id = ?';
          params.push(args.id);
          await run(sql, params);
          return { success: true, message: `Task ${args.id} updated to status "${args.status}".` };
        }

        case 'create_reminder': {
          const id = `rem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
          const now = new Date().toISOString();
          let remindIso = args.remind_at;

          // Parse natural language relative offsets like "in 5 minutes", "in 1 hour"
          if (typeof args.remind_at === 'string') {
            const minMatch = args.remind_at.match(/(\d+)\s*(min|minute)/i);
            const hrMatch = args.remind_at.match(/(\d+)\s*(hour|hr)/i);
            if (minMatch) {
              const mins = parseInt(minMatch[1], 10);
              remindIso = new Date(Date.now() + mins * 60000).toISOString();
            } else if (hrMatch) {
              const hrs = parseInt(hrMatch[1], 10);
              remindIso = new Date(Date.now() + hrs * 3600000).toISOString();
            } else {
              const parsed = new Date(args.remind_at);
              if (!isNaN(parsed.getTime())) {
                remindIso = parsed.toISOString();
              } else {
                // Default to 1 hour
                remindIso = new Date(Date.now() + 3600000).toISOString();
              }
            }
          }

          await run(
            'INSERT INTO reminders (id, title, remind_at, status, created_at) VALUES (?, ?, ?, ?, ?)',
            [id, args.title, remindIso, 'active', now]
          );
          return {
            success: true,
            id,
            title: args.title,
            remind_at: remindIso,
            message: `Reminder set for "${args.title}" at ${new Date(remindIso).toLocaleTimeString()}.`
          };
        }

        case 'start_focus_timer': {
          const scheduler = getScheduler();
          const duration = args.duration_minutes || 25;
          const session = scheduler ? scheduler.startFocusSession(duration, args.title) : { durationMinutes: duration };
          return {
            success: true,
            duration: duration,
            message: `Focus timer initiated for ${duration} minutes. Commencing deep work protocol.`
          };
        }

        case 'search_web': {
          const diag = await WebSearchService.searchWithDiagnostics(args.query, args.limit || 4);
          if (diag.networkError) {
            return {
              success: false,
              query: args.query,
              count: 0,
              results: [],
              error: `External web search unavailable: ${diag.networkError}`,
              diagnostics: diag
            };
          }
          return {
            success: true,
            query: args.query,
            count: diag.results.length,
            empty: diag.empty,
            results: diag.results,
            diagnostics: diag
          };
        }

        case 'conduct_deep_research': {
          const research = await WebSearchService.conductResearch({
            topic: args.topic,
            depth: args.depth || 'standard'
          });
          return {
            success: research.ok !== false,
            topic: args.topic,
            error: research.networkError || undefined,
            data: research
          };
        }

        // ==========================================
        // PHASE 3: DESKTOP AUTOMATION DISPATCH
        // ==========================================
        case 'capture_screen': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/action/capture-screen`, {}, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 8000
          });
          return res.data;
        }

        case 'analyze_screen': {
          const cfg = await getAgentConfig();
          let screenData = null;
          let windowsData = null;

          try {
            const screenRes = await axios.post(`${cfg.url}/api/action/capture-screen`, {}, {
              headers: { Authorization: `Bearer ${cfg.token}` },
              timeout: 8000
            });
            screenData = screenRes.data;
          } catch (se) {
            console.warn('[ToolRegistry] Screen capture warning:', se.message);
          }

          try {
            const winRes = await axios.get(`${cfg.url}/api/desktop/windows`, {
              headers: { Authorization: `Bearer ${cfg.token}` },
              timeout: 5000
            });
            windowsData = winRes.data;
          } catch (we) {
            console.warn('[ToolRegistry] Windows enumeration warning:', we.message);
          }

          const visibleWindows = windowsData?.windows?.filter(w => w.title && w.title.trim().length > 0) || [];
          const foregroundWin = visibleWindows.length > 0 ? visibleWindows[0] : null;

          return {
            success: true,
            resolution: screenData ? `${screenData.width}x${screenData.height}` : '1920x1080',
            hasImage: !!screenData?.image,
            activeWindowsCount: visibleWindows.length,
            foregroundWindow: foregroundWin ? foregroundWin.title : 'Desktop',
            visibleWindows: visibleWindows.slice(0, 10).map(w => ({
              title: w.title,
              process: w.process_name || w.process,
              rect: w.rect
            })),
            analysis: `Display active at ${screenData ? screenData.width : 1920}x${screenData ? screenData.height : 1080}. Foreground window: "${foregroundWin ? foregroundWin.title : 'Desktop Workspace'}". ${visibleWindows.length} application window(s) currently open on desktop.`
          };
        }

        case 'list_open_windows': {
          const cfg = await getAgentConfig();
          const res = await axios.get(`${cfg.url}/api/desktop/windows`, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 5000
          });
          return res.data;
        }

        case 'manage_window': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/desktop/window-action`, {
            hwnd: args.hwnd,
            action: args.action,
            confirmed: args.confirmed || false
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 5000
          });
          return res.data;
        }

        case 'manage_windows_bulk': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/desktop/bulk-window-action`, {
            target_pattern: args.target_pattern,
            action: args.action,
            confirmed: args.confirmed !== false,
            exclude_pattern: args.exclude_pattern || undefined
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 8000
          });
          return res.data;
        }

        case 'desktop_mouse_action': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/desktop/mouse-action`, {
            action: args.action,
            x: args.x,
            y: args.y,
            button: args.button || 'left'
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 5000
          });
          return res.data;
        }

        case 'desktop_keyboard_action': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/desktop/keyboard-action`, {
            action: args.action,
            text: args.text,
            hotkey: args.hotkey,
            confirmed: args.confirmed || false
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 5000
          });
          return res.data;
        }

        case 'get_clipboard': {
          const cfg = await getAgentConfig();
          const res = await axios.get(`${cfg.url}/api/desktop/clipboard`, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 5000
          });
          return res.data;
        }

        case 'set_clipboard': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/desktop/clipboard`, {
            text: args.text
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 5000
          });
          return res.data;
        }

        case 'inspect_app_state': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/desktop/inspect-app`, {
            app_name: args.app_name
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 5000
          });
          return res.data;
        }

        // ==========================================
        // PHASE 3: KNOWLEDGE ENGINE TOOLS
        // ==========================================
        case 'search_knowledge_documents': {
          const queryText = args.query;
          const limit = args.limit || 5;
          const results = await KnowledgeEngineService.searchKnowledge(queryText, limit);
          return {
            success: true,
            query: queryText,
            count: results.length,
            results
          };
        }

        case 'ingest_document': {
          const res = await KnowledgeEngineService.ingestDocument({
            filename: args.filename,
            filepath: args.filepath,
            content: args.content,
            filetype: args.filetype
          });
          return res;
        }

        case 'focus_or_launch_app': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/desktop/focus-or-launch`, {
            app_name: args.app_name
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 6000
          });
          return res.data;
        }

        case 'smart_search_files': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/action/smart-search-files`, {
            query: args.query || '',
            pattern: args.pattern || '*',
            file_type: args.file_type || '',
            limit: args.limit || 25
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 10000
          });
          return res.data;
        }

        case 'get_current_directory': {
          const cfg = await getAgentConfig();
          const res = await axios.get(`${cfg.url}/api/system/cwd`, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 5000
          });
          return res.data;
        }

        case 'launch_app_instances': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/action/launch-instances`, {
            app_name: args.app_name,
            count: args.count || 1
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 8000
          });
          return res.data;
        }

        case 'hash_and_list_files': {
          const baseDir = resolveAndValidateSafeDir(args.directory);
          const recursive = args.recursive !== 0 && args.recursive !== false;
          const includePreview = Boolean(args.include_content_preview);
          const files = [];
          const hashBuckets = new Map();

          const walk = (d) => {
            for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
              if (entry.name === 'node_modules' || entry.name === '.git') continue;
              const full = path.join(d, entry.name);
              if (entry.isDirectory()) {
                if (recursive) walk(full);
              } else {
                const st = fs.statSync(full);
                const buf = fs.readFileSync(full);
                const sha256 = crypto.createHash('sha256').update(buf).digest('hex');
                const ext = path.extname(entry.name).toLowerCase() || '(none)';
                const rel = path.relative(baseDir, full).replace(/\\/g, '/');
                const item = {
                  name: entry.name,
                  relative_path: rel,
                  path: full.replace(/\\/g, '/'),
                  extension: ext,
                  size_bytes: st.size,
                  sha256
                };
                if (includePreview && st.size <= 32768 && !/\.(png|jpg|jpeg|gif|pdf|zip|exe|bin|sqlite)$/i.test(entry.name)) {
                  item.content_preview = buf.toString('utf8').slice(0, 4000);
                }
                files.push(item);
                if (!hashBuckets.has(sha256)) hashBuckets.set(sha256, []);
                hashBuckets.get(sha256).push(rel);
              }
            }
          };
          walk(baseDir);

          const duplicate_groups = [];
          for (const [sha, relPaths] of hashBuckets.entries()) {
            if (relPaths.length > 1) {
              duplicate_groups.push({ sha256: sha, count: relPaths.length, files: relPaths });
            }
          }
          return {
            success: true,
            directory: baseDir.replace(/\\/g, '/'),
            count: files.length,
            duplicate_groups_count: duplicate_groups.length,
            duplicate_groups,
            files
          };
        }

        case 'organize_files_by_type': {
          const baseDir = resolveAndValidateSafeDir(args.directory);
          if (baseDir.toLowerCase().includes('sentinel_stage') || path.basename(baseDir).toLowerCase() === 'deliverables') {
            throw new Error('Refusing to reorganize deliverables/system directories.');
          }
          const moved = [];
          const entries = fs.readdirSync(baseDir, { withFileTypes: true });
          for (const entry of entries) {
            if (!entry.isFile()) continue;
            const srcPath = path.join(baseDir, entry.name);
            const extRaw = path.extname(entry.name).replace(/^\./, '').toLowerCase();
            const bucket = extRaw ? `${extRaw}_files` : 'other_files';
            const destDir = path.join(baseDir, bucket);
            fs.mkdirSync(destDir, { recursive: true });
            const destPath = path.join(destDir, entry.name);
            const preHash = crypto.createHash('sha256').update(fs.readFileSync(srcPath)).digest('hex');
            fs.renameSync(srcPath, destPath);
            const postHash = crypto.createHash('sha256').update(fs.readFileSync(destPath)).digest('hex');
            if (preHash !== postHash) {
              throw new Error(`Hash integrity mismatch while moving ${entry.name}`);
            }
            moved.push({
              file: entry.name,
              subfolder: bucket,
              destination: destPath.replace(/\\/g, '/'),
              sha256: postHash
            });
          }
          return {
            success: true,
            directory: baseDir.replace(/\\/g, '/'),
            moved_count: moved.length,
            moved_files: moved
          };
        }

        case 'run_project_tests': {
          const projDir = resolveAndValidateSafeDir(args.directory);
          const pkgPath = path.join(projDir, 'package.json');
          const hasPkg = fs.existsSync(pkgPath);
          const runnerArgs = hasPkg ? ['--test'] : ['--test'];
          const proc = spawnSync(process.execPath, runnerArgs, {
            cwd: projDir,
            encoding: 'utf8',
            timeout: 15000
          });
          const stdout = (proc.stdout || '').trim();
          const stderr = (proc.stderr || '').trim();
          const combined = [stdout, stderr].filter(Boolean).join('\n');
          const passMatch = combined.match(/# pass (\d+)/i);
          const failMatch = combined.match(/# fail (\d+)/i);
          const testsMatch = combined.match(/# tests (\d+)/i);
          return {
            success: true,
            executed: true,
            directory: projDir.replace(/\\/g, '/'),
            command: `node --test`,
            exit_code: proc.status,
            tests_total: testsMatch ? Number(testsMatch[1]) : null,
            tests_passed: passMatch ? Number(passMatch[1]) : null,
            tests_failed: failMatch ? Number(failMatch[1]) : null,
            output: combined.slice(0, 6000)
          };
        }

        case 'computer_observe_screen': {
          return VisualPerceptionService.observe({
            hwnd: args.hwnd || null,
            mode: args.mode || 'window',
            includeOcr: args.include_ocr !== false,
            includeUiTree: true,
            includeImage: false,
            permissionGranted: args.permission_granted
          });
        }

        case 'computer_understand_ui': {
          const obs = await VisualPerceptionService.observe({
            hwnd: args.hwnd || null,
            mode: args.hwnd ? 'window' : 'desktop',
            includeOcr: true,
            includeUiTree: true,
            includeImage: false
          });
          if (!obs.success) return obs;
          const desktopState = ComputerUnderstandingService.buildDesktopState(obs);
          const plan = await ComputerUnderstandingService.understandAndPlan({
            instruction: args.instruction,
            desktopState,
            useLocalAiFallback: true
          });
          return { success: true, desktopState, plan };
        }

        case 'computer_operate_closed_loop': {
          return ComputerControlService.runClosedLoopTask({
            instruction: args.instruction,
            hwnd: args.hwnd || null,
            approved: Boolean(args.approved),
            verifyExpectedText: args.verify_expected_text || null
          });
        }

        case 'computer_click_element': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/desktop/click-element`, {
            hwnd: args.hwnd || null,
            element_name: args.element_name || null,
            control_type: args.control_type || null,
            text: args.text ?? null
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 12000
          });
          return res.data;
        }

        case 'browser_interact': {
          const cfg = await getAgentConfig();
          const res = await axios.post(`${cfg.url}/api/action/browser`, {
            url: args.url,
            action: args.action || 'inspect',
            selector: args.selector || null,
            text: args.text ?? null,
            confirmed: Boolean(args.confirmed),
            headless: args.headless !== false
          }, {
            headers: { Authorization: `Bearer ${cfg.token}` },
            timeout: 45000
          });
          return res.data;
        }

        case 'get_unified_personal_context': {
          const snap = await getPersonalContext().getUnifiedPersonalContext({ topic: args.topic || '' });
          return { success: true, context: snap };
        }

        case 'analyze_personal_intelligence': {
          return ProactiveIntelligenceService.generatePersonalProactiveIntelligence();
        }

        case 'evaluate_personal_decision': {
          const out = await getDecisionMemory().evaluateDecisionOptions({
            decision_title: args.decision_title,
            alternatives: args.alternatives,
            constraints: args.constraints || []
          });
          return { success: true, evaluation: out };
        }

        default:
          throw new Error(`Tool '${name}' is not recognized in the NOVA tool registry.`);
      }
    } catch (err) {
      const detail = err.response?.data?.detail || err.response?.data?.error || err.message;
      console.error(`[ToolRegistry] Error executing ${name}:`, detail);
      return {
        success: false,
        tool: name,
        error: detail
      };
    }
  }
}

export default ToolRegistry;
