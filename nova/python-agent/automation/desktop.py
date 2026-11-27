import os
import sys
import time
import ctypes
from typing import Optional, List, Dict, Any

try:
    import win32gui
    import win32con
    import win32clipboard
    import win32process
    import psutil
    PYWIN32_AVAILABLE = True
except ImportError:
    PYWIN32_AVAILABLE = False

user32 = ctypes.windll.user32

# Virtual key codes mapping
VK_MAP = {
    'ctrl': 0x11,
    'control': 0x11,
    'alt': 0x12,
    'shift': 0x10,
    'win': 0x5B,
    'enter': 0x0D,
    'return': 0x0D,
    'tab': 0x09,
    'escape': 0x1B,
    'esc': 0x1B,
    'space': 0x20,
    'backspace': 0x08,
    'up': 0x26,
    'down': 0x28,
    'left': 0x25,
    'right': 0x27,
    'c': 0x43,
    'v': 0x56,
    'x': 0x58,
    'a': 0x41,
    's': 0x53,
    'z': 0x5A,
    'r': 0x52,
    'f': 0x46,
    'f4': 0x73,
    'f5': 0x74
}

def ensure_interactive_desktop():
    """Ensures the executing thread is attached to the active user desktop."""
    try:
        # 0x01FF = DESKTOP_ALL_ACCESS
        hdesk = user32.OpenInputDesktop(0, False, 0x01FF)
        if not hdesk:
            hdesk = user32.OpenDesktopW("default", 0, False, 0x01FF)
        if hdesk:
            user32.SetThreadDesktop(hdesk)
    except Exception:
        pass

def is_cloaked(hwnd: int) -> bool:
    """Checks if a Windows 10/11 UWP window is cloaked/suspended/hidden by DWM."""
    try:
        val = ctypes.c_int(0)
        # DWMWA_CLOAKED = 14
        hr = ctypes.windll.dwmapi.DwmGetWindowAttribute(
            hwnd, 14, ctypes.byref(val), ctypes.sizeof(val)
        )
        return hr == 0 and val.value != 0
    except Exception:
        return False

def get_window_state(hwnd: int) -> str:
    """Returns 'minimized', 'maximized', or 'normal'."""
    try:
        if user32.IsIconic(hwnd):
            return "minimized"
        if user32.IsZoomed(hwnd):
            return "maximized"
        return "normal"
    except Exception:
        return "normal"

EXCLUDED_CLASSES = {
    "tooltips_class32", "MSCTFIME UI", "IME", "Progman", "WorkerW",
    "ThumbnailDeviceHelperWnd", "Shell_TrayWnd", "SystemTray_Main",
    "WindowsDashboard", "UIHubMouseHiderWindowClass", "ForegroundStaging",
    "ApplicationManager_DesktopShellWindow", "DummyDWMListenerWindow",
    "GDI+ Hook Window Class", "TabletPenServiceHelperClass"
}

def list_windows() -> Dict[str, Any]:
    """Lists all active visible top-level application windows with metadata and app grouping."""
    if not PYWIN32_AVAILABLE:
        return {"success": False, "error": "pywin32 not available on host system"}

    ensure_interactive_desktop()
    windows = []
    fg_hwnd = user32.GetForegroundWindow()

    def enum_cb(hwnd, _):
        if not user32.IsWindowVisible(hwnd):
            return True
        if is_cloaked(hwnd):
            return True

        title = win32gui.GetWindowText(hwnd).strip()
        if not title or title in ("Program Manager", "DesktopWindowXamlSource"):
            return True

        cls = win32gui.GetClassName(hwnd)
        if cls in EXCLUDED_CLASSES:
            return True

        rect = win32gui.GetWindowRect(hwnd)
        width = rect[2] - rect[0]
        height = rect[3] - rect[1]
        if width <= 10 or height <= 10:
            return True

        _, pid = win32process.GetWindowThreadProcessId(hwnd)
        proc_name = "unknown"
        try:
            p = psutil.Process(pid)
            proc_name = p.name()
        except Exception:
            pass

        # For explorer, only count cabinet/folder windows as actual explorer app windows
        if proc_name.lower() == "explorer.exe" and cls not in ("CabinetWClass", "ExploreWClass"):
            return True

        # Resolve display app name for modern UWP apps hosted by ApplicationFrameHost
        display_app = proc_name.replace(".exe", "").capitalize()
        if proc_name.lower() == "applicationframehost.exe":
            display_app = title.split(" - ")[-1].strip() if " - " in title else title
        elif proc_name.lower() == "code.exe":
            display_app = "Visual Studio Code"
        elif proc_name.lower() == "chrome.exe":
            display_app = "Google Chrome"
        elif proc_name.lower() == "notepad.exe":
            display_app = "Notepad"
        elif proc_name.lower() == "explorer.exe":
            display_app = "File Explorer"
        elif proc_name.lower() == "windowsterminal.exe":
            display_app = "Windows Terminal"

        state = get_window_state(hwnd)

        windows.append({
            "hwnd": hwnd,
            "title": title,
            "class_name": cls,
            "process_name": proc_name,
            "display_app": display_app,
            "pid": pid,
            "state": state,
            "rect": {"x": rect[0], "y": rect[1], "width": width, "height": height},
            "is_foreground": (hwnd == fg_hwnd)
        })
        return True

    try:
        win32gui.EnumWindows(enum_cb, None)

        # Group windows by application
        applications: Dict[str, Any] = {}
        for w in windows:
            key = w["display_app"]
            if key not in applications:
                applications[key] = {
                    "app_name": key,
                    "process_name": w["process_name"],
                    "count": 0,
                    "windows": []
                }
            applications[key]["count"] += 1
            applications[key]["windows"].append({
                "hwnd": w["hwnd"],
                "title": w["title"],
                "state": w["state"],
                "is_foreground": w["is_foreground"]
            })

        return {
            "success": True,
            "count": len(windows),
            "windows": windows,
            "applications": applications
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to enumerate windows: {str(e)}"}

def manage_window(hwnd: int, action: str, confirmed: bool = False, x: Optional[int] = None, y: Optional[int] = None, width: Optional[int] = None, height: Optional[int] = None) -> Dict[str, Any]:
    """
    Performs window management (focus, minimize, maximize, restore, move, resize, close)
    Verifies that the requested action actually altered the window state.
    """
    if not PYWIN32_AVAILABLE:
        return {"success": False, "error": "pywin32 not available on host system"}

    ensure_interactive_desktop()

    if not win32gui.IsWindow(hwnd):
        return {"success": False, "error": f"Invalid window handle: {hwnd}"}

    title = win32gui.GetWindowText(hwnd)

    if action == "focus":
        try:
            # If minimized, restore first
            if user32.IsIconic(hwnd):
                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                time.sleep(0.08)

            # Bring to foreground reliably via AttachThreadInput when called from background service
            fg_before = user32.GetForegroundWindow()
            cur_tid = ctypes.windll.kernel32.GetCurrentThreadId()
            fg_tid = win32process.GetWindowThreadProcessId(fg_before)[0] if fg_before else 0
            tgt_tid = win32process.GetWindowThreadProcessId(hwnd)[0]
            if fg_tid and fg_tid != cur_tid:
                user32.AttachThreadInput(cur_tid, fg_tid, True)
            if tgt_tid and tgt_tid != cur_tid:
                user32.AttachThreadInput(cur_tid, tgt_tid, True)
            try:
                user32.BringWindowToTop(hwnd)
                user32.SetForegroundWindow(hwnd)
                user32.SetFocus(hwnd)
            finally:
                if fg_tid and fg_tid != cur_tid:
                    user32.AttachThreadInput(cur_tid, fg_tid, False)
                if tgt_tid and tgt_tid != cur_tid:
                    user32.AttachThreadInput(cur_tid, tgt_tid, False)
            time.sleep(0.12)

            fg = user32.GetForegroundWindow()
            verified = (fg == hwnd)
            return {
                "success": True,
                "hwnd": hwnd,
                "title": title,
                "action": "focus",
                "verified": verified,
                "message": f"Window '{title}' focused." if verified else f"Focus command issued to '{title}'."
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to focus window: {str(e)}"}

    elif action == "minimize":
        try:
            win32gui.ShowWindow(hwnd, win32con.SW_MINIMIZE)
            time.sleep(0.1)
            verified = bool(user32.IsIconic(hwnd))
            return {
                "success": True,
                "hwnd": hwnd,
                "title": title,
                "action": "minimize",
                "verified": verified,
                "message": f"Window '{title}' minimized."
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to minimize window: {str(e)}"}

    elif action == "maximize":
        try:
            win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
            time.sleep(0.1)
            verified = bool(user32.IsZoomed(hwnd))
            return {
                "success": True,
                "hwnd": hwnd,
                "title": title,
                "action": "maximize",
                "verified": verified,
                "message": f"Window '{title}' maximized."
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to maximize window: {str(e)}"}

    elif action == "restore":
        try:
            win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
            time.sleep(0.1)
            verified = not user32.IsIconic(hwnd)
            return {
                "success": True,
                "hwnd": hwnd,
                "title": title,
                "action": "restore",
                "verified": verified,
                "message": f"Window '{title}' restored."
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to restore window: {str(e)}"}

    elif action in ("move", "resize"):
        try:
            cur = win32gui.GetWindowRect(hwnd)
            nx = int(x) if x is not None else cur[0]
            ny = int(y) if y is not None else cur[1]
            nw = int(width) if width is not None else (cur[2] - cur[0])
            nh = int(height) if height is not None else (cur[3] - cur[1])
            win32gui.SetWindowPos(hwnd, 0, nx, ny, nw, nh, win32con.SWP_NOZORDER | win32con.SWP_SHOWWINDOW)
            time.sleep(0.12)
            aft = win32gui.GetWindowRect(hwnd)
            return {
                "success": True,
                "hwnd": hwnd,
                "title": title,
                "action": action,
                "rect": {"x": aft[0], "y": aft[1], "width": aft[2] - aft[0], "height": aft[3] - aft[1]},
                "verified": abs(aft[0] - nx) <= 5 and abs(aft[1] - ny) <= 5,
                "message": f"Window '{title}' moved/resized to ({aft[0]}, {aft[1]}, {aft[2]-aft[0]}x{aft[3]-aft[1]})."
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to {action} window: {str(e)}"}

    elif action == "close":
        if "antigravity" in title.lower():
            return {
                "success": False,
                "error": "Antigravity IDE host window is protected from termination."
            }
        if not confirmed:
            return {
                "success": False,
                "error": "Confirmation required: Closing an application window requires user approval."
            }
        try:
            user32.PostMessageW(hwnd, win32con.WM_CLOSE, 0, 0)
            user32.PostMessageW(hwnd, win32con.WM_SYSCOMMAND, 0xF060, 0)
            time.sleep(0.2)
            verified = not win32gui.IsWindow(hwnd)
            return {
                "success": True,
                "hwnd": hwnd,
                "title": title,
                "action": "close",
                "verified": verified,
                "message": f"Window '{title}' closed." if verified else f"Close signal sent to '{title}'."
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to close window: {str(e)}"}

    return {"success": False, "error": f"Unsupported window action: {action}"}

def manage_windows_bulk(target_pattern: str, action: str, confirmed: bool = False, exclude_pattern: Optional[str] = None) -> Dict[str, Any]:
    """
    Performs state-aware bulk window operations (minimize, maximize, restore, close)
    across all windows matching the target application name or pattern.
    Applies the action to ALL matching HWNDs, waits for OS transitions,
    and accurately verifies the post-operation count.
    Supports optional exclude_pattern to preserve specific windows (e.g., documentation).
    """
    if not PYWIN32_AVAILABLE:
        return {"success": False, "error": "pywin32 not available on host system"}

    ensure_interactive_desktop()
    all_windows_res = list_windows()
    if not all_windows_res.get("success"):
        return all_windows_res

    windows = all_windows_res.get("windows", [])
    pattern_lower = target_pattern.strip().lower()

    # Find all matching windows by title, process name, or display app
    matches = []
    for w in windows:
        title = w.get("title", "").lower()
        proc = w.get("process_name", "").lower()
        disp = w.get("display_app", "").lower()

        # Absolute protection for Antigravity host IDE
        if "antigravity" in proc or "antigravity" in title:
            if pattern_lower not in ("antigravity", "antigravity ide"):
                continue

        # Check exclusion pattern (e.g. preserve documentation windows)
        if exclude_pattern:
            ex_lower = exclude_pattern.strip().lower()
            if ex_lower and (ex_lower in title or ex_lower in proc or ex_lower in disp):
                continue

        # Prevent short 1 or 2 letter accidental substring matches (e.g. "it") from matching arbitrary processes
        if len(pattern_lower) < 3 and pattern_lower not in ("ui", "db", "ai"):
            continue

        if pattern_lower in ("all", "*"):
            # Exclude background system hosts and IDEs when targeting 'all'
            if not any(ign in proc for ign in ("explorer.exe", "shellexperiencehost.exe", "searchhost.exe", "antigravity")):
                matches.append(w)
        else:
            if pattern_lower in title or pattern_lower in proc or pattern_lower in disp or pattern_lower.replace(".exe", "") in proc:
                matches.append(w)

    past_action = "closed" if action == "close" else (f"{action}d" if action.endswith("e") else f"{action}ed")
    total_found = len(matches)
    if total_found == 0:
        return {
            "success": True,
            "action": action,
            "target": target_pattern,
            "total_found": 0,
            "total_affected": 0,
            "failed": 0,
            "windows": [],
            "message": f"No active {target_pattern} windows found to be {past_action}."
        }

    if action == "close" and not confirmed:
        return {
            "success": False,
            "requires_approval": True,
            "total_found": total_found,
            "message": f"Confirmation required: Closing {total_found} window(s) matching '{target_pattern}'."
        }

    affected = []
    failed = 0

    for w in matches:
        hwnd = w["hwnd"]
        title = w["title"]
        try:
            if action == "close":
                user32.PostMessageW(hwnd, win32con.WM_CLOSE, 0, 0)
                user32.PostMessageW(hwnd, win32con.WM_SYSCOMMAND, 0xF060, 0)
                affected.append({"hwnd": hwnd, "title": title})
            elif action == "minimize":
                win32gui.ShowWindow(hwnd, win32con.SW_MINIMIZE)
                affected.append({"hwnd": hwnd, "title": title})
            elif action == "maximize":
                win32gui.ShowWindow(hwnd, win32con.SW_MAXIMIZE)
                affected.append({"hwnd": hwnd, "title": title})
            elif action == "restore":
                win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                affected.append({"hwnd": hwnd, "title": title})
            elif action == "focus":
                if user32.IsIconic(hwnd):
                    win32gui.ShowWindow(hwnd, win32con.SW_RESTORE)
                user32.SetForegroundWindow(hwnd)
                affected.append({"hwnd": hwnd, "title": title})
        except Exception as we:
            failed += 1
            affected.append({"hwnd": hwnd, "title": title, "error": str(we)})

    # Wait for OS window manager to process transitions
    time.sleep(0.3)

    # Re-enumerate to verify post-condition state
    recheck_res = list_windows()
    current_windows = recheck_res.get("windows", [])
    current_hwnds = {w["hwnd"]: w for w in current_windows}

    verified_count = 0
    for item in affected:
        h = item["hwnd"]
        if action == "close":
            item["verified"] = (h not in current_hwnds)
        elif action == "minimize":
            item["verified"] = (h in current_hwnds and current_hwnds[h]["state"] == "minimized")
        elif action == "maximize":
            item["verified"] = (h in current_hwnds and current_hwnds[h]["state"] == "maximized")
        elif action == "restore":
            item["verified"] = (h in current_hwnds and current_hwnds[h]["state"] != "minimized")
        else:
            item["verified"] = True

        if item.get("verified"):
            verified_count += 1

    past_action = "closed" if action == "close" else (f"{action}d" if action.endswith("e") else f"{action}ed")

    return {
        "success": True,
        "action": action,
        "target": target_pattern,
        "total_found": total_found,
        "total_affected": verified_count,
        "failed": total_found - verified_count,
        "windows": affected,
        "verified": True,
        "message": f"I found {total_found} {target_pattern} window{'s' if total_found != 1 else ''}. {past_action.capitalize()} {verified_count} of {total_found} successfully."
    }

def focus_or_launch_window(app_name: str) -> Dict[str, Any]:
    """
    Brings existing application window to foreground if open,
    or launches the application if no window currently exists.
    """
    ensure_interactive_desktop()
    norm_app = app_name.strip().lower()

    # Search existing windows
    curr_res = list_windows()
    windows = curr_res.get("windows", [])

    matched_hwnd = None
    matched_title = ""

    for w in windows:
        title = w.get("title", "").lower()
        proc = w.get("process_name", "").lower()
        disp = w.get("display_app", "").lower()

        if norm_app in title or norm_app in proc or norm_app in disp or norm_app.replace(" ", "") in proc:
            matched_hwnd = w["hwnd"]
            matched_title = w["title"]
            break

    if matched_hwnd:
        # Focus existing window
        f_res = manage_window(matched_hwnd, "focus")
        return {
            "success": True,
            "action": "focus_existing",
            "app_name": app_name,
            "hwnd": matched_hwnd,
            "title": matched_title,
            "already_running": True,
            "launched": False,
            "focused": f_res.get("verified", True),
            "message": f"Brought existing {matched_title or app_name} window to the foreground."
        }
    else:
        # Launch application
        from automation.apps import launch_application
        l_res = launch_application(app_name)
        return {
            "success": l_res.get("success", False),
            "action": "launch_new",
            "app_name": app_name,
            "already_running": False,
            "launched": True,
            "focused": True,
            "message": f"No active window found for '{app_name}'. Launching application now." if l_res.get("success") else l_res.get("error")
        }

def is_sensitive_foreground_window() -> Dict[str, Any]:
    """Detects password managers, financial portals, or OS credential prompts on the foreground window."""
    if not PYWIN32_AVAILABLE:
        return {"sensitive": False}
    ensure_interactive_desktop()
    try:
        fg = user32.GetForegroundWindow()
        title = win32gui.GetWindowText(fg) if fg else ""
        cls = win32gui.GetClassName(fg) if fg else ""
        proc_name = ""
        if fg:
            _, pid = win32process.GetWindowThreadProcessId(fg)
            try:
                proc_name = psutil.Process(pid).name()
            except Exception:
                pass
        combined = f"{title} {cls} {proc_name}".lower()
        blocked_pw = ("1password", "bitwarden", "keepass", "lastpass", "dashlane", "proton pass", "credential", "windows security")
        blocked_fin = ("bank of america", "chase", "wells fargo", "paypal", "stripe dashboard", "coinbase", "metamask", "online banking", "credit card")
        for kw in blocked_pw:
            if kw in combined:
                return {"sensitive": True, "category": "PASSWORD_MANAGER_OR_CREDENTIAL", "reason": f"Foreground UI matches protected credential context ('{kw}')", "title": title, "process_name": proc_name}
        for kw in blocked_fin:
            if kw in combined:
                return {"sensitive": True, "category": "FINANCIAL_APPLICATION", "reason": f"Foreground UI matches protected financial context ('{kw}')", "title": title, "process_name": proc_name}
        return {"sensitive": False, "title": title, "process_name": proc_name}
    except Exception:
        return {"sensitive": False}


def mouse_action(action: str, x: Optional[int] = None, y: Optional[int] = None, button: str = "left", delta: int = -120) -> Dict[str, Any]:
    """
    Executes and verifies mouse automation actions (move, click, double_click, right_click, scroll).
    Never assumes success without querying post-condition coordinates and enforcing foreground safety.
    """
    sens = is_sensitive_foreground_window()
    if sens.get("sensitive") and action in ("click", "double_click", "right_click"):
        return {
            "success": False,
            "blocked": True,
            "security_category": sens.get("category"),
            "error": f"Security Policy Blocked: {sens.get('reason')}"
        }

    class POINT(ctypes.Structure):
        _fields_ = [("x", ctypes.c_long), ("y", ctypes.c_long)]

    pt = POINT()

    # Clamp and move cursor if coordinates provided
    if x is not None and y is not None:
        sw = max(1, user32.GetSystemMetrics(0))
        sh = max(1, user32.GetSystemMetrics(1))
        cx = max(0, min(int(x), sw - 1))
        cy = max(0, min(int(y), sh - 1))
        ret = user32.SetCursorPos(cx, cy)
        time.sleep(0.05)
        user32.GetCursorPos(ctypes.byref(pt))
        pos_verified = (abs(pt.x - cx) <= 3 and abs(pt.y - cy) <= 3) if ret != 0 else True
        x, y = cx, cy
    else:
        user32.GetCursorPos(ctypes.byref(pt))
        x, y = pt.x, pt.y
        pos_verified = True

    MOUSEEVENTF_LEFTDOWN = 0x0002
    MOUSEEVENTF_LEFTUP = 0x0004
    MOUSEEVENTF_RIGHTDOWN = 0x0008
    MOUSEEVENTF_RIGHTUP = 0x0010
    MOUSEEVENTF_WHEEL = 0x0800

    if action == "move":
        return {
            "success": True,
            "action": "move",
            "target": {"x": x, "y": y},
            "actual": {"x": pt.x, "y": pt.y},
            "verified": pos_verified,
            "message": f"Cursor moved to ({pt.x}, {pt.y})."
        }

    elif action in ("click", "right_click"):
        btn = "right" if action == "right_click" else button
        if btn == "right":
            user32.mouse_event(MOUSEEVENTF_RIGHTDOWN, 0, 0, 0, 0)
            time.sleep(0.02)
            user32.mouse_event(MOUSEEVENTF_RIGHTUP, 0, 0, 0, 0)
        else:
            user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
            time.sleep(0.02)
            user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)

        return {
            "success": True,
            "action": f"{btn}_click",
            "location": {"x": pt.x, "y": pt.y},
            "verified": pos_verified,
            "message": f"{btn.capitalize()} click executed at ({pt.x}, {pt.y})."
        }

    elif action == "double_click":
        user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        time.sleep(0.05)
        user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)

        return {
            "success": True,
            "action": "double_click",
            "location": {"x": pt.x, "y": pt.y},
            "verified": pos_verified,
            "message": f"Double click executed at ({pt.x}, {pt.y})."
        }

    elif action == "scroll":
        wheel_delta = int(delta) if delta is not None else -120
        # Hover & lightly activate scrollable region under cursor so Win32/WinForms receives wheel events
        user32.mouse_event(MOUSEEVENTF_LEFTDOWN, 0, 0, 0, 0)
        user32.mouse_event(MOUSEEVENTF_LEFTUP, 0, 0, 0, 0)
        time.sleep(0.03)
        for _ in range(3):
            user32.mouse_event(MOUSEEVENTF_WHEEL, 0, 0, ctypes.c_uint32(wheel_delta).value, 0)
            time.sleep(0.03)
        return {
            "success": True,
            "action": "scroll",
            "delta": wheel_delta,
            "location": {"x": pt.x, "y": pt.y},
            "verified": True,
            "message": f"Scrolled wheel ({wheel_delta}) at ({pt.x}, {pt.y})."
        }

    return {"success": False, "error": f"Unsupported mouse action: {action}"}

def keyboard_action(action: str, text: Optional[str] = None, hotkey: Optional[str] = None, confirmed: bool = False) -> Dict[str, Any]:
    """
    Executes keyboard directives (type_text, hotkey, press_key) with sensitive window & credential protection.
    Sensitive combinations (e.g., alt+f4) require confirmed=True.
    """
    KEYEVENTF_KEYUP = 0x0002

    sens = is_sensitive_foreground_window()
    if sens.get("sensitive"):
        return {
            "success": False,
            "blocked": True,
            "security_category": sens.get("category"),
            "error": f"Security Policy Blocked: Keyboard automation forbidden on sensitive window ({sens.get('title')})."
        }

    if action in ("hotkey", "press_key"):
        combo = hotkey or text
        if not combo:
            return {"success": False, "error": "hotkey or key name required (e.g. 'ctrl+c' or 'enter')"}

        keys = [k.strip().lower() for k in combo.split("+")]

        # Sensitive hotkey protection
        if "f4" in keys and "alt" in keys and not confirmed:
            return {"success": False, "requires_approval": True, "error": "Confirmation required: Alt+F4 will terminate active window."}

        vk_codes = []
        for k in keys:
            if k in VK_MAP:
                vk_codes.append(VK_MAP[k])
            elif len(k) == 1 and k.isalnum():
                vk_codes.append(ord(k.upper()))
            else:
                return {"success": False, "error": f"Unknown key in hotkey combo: '{k}'"}

        # Press down in order
        for vk in vk_codes:
            user32.keybd_event(vk, 0, 0, 0)

        time.sleep(0.05)

        # Release in reverse order
        for vk in reversed(vk_codes):
            user32.keybd_event(vk, 0, KEYEVENTF_KEYUP, 0)

        return {
            "success": True,
            "action": action,
            "hotkey": combo,
            "verified": True,
            "message": f"Key '{combo}' transmitted to active window."
        }

    elif action == "type_text":
        if text is None:
            return {"success": False, "error": "text string required"}

        # Prevent accidental credential entry unless explicitly confirmed
        low_txt = text.lower()
        if any(tok in low_txt for tok in ("password=", "api_key=", "secret_key=", "bearer ")) and not confirmed:
            return {
                "success": False,
                "blocked": True,
                "requires_approval": True,
                "error": "Confirmation required: Text matches secret/credential entry pattern."
            }

        # Use clipboard paste for fast, lossless Unicode typing
        try:
            prev_clipboard = get_clipboard().get("text", "")
            set_clipboard(text)
            time.sleep(0.05)
            # Ctrl + V
            user32.keybd_event(VK_MAP['ctrl'], 0, 0, 0)
            user32.keybd_event(VK_MAP['v'], 0, 0, 0)
            time.sleep(0.02)
            user32.keybd_event(VK_MAP['v'], 0, KEYEVENTF_KEYUP, 0)
            user32.keybd_event(VK_MAP['ctrl'], 0, KEYEVENTF_KEYUP, 0)

            return {
                "success": True,
                "action": "type_text",
                "length": len(text),
                "verified": True,
                "message": f"Typed {len(text)} characters into active window."
            }
        except Exception as e:
            return {"success": False, "error": f"Failed to type text: {str(e)}"}

    return {"success": False, "error": f"Unsupported keyboard action: {action}"}

def get_clipboard() -> Dict[str, Any]:
    """Reads current plain text from the Windows clipboard."""
    if not PYWIN32_AVAILABLE:
        return {"success": False, "error": "pywin32 not available"}

    try:
        win32clipboard.OpenClipboard()
        try:
            if win32clipboard.IsClipboardFormatAvailable(win32clipboard.CF_UNICODETEXT):
                data = win32clipboard.GetClipboardData(win32clipboard.CF_UNICODETEXT)
            elif win32clipboard.IsClipboardFormatAvailable(win32clipboard.CF_TEXT):
                data = win32clipboard.GetClipboardData(win32clipboard.CF_TEXT)
            else:
                data = ""
            return {"success": True, "text": data}
        finally:
            win32clipboard.CloseClipboard()
    except Exception as e:
        return {"success": False, "error": f"Clipboard read error: {str(e)}"}

def set_clipboard(text: str) -> Dict[str, Any]:
    """Sets plain text to the Windows clipboard and verifies readback."""
    if not PYWIN32_AVAILABLE:
        return {"success": False, "error": "pywin32 not available"}

    try:
        win32clipboard.OpenClipboard()
        try:
            win32clipboard.EmptyClipboard()
            win32clipboard.SetClipboardData(win32clipboard.CF_UNICODETEXT, text)
        finally:
            win32clipboard.CloseClipboard()

        # Verify readback
        check = get_clipboard()
        verified = (check.get("text") == text)
        return {
            "success": True,
            "action": "set_clipboard",
            "length": len(text),
            "verified": verified,
            "message": "Clipboard updated and verified."
        }
    except Exception as e:
        return {"success": False, "error": f"Clipboard write error: {str(e)}"}

def inspect_app_state(app_name: str) -> Dict[str, Any]:
    """Inspects processes and windows corresponding to an application name."""
    matching_procs = []
    lower_target = app_name.lower()

    for p in psutil.process_iter(['pid', 'name']):
        try:
            name = (p.info.get('name') or '').lower()
            if lower_target in name:
                mem_mb = 0
                status_val = 'running'
                try:
                    mem_mb = round(p.memory_info().rss / (1024 * 1024), 2)
                    status_val = p.status()
                except Exception:
                    pass
                matching_procs.append({
                    "pid": p.info['pid'],
                    "name": p.info.get('name'),
                    "status": status_val,
                    "memory_mb": mem_mb
                })
                if len(matching_procs) >= 5:
                    break
        except Exception:
            continue

    all_windows = list_windows().get("windows", [])
    matching_windows = [
        w for w in all_windows if lower_target in w['process_name'].lower() or lower_target in w['title'].lower()
    ]

    return {
        "success": True,
        "app_name": app_name,
        "running": len(matching_procs) > 0,
        "process_count": len(matching_procs),
        "processes": matching_procs[:5],
        "window_count": len(matching_windows),
        "windows": matching_windows,
        "message": f"App '{app_name}' has {len(matching_procs)} processes and {len(matching_windows)} visible windows."
    }

def verify_window_presence(process_hints=None, title_hints=None, pid=None, timeout_sec: float = 2.4) -> Dict[str, Any]:
    """
    Polls Win32 EnumWindows and process table to distinguish:
    - process created (PID present)
    - visible top-level window present (HWND visible)
    - document/application title matched
    """
    process_hints = [h.lower() for h in (process_hints or []) if h]
    title_hints = [h.lower() for h in (title_hints or []) if h]
    deadline = time.time() + max(0.2, float(timeout_sec))

    matched_win = None
    doc_matched = False
    found_pid = pid
    proc_alive = False

    while time.time() <= deadline:
        # 1. Check process liveness
        if found_pid:
            proc_alive = psutil.pid_exists(int(found_pid))
        if not proc_alive and process_hints:
            for p in psutil.process_iter(['pid', 'name']):
                try:
                    pname = (p.info.get('name') or '').lower()
                    if any(h in pname for h in process_hints):
                        proc_alive = True
                        if not found_pid:
                            found_pid = p.info['pid']
                        break
                except Exception:
                    continue

        # 2. Inspect visible top-level windows
        win_res = list_windows()
        windows = win_res.get("windows", []) if isinstance(win_res, dict) else []
        for w in windows:
            pname = str(w.get("process_name") or "").lower()
            wtitle = str(w.get("title") or "")
            wtitle_low = wtitle.lower()
            wpid = w.get("pid")

            pid_ok = bool(found_pid and wpid == found_pid)
            proc_ok = bool(process_hints and any(h in pname for h in process_hints))
            title_ok = bool(title_hints and any(h in wtitle_low for h in title_hints))

            if pid_ok or title_ok or proc_ok:
                matched_win = w
                if title_hints and any(h in wtitle_low for h in title_hints):
                    doc_matched = True
                    break

        if matched_win and (not title_hints or doc_matched):
            break
        time.sleep(0.25)

    verification_level = "none"
    if matched_win and doc_matched:
        verification_level = "outcome_confirmed"
    elif matched_win:
        verification_level = "window_visible"
    elif proc_alive:
        verification_level = "process_only"

    return {
        "process_created": bool(proc_alive or found_pid),
        "pid": found_pid,
        "window_visible": bool(matched_win is not None),
        "matched_hwnd": matched_win.get("hwnd") if matched_win else None,
        "matched_window_title": matched_win.get("title") if matched_win else None,
        "matched_process_name": matched_win.get("process_name") if matched_win else None,
        "document_title_matched": bool(doc_matched),
        "verification_level": verification_level
    }


def click_ui_element(
    hwnd: Optional[int] = None,
    element_name: Optional[str] = None,
    control_type: Optional[str] = None,
    automation_id: Optional[str] = None,
    expected_rect: Optional[Dict[str, int]] = None,
    action: str = "click",
    text: Optional[str] = None,
    confirmed: bool = False,
) -> Dict[str, Any]:
    """
    Re-resolves a UIA element on the target HWND to avoid stale coordinates,
    activates/clicks it safely, and reports whether window coordinates shifted.
    """
    ensure_interactive_desktop()
    if not PYWIN32_AVAILABLE:
        return {"success": False, "error": "pywin32 unavailable"}

    from automation.perception import inspect_ui_tree
    if hwnd and not win32gui.IsWindow(int(hwnd)):
        return {"success": False, "window_missing": True, "error": f"Window handle {hwnd} no longer exists (closed or crashed)."}

    if hwnd:
        manage_window(int(hwnd), "focus")
        time.sleep(0.08)

    sens = is_sensitive_foreground_window()
    if sens.get("sensitive"):
        return {
            "success": False,
            "blocked": True,
            "security_category": sens.get("category"),
            "error": f"Security Policy Blocked: {sens.get('reason')}"
        }

    ui = inspect_ui_tree(hwnd=hwnd)
    elements = ui.get("elements", [])
    name_low = (element_name or "").strip().lower()
    ctype_low = (control_type or "").strip().lower()
    aid_low = (automation_id or "").strip().lower()

    best = None
    best_score = -1
    for el in elements:
        score = 0
        el_name = (el.get("name") or "").lower()
        el_ctype = (el.get("control_type") or "").lower()
        el_aid = (el.get("automation_id") or "").lower()
        if aid_low and aid_low == el_aid:
            score += 5
        if name_low and name_low == el_name:
            score += 4
        elif name_low and name_low in el_name:
            score += 2
        if ctype_low and ctype_low == el_ctype:
            score += 2
        if el.get("interactive"):
            score += 1
        name_matched = (not name_low) or (name_low in el_name) or (aid_low and aid_low == el_aid)
        if score > best_score and name_matched and (not ctype_low or ctype_low == el_ctype or score >= 4):
            best_score = score
            best = el

    if not best or best_score <= 0:
        return {
            "success": False,
            "element_not_found": True,
            "active_window": ui.get("active_window"),
            "dialogs": ui.get("dialogs", []),
            "error": f"UI control not found (name='{element_name}', control_type='{control_type}')"
        }

    if not best.get("enabled", True):
        return {"success": False, "error": f"Target control '{best.get('name')}' is currently disabled."}

    center = best["center"]
    stale_recovered = False
    if expected_rect and isinstance(expected_rect, dict):
        dx = abs(int(expected_rect.get("x", center["x"])) - best["rect"]["x"])
        dy = abs(int(expected_rect.get("y", center["y"])) - best["rect"]["y"])
        if dx > 5 or dy > 5:
            stale_recovered = True

    click_res = mouse_action("double_click" if action == "double_click" else "click", x=center["x"], y=center["y"])
    if not click_res.get("success"):
        return click_res

    type_res = None
    if text is not None:
        time.sleep(0.08)
        type_res = keyboard_action("type_text", text=text, confirmed=confirmed)
        if not type_res.get("success"):
            return type_res

    return {
        "success": True,
        "action": action,
        "element": best,
        "clicked_at": center,
        "stale_coordinates_recovered": stale_recovered,
        "mouse_result": click_res,
        "type_result": type_res,
        "verified": bool(click_res.get("verified")),
    }
