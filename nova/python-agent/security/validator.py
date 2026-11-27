import os
import re
import hmac
from pathlib import Path

# Master Auth Token - default or overridden via env
AGENT_TOKEN = os.environ.get("JARVIS_AGENT_TOKEN", os.environ.get("NOVA_AGENT_TOKEN", "nova-local-agent-secure-token-2026"))

# Permitted applications on Windows
ALLOWED_APPLICATIONS = {
    "code": "code",
    "vscode": "code",
    "visual studio code": "code",
    "vs code": "code",
    "notepad": "notepad.exe",
    "calc": "calc.exe",
    "calculator": "calc.exe",
    "chrome": "chrome",
    "google chrome": "chrome",
    "edge": "msedge",
    "browser": "msedge",
    "explorer": "explorer.exe",
    "file explorer": "explorer.exe",
    "terminal": "wt.exe",
    "windows terminal": "wt.exe",
    "cmd": "cmd.exe",
    "powershell": "powershell.exe",
    "taskmgr": "taskmgr.exe",
    "task manager": "taskmgr.exe",
    "taskmanager": "taskmgr.exe",
    "devicemanager": "devmgmt.msc",
    "device manager": "devmgmt.msc",
    "devmgmt": "devmgmt.msc",
    "settings": "ms-settings:",
    "control panel": "control.exe",
    "control": "control.exe",
    "paint": "mspaint.exe",
    "spotify": "spotify.exe",
    "wordpad": "write.exe",
    "antigravity": "code",
    "antigravity ide": "code"
}

# Permitted root directory scopes for file operations
USER_HOME = Path.home()
ALLOWED_DIRECTORIES = [
    Path(os.getcwd()).resolve(),
    Path(os.getcwd()).parent.resolve(),
    (USER_HOME / "Desktop").resolve(),
    (USER_HOME / "Documents").resolve(),
    (USER_HOME / "Downloads").resolve(),
]

# Sensitive forbidden system patterns
FORBIDDEN_PATH_SUBSTRINGS = [
    "windows", "system32", "$recycle.bin", ".ssh", ".aws", "credentials", "sam", "system volume information"
]

def verify_token(auth_header: str) -> bool:
    if not auth_header:
        return False
    parts = auth_header.split()
    token_to_check = parts[1] if (len(parts) == 2 and parts[0].lower() == "bearer") else auth_header
    # Constant-time comparison to prevent timing attacks
    return hmac.compare_digest(token_to_check.strip(), AGENT_TOKEN.strip())

def validate_origin(origin: str, host: str = "") -> bool:
    # Allow localhost, 127.0.0.1, or local ports 3000, 5000, 8000
    if not origin:
        return True # Internal programmatic calls without origin
    allowed_patterns = ["localhost", "127.0.0.1"]
    for pat in allowed_patterns:
        if pat in origin:
            return True
    return False

def validate_app_name(app_name: str) -> str:
    if not app_name:
        raise ValueError("Application name is required.")
    # Strip trailing punctuation and whitespace (e.g. "Notepad." -> "notepad")
    cleaned = re.sub(r'[^a-zA-Z0-9_\-\s]', '', app_name).strip().lower()
    if cleaned in ALLOWED_APPLICATIONS:
        return ALLOWED_APPLICATIONS[cleaned]
    # Check for direct match in values
    for alias, binary in ALLOWED_APPLICATIONS.items():
        if cleaned == binary.lower() or cleaned == binary.lower().replace(".exe", ""):
            return binary
    # Check friendly substring matches
    if "notepad" in cleaned:
        return ALLOWED_APPLICATIONS.get("notepad", "notepad.exe")
    if "chrome" in cleaned:
        return ALLOWED_APPLICATIONS.get("chrome", "chrome")
    if "edge" in cleaned or "browser" in cleaned:
        return ALLOWED_APPLICATIONS.get("edge", "msedge")
    if "code" in cleaned or "vscode" in cleaned:
        return ALLOWED_APPLICATIONS.get("code", "code")
    if "calc" in cleaned:
        return ALLOWED_APPLICATIONS.get("calc", "calc.exe")
    if "terminal" in cleaned or "cmd" in cleaned or "powershell" in cleaned:
        return ALLOWED_APPLICATIONS.get("terminal", "wt.exe")
    if "device" in cleaned and "manager" in cleaned or "devmgmt" in cleaned or "devicemanager" in cleaned:
        return "devmgmt.msc"
    if "task" in cleaned and "manager" in cleaned or "taskmgr" in cleaned:
        return "taskmgr.exe"
    if "control" in cleaned and "panel" in cleaned:
        return "control.exe"
    if "settings" in cleaned:
        return "ms-settings:"
    if "paint" in cleaned:
        return "mspaint.exe"
    raise ValueError(f"Application '{app_name}' is not in the permitted allowlist.")

def validate_url(url: str) -> str:
    url = url.strip()
    if not (url.startswith("http://") or url.startswith("https://")):
        raise ValueError("Invalid URL protocol. Only http:// and https:// URLs are permitted.")
    return url

def validate_safe_path(target_path: str, must_exist: bool = False) -> Path:
    p = Path(target_path).expanduser().resolve()
    path_str = str(p).lower()

    # Block sensitive system folders
    for forbidden in FORBIDDEN_PATH_SUBSTRINGS:
        if f"\\{forbidden}\\" in path_str or f"/{forbidden}/" in path_str or path_str.endswith(f"\\{forbidden}") or path_str.endswith(f"/{forbidden}"):
            raise PermissionError(f"Security Alert: Access to sensitive path '{target_path}' is strictly blocked.")

    # Check if inside one of the allowed directories
    is_allowed = False
    for allowed_dir in ALLOWED_DIRECTORIES:
        try:
            p.relative_to(allowed_dir)
            is_allowed = True
            break
        except ValueError:
            continue

    if not is_allowed:
        try:
            p.relative_to(USER_HOME)
            is_allowed = True
        except ValueError:
            pass

    if not is_allowed:
        raise PermissionError(f"Access denied: Path '{target_path}' is outside permitted directory boundaries.")

    if must_exist and not p.exists():
        raise FileNotFoundError(f"Path '{target_path}' does not exist.")

    return p
