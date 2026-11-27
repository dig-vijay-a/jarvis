import subprocess
import os
import time
from security.validator import validate_app_name
from automation.desktop import verify_window_presence

def launch_application(app_name: str) -> dict:
    try:
        binary = validate_app_name(app_name)
    except ValueError as ve:
        return {
            "success": False,
            "application": app_name,
            "process_created": False,
            "window_visible": False,
            "verification_level": "none",
            "error": str(ve)
        }
    proc_pid = None
    exe_used = binary
    proc_hints = [app_name.lower(), os.path.basename(binary).replace(".exe", "").lower()]
    if "notepad" in app_name.lower():
        proc_hints.append("notepad")

    try:
        if "notepad" in app_name.lower():
            try:
                exe_used = "shell:AppsFolder\\Microsoft.WindowsNotepad_8wekyb3d8bbwe!App"
                os.startfile(exe_used)
            except Exception:
                proc = subprocess.Popen([binary], shell=False)
                proc_pid = proc.pid
                exe_used = binary
        elif binary.endswith(".msc") or binary.startswith("ms-") or binary.startswith("shell:"):
            os.startfile(binary)
        else:
            try:
                proc = subprocess.Popen([binary], shell=False)
                proc_pid = proc.pid
            except Exception:
                os.startfile(binary)

        win_check = verify_window_presence(process_hints=proc_hints, title_hints=[app_name.lower()], pid=proc_pid, timeout_sec=2.5)
        return {
            "success": bool(win_check["window_visible"] or win_check["process_created"]),
            "application": app_name,
            "executable": exe_used,
            "pid": win_check["pid"] or proc_pid,
            "process_created": win_check["process_created"],
            "window_visible": win_check["window_visible"],
            "matched_hwnd": win_check["matched_hwnd"],
            "matched_window_title": win_check["matched_window_title"],
            "verification_level": win_check["verification_level"],
            "message": (
                f"Confirmed visible window '{win_check['matched_window_title']}' for {app_name}."
                if win_check["window_visible"]
                else f"Process created for {app_name} ({exe_used}), but visible desktop window was not confirmed."
            )
        }
    except Exception as e2:
        return {
            "success": False,
            "application": app_name,
            "process_created": False,
            "window_visible": False,
            "verification_level": "none",
            "error": f"Failed to launch application: {str(e2)}"
        }

def launch_app_instances(app_name: str, count: int = 1) -> dict:
    """
    Launches multiple distinct instances/windows of the specified application.
    Verifies that the requested number of instances were initiated.
    """
    results = []
    success_count = 0

    for i in range(count):
        # On modern Windows 11, launching Notepad via shell:AppsFolder or notepad.exe creates distinct instances
        res = launch_application(app_name)
        if res.get("success"):
            success_count += 1
            results.append(res)
        time.sleep(0.35)

    return {
        "success": success_count > 0,
        "application": app_name,
        "requested_count": count,
        "launched_count": success_count,
        "verified": success_count == count,
        "message": f"Launched {success_count} of {count} requested {app_name} instance{'s' if count != 1 else ''}."
    }
