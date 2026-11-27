import BaseAgent from './BaseAgent.js';

export class ResearchAgent extends BaseAgent {
  constructor() {
    super({
      key: 'research',
      name: 'Research Agent',
      role: 'Web Intelligence & Synthesis Specialist',
      description: 'Conducts live web investigations, extracts key points, verifies sources, and synthesizes structured research dossiers.',
      systemInstruction: 'You are JARVIS Research Agent. Investigate web intelligence objectively, synthesize findings with bullet points, and cite verified source URLs.',
      responsibilities: [
        'Execute live external search queries and deep research retrieval',
        'Verify source URLs and extract grounded factual evidence',
        'Search internal indexed knowledge documents without mutating workspace files'
      ],
      allowedTools: ['search_web', 'conduct_deep_research', 'read_file', 'save_memory', 'query_memories', 'search_knowledge_documents', 'get_unified_personal_context'],
      inputContract: { required_fields: [], max_payload_bytes: 32768 },
      outputContract: { require_object: true, forbid_unhandled_error: true, max_output_bytes: 262144, forbidden_markers: ['{{SYNTHESIZE_FROM_DEPS}}'] },
      resourceLimits: { maxIterations: 4, timeoutMs: 35000, maxConcurrentTasks: 3, maxOutputBytes: 262144 },
      independentVerification: 'External source count & non-empty verifiable HTTPS citation audit'
    });
  }
}

export class CodingAgent extends BaseAgent {
  constructor() {
    super({
      key: 'coding',
      name: 'Coding Agent',
      role: 'Software Engineering & Code Intelligence',
      description: 'Inspects code repositories, analyzes source files, runs project test suites, fixes defects, and validates architecture.',
      systemInstruction: 'You are JARVIS Coding Agent. Provide clean, secure, and idiomatic technical solutions. Search project files and run verification tests.',
      responsibilities: [
        'Inspect repository layout, read source modules, and compute file hashes',
        'Apply minimal code fixes or generate validated code deliverables',
        'Run project unit/integration test suites and report exact pass/fail metrics'
      ],
      allowedTools: ['search_files', 'smart_search_files', 'read_file', 'hash_and_list_files', 'write_file', 'run_project_tests', 'inspect_app_state', 'list_open_windows', 'search_knowledge_documents', 'save_memory'],
      inputContract: { required_fields: [], max_payload_bytes: 65536 },
      outputContract: { require_object: true, forbid_unhandled_error: true, max_output_bytes: 524288, forbidden_markers: ['{{SYNTHESIZE_FROM_DEPS}}'] },
      resourceLimits: { maxIterations: 4, timeoutMs: 45000, maxConcurrentTasks: 2, maxOutputBytes: 524288 },
      independentVerification: 'Filesystem stat + SHA-256 content verification and exit_code === 0 test execution check'
    });
  }
}

export class ProductivityAgent extends BaseAgent {
  constructor() {
    super({
      key: 'productivity',
      name: 'Productivity Agent',
      role: 'Schedule, Task & Focus Coordinator',
      description: 'Manages user task registers, schedules audio-visual reminders, coordinates focus sessions, and drafts daily agendas.',
      systemInstruction: 'You are JARVIS Productivity Agent. Help Commander organize priorities cleanly, establish deadlines, and optimize daily focus.',
      responsibilities: [
        'Manage tasks, project milestones, reminders, and focus timers',
        'Evaluate personal priority alignment and decision options',
        'Avoid filesystem or shell mutation outside task/reminder stores'
      ],
      allowedTools: ['create_task', 'list_tasks', 'update_task', 'create_reminder', 'start_focus_timer', 'save_memory', 'query_memories', 'get_unified_personal_context', 'analyze_personal_intelligence', 'evaluate_personal_decision'],
      inputContract: { required_fields: [], max_payload_bytes: 32768 },
      outputContract: { require_object: true, forbid_unhandled_error: true, max_output_bytes: 131072 },
      resourceLimits: { maxIterations: 3, timeoutMs: 20000, maxConcurrentTasks: 3, maxOutputBytes: 131072 },
      independentVerification: 'SQLite persistence check on tasks/reminders/memories tables'
    });
  }
}

export class FileManagerAgent extends BaseAgent {
  constructor() {
    super({
      key: 'files',
      name: 'File Management Agent',
      role: 'Local Workspace & Filesystem Operator',
      description: 'Performs safe directory scanning, duplicate hashing, folder organization, and verified inventories within permitted boundaries.',
      systemInstruction: 'You are JARVIS File Management Agent. Respect sandbox path boundaries strictly. Never alter files outside authorized directories.',
      responsibilities: [
        'Produce verified directory inventories and SHA-256 duplicate file reports',
        'Organize disposable workspaces by file type without losing files',
        'Create folders, summarize documents, and write inventory artifacts'
      ],
      allowedTools: ['search_files', 'smart_search_files', 'hash_and_list_files', 'organize_files_by_type', 'read_file', 'write_file', 'create_folder', 'open_file', 'save_memory', 'ingest_document', 'search_knowledge_documents'],
      inputContract: { required_fields: [], max_payload_bytes: 65536 },
      outputContract: { require_object: true, forbid_unhandled_error: true, max_output_bytes: 524288, forbidden_markers: ['{{SYNTHESIZE_FROM_DEPS}}'] },
      resourceLimits: { maxIterations: 4, timeoutMs: 30000, maxConcurrentTasks: 2, maxOutputBytes: 524288 },
      independentVerification: 'Filesystem existence, byte-count, and SHA-256 conservation verification'
    });
  }
}

export class ContentCreationAgent extends BaseAgent {
  constructor() {
    super({
      key: 'content',
      name: 'Content Creation Agent',
      role: 'Media, Screenplay & Narrative Specialist',
      description: 'Synthesizes structured multi-step deliverables, technical reports, screenplays, and executive summaries.',
      systemInstruction: 'You are JARVIS Content Creation Agent. Synthesize accurate deliverables grounded in upstream evidence without fabricating citations or facts.',
      responsibilities: [
        'Synthesize multi-source dossiers into Markdown reports and executive deliverables',
        'Draft structured scripts and documentation from verified evidence',
        'Save authored deliverables safely via write_file without running shell/system commands'
      ],
      allowedTools: ['read_file', 'write_file', 'search_web', 'save_memory', 'create_task', 'search_knowledge_documents'],
      inputContract: { required_fields: [], max_payload_bytes: 65536 },
      outputContract: { require_object: true, forbid_unhandled_error: true, max_output_bytes: 524288, forbidden_markers: ['{{SYNTHESIZE_FROM_DEPS}}'] },
      resourceLimits: { maxIterations: 3, timeoutMs: 35000, maxConcurrentTasks: 2, maxOutputBytes: 524288 },
      independentVerification: 'Non-empty output artifact validation, placeholder rejection, and citation URL check'
    });
  }
}

export class SystemAssistantAgent extends BaseAgent {
  constructor() {
    super({
      key: 'system',
      name: 'System Assistant Agent',
      role: 'Host Diagnostics, GUI & Cross-App Operator',
      description: 'Monitors hardware telemetry, launches approved desktop applications, coordinates multi-window workflows, and executes closed-loop GUI actions.',
      systemInstruction: 'You are JARVIS System Assistant Agent. Report hardware diagnostics accurately and coordinate cross-application interactions under closed-loop verification.',
      responsibilities: [
        'Collect host CPU/RAM/disk telemetry and active window states',
        'Launch approved desktop apps and coordinate multi-window or browser automation',
        'Verify visual/HWND postconditions after every GUI interaction'
      ],
      allowedTools: [
        'get_system_telemetry', 'open_application', 'open_file', 'open_website', 'focus_or_launch_app',
        'launch_app_instances', 'search_files', 'read_file', 'list_open_windows', 'manage_window',
        'manage_windows_bulk', 'desktop_mouse_action', 'desktop_keyboard_action', 'get_clipboard',
        'set_clipboard', 'inspect_app_state', 'capture_screen', 'analyze_screen',
        'computer_observe_screen', 'computer_understand_ui', 'computer_operate_closed_loop',
        'computer_click_element', 'browser_interact', 'get_current_directory'
      ],
      inputContract: { required_fields: [], max_payload_bytes: 32768 },
      outputContract: { require_object: true, forbid_unhandled_error: true, max_output_bytes: 262144 },
      resourceLimits: { maxIterations: 4, timeoutMs: 30000, maxConcurrentTasks: 2, maxOutputBytes: 262144 },
      independentVerification: 'Win32 HWND / process enumeration & visual screen post-state inspection'
    });
  }
}

export const SPECIALIZED_AGENTS = {
  research: ResearchAgent,
  coding: CodingAgent,
  productivity: ProductivityAgent,
  files: FileManagerAgent,
  content: ContentCreationAgent,
  system: SystemAssistantAgent
};
