import os
import io
import json
import time
import base64
import ctypes
import hashlib
import tempfile
import subprocess
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import numpy as np
from PIL import Image, ImageGrab, ImageChops

try:
    import cv2
    CV2_AVAILABLE = True
except ImportError:
    CV2_AVAILABLE = False

try:
    import win32gui
    import win32ui
    import win32con
    import win32process
    import psutil
    PYWIN32_AVAILABLE = True
except ImportError:
    PYWIN32_AVAILABLE = False

try:
    from pywinauto import Application
    PYWINAUTO_AVAILABLE = True
except ImportError:
    PYWINAUTO_AVAILABLE = False

from automation.desktop import ensure_interactive_desktop, list_windows

user32 = ctypes.windll.user32
OCR_SCRIPT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "ocr_winrt.ps1")


def _image_to_base64(img: Image.Image) -> str:
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    return base64.b64encode(buf.getvalue()).decode("utf-8")


def _base64_to_image(b64: str) -> Image.Image:
    raw = b64.split(",", 1)[1] if "," in b64 else b64
    return Image.open(io.BytesIO(base64.b64decode(raw))).convert("RGB")


def _compute_pixel_stats(img: Image.Image) -> Dict[str, Any]:
    arr = np.asarray(img.convert("RGB"))
    h, w = arr.shape[:2]
    total_px = max(1, h * w)
    non_black = int((arr.sum(axis=2) > 6).sum())
    luma_std = float(arr.mean(axis=2).std())
    sha = hashlib.sha256(arr.tobytes()).hexdigest()
    return {
        "width": int(w),
        "height": int(h),
        "non_black_pixels": non_black,
        "non_black_ratio": round(non_black / total_px, 4),
        "luma_std": round(luma_std, 2),
        "pixel_sha256": sha,
    }


def _grab_window_printwindow(hwnd: int) -> Optional[Image.Image]:
    if not PYWIN32_AVAILABLE or not hwnd or not win32gui.IsWindow(hwnd):
        return None
    ensure_interactive_desktop()
    if user32.IsIconic(hwnd):
        return None
    rect = win32gui.GetWindowRect(hwnd)
    ww = rect[2] - rect[0]
    hh = rect[3] - rect[1]
    if ww <= 10 or hh <= 10:
        return None

    hdc = win32gui.GetWindowDC(hwnd)
    mfc = win32ui.CreateDCFromHandle(hdc)
    sdc = mfc.CreateCompatibleDC()
    bmp = win32ui.CreateBitmap()
    try:
        bmp.CreateCompatibleBitmap(mfc, ww, hh)
        sdc.SelectObject(bmp)
        # PW_RENDERFULLCONTENT = 2 captures DWM/DirectComposition surfaces reliably
        res = user32.PrintWindow(hwnd, sdc.GetSafeHdc(), 2)
        if res == 0:
            res = user32.PrintWindow(hwnd, sdc.GetSafeHdc(), 0)
        info = bmp.GetInfo()
        bits = bmp.GetBitmapBits(True)
        img = Image.frombuffer("RGB", (info["bmWidth"], info["bmHeight"]), bits, "raw", "BGRX", 0, 1)
        if res == 0 and np.asarray(img).sum() == 0:
            return None
        return img
    finally:
        try:
            win32gui.DeleteObject(bmp.GetHandle())
        except Exception:
            pass
        try:
            sdc.DeleteDC()
        except Exception:
            pass
        try:
            mfc.DeleteDC()
        except Exception:
            pass
        try:
            win32gui.ReleaseDC(hwnd, hdc)
        except Exception:
            pass


def capture_real_screen(
    mode: str = "desktop",
    hwnd: Optional[int] = None,
    region: Optional[Dict[str, int]] = None,
    include_base64: bool = True,
) -> Dict[str, Any]:
    """
    Captures genuine desktop or window pixels via Windows Win32 GDI/DWM.
    Never returns synthetic placeholder frames.
    """
    ensure_interactive_desktop()
    captured_at = datetime.now(timezone.utc).isoformat()
    img = None
    capture_method = None
    errors: List[str] = []

    if mode == "window" and hwnd:
        try:
            img = _grab_window_printwindow(int(hwnd))
            if img is not None:
                capture_method = "win32_printwindow"
        except Exception as e:
            errors.append(f"printwindow: {e}")

    if img is None:
        try:
            bbox = None
            if region and all(k in region for k in ("x", "y", "width", "height")):
                bbox = (
                    int(region["x"]),
                    int(region["y"]),
                    int(region["x"]) + int(region["width"]),
                    int(region["y"]) + int(region["height"]),
                )
            elif mode == "window" and hwnd and PYWIN32_AVAILABLE and win32gui.IsWindow(int(hwnd)):
                r = win32gui.GetWindowRect(int(hwnd))
                if r[2] > r[0] and r[3] > r[1]:
                    bbox = (r[0], r[1], r[2], r[3])
            img = ImageGrab.grab(bbox=bbox, all_screens=False)
            capture_method = "pil_imagegrab_desktop" if bbox is None else "pil_imagegrab_region"
        except Exception as e:
            errors.append(f"imagegrab: {e}")

    # Secondary real-window fallback if desktop-wide ImageGrab is blocked by session lock
    if img is None and hwnd:
        try:
            img = _grab_window_printwindow(int(hwnd))
            if img is not None:
                capture_method = "win32_printwindow_fallback"
        except Exception as e:
            errors.append(f"printwindow_fallback: {e}")

    if img is None:
        return {
            "success": False,
            "capture_failed": True,
            "synthetic": False,
            "timestamp": captured_at,
            "error": "Real screen capture unavailable on current desktop handle: " + "; ".join(errors),
        }

    stats = _compute_pixel_stats(img)
    if stats["width"] < 20 or stats["height"] < 20:
        return {
            "success": False,
            "capture_failed": True,
            "synthetic": False,
            "timestamp": captured_at,
            "error": f"Captured frame dimensions too small ({stats['width']}x{stats['height']}).",
        }

    payload: Dict[str, Any] = {
        "success": True,
        "synthetic": False,
        "capture_method": capture_method,
        "timestamp": captured_at,
        "hwnd": hwnd,
        **stats,
    }
    if include_base64:
        b64 = _image_to_base64(img)
        payload["image"] = f"data:image/png;base64,{b64}"
    return payload


def extract_ocr_from_image(img: Image.Image) -> Dict[str, Any]:
    """Runs Windows local WinRT OCR on a PIL Image with bounding boxes."""
    if not os.path.exists(OCR_SCRIPT_PATH):
        return {"success": False, "error": f"OCR helper script missing at {OCR_SCRIPT_PATH}", "lines": [], "full_text": ""}

    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as tf:
            tmp_path = tf.name
        # Upscale very small windows slightly to boost Windows OCR legibility on crisp UI fonts
        proc_img = img
        if img.width < 900 and img.height < 700:
            proc_img = img
        proc_img.save(tmp_path, format="PNG")

        proc = subprocess.run(
            ["powershell", "-NoProfile", "-ExecutionPolicy", "Bypass", "-File", OCR_SCRIPT_PATH, "-ImagePath", tmp_path],
            capture_output=True,
            text=True,
            timeout=15,
        )
        if proc.returncode != 0:
            return {
                "success": False,
                "error": (proc.stderr or proc.stdout or "WinRT OCR failed").strip()[:400],
                "lines": [],
                "full_text": "",
            }
        raw = (proc.stdout or "").strip()
        if not raw:
            return {"success": True, "engine": "windows_winrt_ocr", "duration_ms": 0, "full_text": "", "line_count": 0, "lines": []}
        parsed = json.loads(raw)
        lines = parsed.get("lines") or []
        if isinstance(lines, dict):
            lines = [lines]
        return {
            "success": bool(parsed.get("ok", True)),
            "engine": parsed.get("engine", "windows_winrt_ocr"),
            "language": parsed.get("language", "en-US"),
            "duration_ms": parsed.get("duration_ms", 0),
            "full_text": parsed.get("full_text", ""),
            "line_count": len(lines),
            "lines": lines,
        }
    except Exception as e:
        return {"success": False, "error": str(e), "lines": [], "full_text": ""}
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.remove(tmp_path)
            except Exception:
                pass


def inspect_ui_tree(hwnd: Optional[int] = None, max_elements: int = 90) -> Dict[str, Any]:
    """
    Inspects real UI Automation elements, dialogs, buttons, menus, inputs, and coordinates
    via pywinauto + Win32 EnumWindows.
    """
    ensure_interactive_desktop()
    win_res = list_windows()
    windows = win_res.get("windows", []) if isinstance(win_res, dict) else []

    target_win = None
    explicit_hwnd_missing = False
    if hwnd:
        if PYWIN32_AVAILABLE and not win32gui.IsWindow(int(hwnd)):
            explicit_hwnd_missing = True
        else:
            target_win = next((w for w in windows if int(w.get("hwnd", 0)) == int(hwnd)), None)
            if target_win is None and PYWIN32_AVAILABLE and win32gui.IsWindow(int(hwnd)):
                r = win32gui.GetWindowRect(int(hwnd))
                _, pid = win32process.GetWindowThreadProcessId(int(hwnd))
                pname = ""
                try:
                    pname = psutil.Process(pid).name()
                except Exception:
                    pass
                target_win = {
                    "hwnd": int(hwnd),
                    "title": win32gui.GetWindowText(int(hwnd)),
                    "process_name": pname,
                    "display_app": pname.replace(".exe", "").capitalize(),
                    "class_name": win32gui.GetClassName(int(hwnd)),
                    "pid": pid,
                    "rect": {"x": r[0], "y": r[1], "width": r[2] - r[0], "height": r[3] - r[1]},
                    "is_foreground": int(hwnd) == user32.GetForegroundWindow(),
                }
    elif target_win is None:
        target_win = next((w for w in windows if w.get("is_foreground")), windows[0] if windows else None)

    if explicit_hwnd_missing:
        return {
            "success": True,
            "window_missing": True,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "active_window": None,
            "window_count": len(windows),
            "windows": windows[:20],
            "dialogs": [],
            "elements_count": 0,
            "elements": [],
            "uia_error": f"HWND {hwnd} no longer exists"
        }

    dialogs = [
        w for w in windows
        if w.get("class_name") in ("#32770", "NUIDialog", "TaskDialog")
        or any(k in (w.get("title") or "").lower() for k in ("confirm", "dialog", "save as", "open", "warning", "error", "alert", "password", "sign in", "credential"))
    ]

    elements: List[Dict[str, Any]] = []
    uia_error: Optional[str] = None
    if target_win and PYWINAUTO_AVAILABLE:
        try:
            app = Application(backend="uia").connect(handle=int(target_win["hwnd"]))
            dlg = app.window(handle=int(target_win["hwnd"]))
            descendants = dlg.descendants()
            for idx, d in enumerate(descendants):
                if len(elements) >= max_elements:
                    break
                try:
                    info = d.element_info
                    ctype = str(info.control_type or "")
                    rect = d.rectangle()
                    rw = int(rect.right - rect.left)
                    rh = int(rect.bottom - rect.top)
                    if rw <= 0 or rh <= 0:
                        continue
                    text_val = ""
                    try:
                        text_val = str(d.window_text() or "").strip()
                    except Exception:
                        pass
                    if not text_val and ctype in ("Pane", "Group") and idx > 12:
                        continue
                    auto_id = str(getattr(info, "automation_id", "") or "")
                    ctrl_val = ""
                    if ctype == "Edit" and not any(k in (text_val + " " + auto_id).lower() for k in ("password", "passcode", "secret", "pin")):
                        try:
                            ctrl_val = str(d.legacy_properties().get("Value") or "")[:140]
                        except Exception:
                            ctrl_val = ""
                    enabled = True
                    try:
                        enabled = bool(d.is_enabled())
                    except Exception:
                        pass
                    elem_obj = {
                        "index": len(elements),
                        "control_type": ctype,
                        "name": text_val[:140],
                        "value": ctrl_val,
                        "automation_id": auto_id[:80],
                        "enabled": enabled,
                        "rect": {"x": int(rect.left), "y": int(rect.top), "width": rw, "height": rh},
                        "center": {"x": int(rect.left + rw // 2), "y": int(rect.top + rh // 2)},
                        "interactive": ctype in ("Button", "Edit", "Document", "MenuItem", "TabItem", "CheckBox", "RadioButton", "ComboBox", "Hyperlink", "ListItem"),
                    }
                    elements.append(elem_obj)
                    if ctype in ("Dialog", "Window") and text_val and text_val != target_win.get("title"):
                        dialogs.append({
                            "hwnd": target_win["hwnd"],
                            "title": text_val,
                            "class_name": "UIA_Dialog",
                            "process_name": target_win.get("process_name"),
                            "rect": elem_obj["rect"],
                        })
                except Exception:
                    continue
        except Exception as e:
            uia_error = str(e)

    return {
        "success": True,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "active_window": target_win,
        "window_count": len(windows),
        "windows": windows[:20],
        "dialogs": dialogs,
        "elements_count": len(elements),
        "elements": elements,
        "uia_error": uia_error,
    }


def diff_visual_frames(prev_b64: str, curr_b64: str, threshold: float = 12.0) -> Dict[str, Any]:
    """Detects visual pixel changes and changed regions between two real screenshots."""
    im1 = _base64_to_image(prev_b64)
    im2 = _base64_to_image(curr_b64)
    if im1.size != im2.size:
        im2_cmp = im2.resize(im1.size)
        size_changed = True
    else:
        im2_cmp = im2
        size_changed = False

    a1 = np.asarray(im1, dtype=np.int16)
    a2 = np.asarray(im2_cmp, dtype=np.int16)
    abs_diff = np.abs(a1 - a2).mean(axis=2)
    mean_diff = float(abs_diff.mean())
    changed_mask = abs_diff > threshold
    changed_ratio = float(changed_mask.mean())

    changed_regions: List[Dict[str, int]] = []
    if CV2_AVAILABLE and np.any(changed_mask):
        mask_u8 = (changed_mask.astype(np.uint8) * 255)
        kernel = np.ones((7, 7), np.uint8)
        dilated = cv2.dilate(mask_u8, kernel, iterations=2)
        contours, _ = cv2.findContours(dilated, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        rects = [cv2.boundingRect(c) for c in contours]
        rects = [r for r in rects if r[2] * r[3] >= 64]
        rects.sort(key=lambda r: r[2] * r[3], reverse=True)
        for rx, ry, rw, rh in rects[:8]:
            changed_regions.append({"x": int(rx), "y": int(ry), "width": int(rw), "height": int(rh)})

    return {
        "success": True,
        "size_changed": size_changed,
        "mean_abs_diff": round(mean_diff, 3),
        "changed_pixel_ratio": round(changed_ratio, 5),
        "visual_changed": bool(size_changed or changed_ratio > 0.0015 or mean_diff > 0.35),
        "changed_regions": changed_regions,
    }


def observe_environment(
    hwnd: Optional[int] = None,
    mode: str = "window",
    include_ocr: bool = True,
    include_ui_tree: bool = True,
    include_image: bool = True,
    prev_image_b64: Optional[str] = None,
) -> Dict[str, Any]:
    """
    Full real visual perception snapshot:
    - Real screen/window capture (no mocks)
    - Win32 window + UIA element tree + dialog detection
    - Windows WinRT OCR text extraction
    - Optional pixel change diff against prior observation
    """
    t0 = time.time()
    ui_data = inspect_ui_tree(hwnd=hwnd) if include_ui_tree else {"active_window": None, "windows": [], "dialogs": [], "elements": []}
    resolved_hwnd = hwnd or (ui_data.get("active_window") or {}).get("hwnd")

    cap_mode = "window" if (mode == "window" and resolved_hwnd) else "desktop"
    cap = capture_real_screen(mode=cap_mode, hwnd=resolved_hwnd, include_base64=True)
    if not cap.get("success"):
        return {
            "success": False,
            "capture_failed": True,
            "error": cap.get("error", "Capture failed"),
            "ui": ui_data,
        }

    ocr_data = {"success": True, "full_text": "", "lines": [], "line_count": 0}
    if include_ocr:
        img = _base64_to_image(cap["image"])
        ocr_data = extract_ocr_from_image(img)

    diff_data = None
    if prev_image_b64:
        try:
            diff_data = diff_visual_frames(prev_image_b64, cap["image"])
        except Exception as de:
            diff_data = {"success": False, "error": str(de), "visual_changed": None}

    result = {
        "success": True,
        "synthetic": False,
        "timestamp": cap["timestamp"],
        "duration_ms": int((time.time() - t0) * 1000),
        "capture_method": cap["capture_method"],
        "width": cap["width"],
        "height": cap["height"],
        "non_black_pixels": cap["non_black_pixels"],
        "non_black_ratio": cap["non_black_ratio"],
        "pixel_sha256": cap["pixel_sha256"],
        "active_window": ui_data.get("active_window"),
        "window_count": ui_data.get("window_count", 0),
        "windows": ui_data.get("windows", []),
        "dialogs": ui_data.get("dialogs", []),
        "elements_count": len(ui_data.get("elements", [])),
        "elements": ui_data.get("elements", []),
        "uia_error": ui_data.get("uia_error"),
        "ocr": ocr_data,
        "visual_diff": diff_data,
    }
    if include_image:
        result["image"] = cap["image"]
    return result
