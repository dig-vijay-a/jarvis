import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import io
import base64
from fastapi import FastAPI, Header, HTTPException, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import Optional, List
from PIL import Image, ImageDraw

from security.validator import verify_token, validate_origin, ALLOWED_APPLICATIONS
from system.info import get_system_telemetry, get_top_processes
from automation.apps import launch_application, launch_app_instances
from automation.browser import open_url, browser_interact
from automation.files import search_files, read_file, create_folder, rename_file, write_file, open_file_with_app, smart_search_files, get_cwd
from automation.desktop import (
    list_windows, manage_window, manage_windows_bulk, mouse_action, 
    keyboard_action, get_clipboard, set_clipboard, inspect_app_state,
    focus_or_launch_window, click_ui_element
)
from automation.perception import (
    capture_real_screen, inspect_ui_tree, diff_visual_frames, observe_environment
)
from automation.wakeword import get_wake_word_status, configure_wake_word, process_wake_word

app = FastAPI(
    title="JARVIS Local Automation Agent",
    version="2.0.0",
    description="Secure local automation agent for JARVIS Personal AI Operating System"
)

# CORS restricted to localhost origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000", "http://localhost:5000", "http://127.0.0.1:5000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

def require_auth(request: Request, authorization: Optional[str] = Header(None)):
    origin = request.headers.get("origin") or request.headers.get("referer") or ""
    if not validate_origin(origin):
        raise HTTPException(status_code=403, detail="Forbidden: Untrusted request origin")

    if not authorization or not verify_token(authorization):
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid JARVIS security token")
    return True

class OpenAppRequest(BaseModel):
    app_name: str

class OpenUrlRequest(BaseModel):
    url: str

class SearchFilesRequest(BaseModel):
    directory: Optional[str] = "."
    pattern: Optional[str] = "*"
    limit: Optional[int] = 50

class ReadFileRequest(BaseModel):
    file_path: str
    max_chars: Optional[int] = 15000

class CreateFolderRequest(BaseModel):
    folder_path: str

class RenameFileRequest(BaseModel):
    old_path: str
    new_name: str
    confirmed: bool = False

class ExecuteScriptRequest(BaseModel):
    script_name: str
    confirmed: bool = False

class ManageWindowRequest(BaseModel):
    hwnd: int
    action: str
    confirmed: bool = False
    x: Optional[int] = None
    y: Optional[int] = None
    width: Optional[int] = None
    height: Optional[int] = None

class BulkWindowActionRequest(BaseModel):
    target_pattern: str
    action: str
    confirmed: bool = False
    exclude_pattern: Optional[str] = None

class WriteFileRequest(BaseModel):
    file_path: str
    content: str

class OpenFileRequest(BaseModel):
    file_path: str

class MouseActionRequest(BaseModel):
    action: str
    x: Optional[int] = None
    y: Optional[int] = None
    button: Optional[str] = "left"
    delta: Optional[int] = -120


class PerceptionObserveRequest(BaseModel):
    hwnd: Optional[int] = None
    mode: Optional[str] = "window"
    include_ocr: bool = True
    include_ui_tree: bool = True
    include_image: bool = True
    prev_image_b64: Optional[str] = None
    permission_granted: bool = True


class PerceptionUiTreeRequest(BaseModel):
    hwnd: Optional[int] = None
    max_elements: int = 90


class PerceptionDiffRequest(BaseModel):
    prev_image_b64: str
    curr_image_b64: str


class ClickElementRequest(BaseModel):
    hwnd: Optional[int] = None
    element_name: Optional[str] = None
    control_type: Optional[str] = None
    automation_id: Optional[str] = None
    expected_rect: Optional[dict] = None
    action: str = "click"
    text: Optional[str] = None
    confirmed: bool = False


class BrowserInteractRequest(BaseModel):
    url: str
    action: str = "inspect"
    selector: Optional[str] = None
    text: Optional[str] = None
    confirmed: bool = False
    headless: bool = False

class KeyboardActionRequest(BaseModel):
    action: str
    text: Optional[str] = None
    hotkey: Optional[str] = None
    confirmed: bool = False

class ClipboardSetRequest(BaseModel):
    text: str

class InspectAppRequest(BaseModel):
    app_name: str

class FocusOrLaunchRequest(BaseModel):
    app_name: str

class SmartSearchFilesRequest(BaseModel):
    query: Optional[str] = ""
    pattern: Optional[str] = "*"
    file_type: Optional[str] = ""
    limit: Optional[int] = 25

class LaunchInstancesRequest(BaseModel):
    app_name: str
    count: Optional[int] = 1

class WakeWordConfigRequest(BaseModel):
    phrase: Optional[str] = None
    active: Optional[bool] = None
    is_muted: Optional[bool] = None
    sensitivity: Optional[float] = None

class WakeWordProcessRequest(BaseModel):
    text: str

@app.get("/")
@app.get("/health")
def health():
    return {
        "status": "online",
        "service": "JARVIS Local Automation Agent",
        "version": "2.0.0",
        "platform": sys.platform
    }

@app.get("/api/system/info")
def system_info(authorized: bool = Depends(require_auth)):
    return get_system_telemetry()

@app.get("/api/system/processes")
def system_processes(limit: int = 10, authorized: bool = Depends(require_auth)):
    return get_top_processes(limit=limit)

@app.get("/api/system/allowed-apps")
def allowed_apps(authorized: bool = Depends(require_auth)):
    return {
        "success": True,
        "apps": list(ALLOWED_APPLICATIONS.keys())
    }

@app.post("/api/action/open-app")
def action_open_app(req: OpenAppRequest, authorized: bool = Depends(require_auth)):
    res = launch_application(req.app_name)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/action/open-url")
def action_open_url(req: OpenUrlRequest, authorized: bool = Depends(require_auth)):
    res = open_url(req.url)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/action/search-files")
def action_search_files(req: SearchFilesRequest, authorized: bool = Depends(require_auth)):
    res = search_files(req.directory, req.pattern, req.limit)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/action/read-file")
def action_read_file(req: ReadFileRequest, authorized: bool = Depends(require_auth)):
    res = read_file(req.file_path, req.max_chars)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/action/create-folder")
def action_create_folder(req: CreateFolderRequest, authorized: bool = Depends(require_auth)):
    res = create_folder(req.folder_path)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/action/write-file")
def action_write_file(req: WriteFileRequest, authorized: bool = Depends(require_auth)):
    res = write_file(req.file_path, req.content)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/action/open-file")
def action_open_file(req: OpenFileRequest, authorized: bool = Depends(require_auth)):
    res = open_file_with_app(req.file_path)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/action/rename-file")
def action_rename_file(req: RenameFileRequest, authorized: bool = Depends(require_auth)):
    if not req.confirmed:
        raise HTTPException(status_code=400, detail="Confirmation required: Rename operation is marked sensitive.")
    res = rename_file(req.old_path, req.new_name)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/action/capture-screen")
def action_capture_screen(hwnd: Optional[int] = None, mode: str = "desktop", permission_granted: bool = True, authorized: bool = Depends(require_auth)):
    if not permission_granted:
        raise HTTPException(status_code=403, detail="Screen observation permission denied by operator.")
    res = capture_real_screen(mode=mode, hwnd=hwnd, include_base64=True)
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error", "Real screen capture failed"))
    return res

@app.post("/api/action/emergency-stop")
def action_emergency_stop(authorized: bool = Depends(require_auth)):
    return {
        "success": True,
        "message": "EMERGENCY STOP ACKNOWLEDGED. Active tasks paused.",
        "state": "HALTED"
    }

# ==========================================
# ADVANCED DESKTOP AUTOMATION API (Module 2)
# ==========================================

@app.get("/api/desktop/windows")
def api_list_windows(authorized: bool = Depends(require_auth)):
    return list_windows()

@app.post("/api/desktop/window-action")
def api_manage_window(req: ManageWindowRequest, authorized: bool = Depends(require_auth)):
    res = manage_window(req.hwnd, req.action, req.confirmed, req.x, req.y, req.width, req.height)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/desktop/bulk-window-action")
def api_manage_windows_bulk(req: BulkWindowActionRequest, authorized: bool = Depends(require_auth)):
    res = manage_windows_bulk(req.target_pattern, req.action, req.confirmed, req.exclude_pattern)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/desktop/mouse-action")
def api_mouse_action(req: MouseActionRequest, authorized: bool = Depends(require_auth)):
    res = mouse_action(req.action, req.x, req.y, req.button, req.delta)
    if not res.get("success"):
        raise HTTPException(status_code=403 if res.get("blocked") else 400, detail=res.get("error"))
    return res

@app.post("/api/desktop/click-element")
def api_click_element(req: ClickElementRequest, authorized: bool = Depends(require_auth)):
    res = click_ui_element(
        hwnd=req.hwnd,
        element_name=req.element_name,
        control_type=req.control_type,
        automation_id=req.automation_id,
        expected_rect=req.expected_rect,
        action=req.action,
        text=req.text,
        confirmed=req.confirmed,
    )
    if not res.get("success"):
        code = 403 if res.get("blocked") else 400
        raise HTTPException(status_code=code, detail=res.get("error"))
    return res

@app.post("/api/perception/observe")
def api_perception_observe(req: PerceptionObserveRequest, authorized: bool = Depends(require_auth)):
    if not req.permission_granted:
        raise HTTPException(status_code=403, detail="Screen observation permission denied.")
    res = observe_environment(
        hwnd=req.hwnd,
        mode=req.mode or "window",
        include_ocr=req.include_ocr,
        include_ui_tree=req.include_ui_tree,
        include_image=req.include_image,
        prev_image_b64=req.prev_image_b64,
    )
    if not res.get("success"):
        raise HTTPException(status_code=500, detail=res.get("error", "Perception observation failed"))
    return res

@app.post("/api/perception/ui-tree")
def api_perception_ui_tree(req: PerceptionUiTreeRequest, authorized: bool = Depends(require_auth)):
    return inspect_ui_tree(hwnd=req.hwnd, max_elements=req.max_elements)

@app.post("/api/perception/diff")
def api_perception_diff(req: PerceptionDiffRequest, authorized: bool = Depends(require_auth)):
    return diff_visual_frames(req.prev_image_b64, req.curr_image_b64)

@app.post("/api/action/browser")
def api_action_browser(req: BrowserInteractRequest, authorized: bool = Depends(require_auth)):
    res = browser_interact(
        url=req.url,
        action=req.action,
        selector=req.selector,
        text=req.text,
        confirmed=req.confirmed,
        headless=req.headless,
    )
    if not res.get("success"):
        code = 403 if res.get("blocked") else 400
        raise HTTPException(status_code=code, detail=res.get("error"))
    return res

@app.post("/api/desktop/keyboard-action")
def api_keyboard_action(req: KeyboardActionRequest, authorized: bool = Depends(require_auth)):
    res = keyboard_action(req.action, req.text, req.hotkey, req.confirmed)
    if not res.get("success"):
        code = 403 if res.get("blocked") else 400
        raise HTTPException(status_code=code, detail=res.get("error"))
    return res

@app.get("/api/desktop/clipboard")
def api_get_clipboard(authorized: bool = Depends(require_auth)):
    res = get_clipboard()
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/desktop/clipboard")
def api_set_clipboard(req: ClipboardSetRequest, authorized: bool = Depends(require_auth)):
    res = set_clipboard(req.text)
    if not res.get("success"):
        raise HTTPException(status_code=400, detail=res.get("error"))
    return res

@app.post("/api/desktop/inspect-app")
def api_inspect_app(req: InspectAppRequest, authorized: bool = Depends(require_auth)):
    return inspect_app_state(req.app_name)

@app.post("/api/desktop/focus-or-launch")
def api_focus_or_launch(req: FocusOrLaunchRequest, authorized: bool = Depends(require_auth)):
    return focus_or_launch_window(req.app_name)

@app.post("/api/action/smart-search-files")
def api_smart_search_files(req: SmartSearchFilesRequest, authorized: bool = Depends(require_auth)):
    return smart_search_files(req.query, req.pattern, req.file_type, req.limit)

@app.get("/api/system/cwd")
def api_get_cwd(authorized: bool = Depends(require_auth)):
    return get_cwd()

@app.post("/api/action/launch-instances")
def api_launch_instances(req: LaunchInstancesRequest, authorized: bool = Depends(require_auth)):
    return launch_app_instances(req.app_name, req.count)

# ==========================================
# LOCAL WAKE WORD ENGINE API (Module 3)
# ==========================================

@app.get("/api/wakeword/status")
def api_wakeword_status(authorized: bool = Depends(require_auth)):
    return get_wake_word_status()

@app.post("/api/wakeword/configure")
def api_wakeword_configure(req: WakeWordConfigRequest, authorized: bool = Depends(require_auth)):
    return configure_wake_word(req.phrase, req.active, req.is_muted, req.sensitivity)

@app.post("/api/wakeword/process")
def api_wakeword_process(req: WakeWordProcessRequest, authorized: bool = Depends(require_auth)):
    return process_wake_word(req.text)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
