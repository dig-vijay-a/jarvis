import os
from pathlib import Path
from security.validator import validate_safe_path

SUPPORTED_EXTENSIONS = {
    ".txt", ".md", ".json", ".js", ".jsx", ".ts", ".tsx",
    ".py", ".html", ".css", ".csv", ".log", ".yaml", ".yml", ".env", ".pdf", ".docx", ".pptx"
}

def get_cwd() -> dict:
    """Returns the current working directory and user workspace path."""
    return {
        "success": True,
        "cwd": os.getcwd(),
        "workspace": str(Path.cwd().resolve()),
        "user_home": str(Path.home())
    }

def smart_search_files(query: str = "", pattern: str = "*", file_type: str = "", limit: int = 25) -> dict:
    """
    Intelligent multi-root file discovery across Desktop, Documents, Downloads,
    OneDrive, and current workspace.
    Filters out dependencies and build artifacts (.git, node_modules, etc.).
    Sorts results by modified timestamp descending so the user's newest files appear first.
    """
    user_home = Path.home()
    roots = []
    
    candidates = [
        user_home / "OneDrive" / "Desktop",
        user_home / "Desktop",
        user_home / "OneDrive" / "Documents",
        user_home / "Documents",
        user_home / "Downloads",
        Path.cwd()
    ]
    for c in candidates:
        if c.exists() and c not in roots:
            roots.append(c)

    results = []
    seen_paths = set()
    query_lower = query.strip().lower()
    pattern_lower = pattern.strip().lower()

    ext_filter = None
    if file_type:
        ext_filter = f".{file_type.lstrip('.').lower()}"
    elif pattern_lower.startswith("*."):
        ext_filter = pattern_lower[1:]

    skip_dirs = {
        "node_modules", ".git", "venv", "__pycache__", "dist", "build",
        "appdata", "local settings", "application data", "site-packages"
    }

    for root in roots:
        try:
            for dirpath, dirnames, filenames in os.walk(root):
                try:
                    rel = Path(dirpath).relative_to(root)
                    depth = len(rel.parts)
                except Exception:
                    depth = 0

                dirnames[:] = [d for d in dirnames if not d.startswith(".") and d.lower() not in skip_dirs and depth < 4]

                for fname in filenames:
                    if fname.startswith("~$"):
                        continue

                    full_path = Path(dirpath) / fname
                    p_str = str(full_path)
                    if p_str in seen_paths:
                        continue

                    f_lower = fname.lower()
                    f_ext = full_path.suffix.lower()

                    if ext_filter and f_ext != ext_filter:
                        continue

                    matched = False
                    if not query_lower and (pattern_lower == "*" or pattern_lower in f_lower):
                        matched = True
                    elif query_lower:
                        if query_lower in f_lower or query_lower in p_str.lower():
                            matched = True
                        elif any(token in f_lower for token in query_lower.split() if len(token) > 2):
                            matched = True
                    else:
                        matched = True

                    if matched:
                        seen_paths.add(p_str)
                        try:
                            st = full_path.stat()
                            results.append({
                                "name": fname,
                                "path": p_str,
                                "size": st.st_size,
                                "modified": st.st_mtime,
                                "extension": f_ext,
                                "directory": dirpath
                            })
                        except Exception:
                            continue
        except Exception:
            continue

    # Sort results by modified timestamp descending (newest file first)
    results.sort(key=lambda x: x.get("modified", 0), reverse=True)

    return {
        "success": True,
        "query": query,
        "pattern": pattern,
        "total_found": len(results),
        "count": min(len(results), limit),
        "files": results[:limit],
        "roots_searched": [str(r) for r in roots]
    }

def search_files(directory: str = ".", pattern: str = "*", limit: int = 50) -> dict:
    try:
        base_path = validate_safe_path(directory, must_exist=True)
        results = []
        pattern_lower = pattern.lower()
        
        for root, dirs, files in os.walk(base_path):
            # Skip hidden and cache folders
            dirs[:] = [d for d in dirs if not d.startswith(".") and d not in ("node_modules", "__pycache__", "dist", "build")]
            
            for file in files:
                if len(results) >= limit:
                    break
                if pattern_lower == "*" or pattern_lower in file.lower() or Path(file).match(pattern):
                    full_p = Path(root) / file
                    try:
                        stat = full_p.stat()
                        results.append({
                            "name": file,
                            "path": str(full_p),
                            "size": stat.st_size,
                            "modified": stat.st_mtime,
                            "extension": full_p.suffix
                        })
                    except Exception:
                        continue
            if len(results) >= limit:
                break

        # Sort newest modified files first
        results.sort(key=lambda x: x.get("modified", 0), reverse=True)

        return {
            "success": True,
            "directory": str(base_path),
            "count": len(results),
            "files": results
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def read_file(file_path: str, max_chars: int = 15000) -> dict:
    try:
        p = validate_safe_path(file_path, must_exist=True)
        if not p.is_file():
            return {"success": False, "error": f"Path is not a regular file: {file_path}"}

        ext = p.suffix.lower()
        
        # Word docx handling
        if ext == ".docx":
            try:
                import docx
                doc = docx.Document(str(p))
                full_text = "\n".join([para.text for para in doc.paragraphs])
                return {
                    "success": True,
                    "path": str(p),
                    "extension": ext,
                    "content": full_text[:max_chars],
                    "truncated": len(full_text) > max_chars,
                    "total_chars": len(full_text)
                }
            except Exception as de:
                return {"success": False, "error": f"Failed reading docx: {str(de)}"}

        # PDF handling
        if ext == ".pdf":
            try:
                import pypdf
                reader = pypdf.PdfReader(str(p))
                text_parts = []
                for idx, page in enumerate(reader.pages):
                    page_text = page.extract_text() or ""
                    if page_text:
                        text_parts.append(f"--- [Page {idx+1}] ---\n{page_text}")
                full_text = "\n\n".join(text_parts)
                return {
                    "success": True,
                    "path": str(p),
                    "extension": ext,
                    "content": full_text[:max_chars],
                    "truncated": len(full_text) > max_chars,
                    "total_chars": len(full_text)
                }
            except Exception as pe:
                return {"success": False, "error": f"Failed reading pdf: {str(pe)}"}

        # PowerPoint presentation (.pptx) handling via standard library zipfile & XML
        if ext == ".pptx":
            try:
                import zipfile
                import xml.etree.ElementTree as ET
                text_parts = []
                with zipfile.ZipFile(str(p), 'r') as z:
                    slide_files = sorted([f for f in z.namelist() if f.startswith('ppt/slides/slide') and f.endswith('.xml')])
                    for idx, sfile in enumerate(slide_files):
                        try:
                            xml_content = z.read(sfile)
                            root = ET.fromstring(xml_content)
                            slide_texts = [elem.text.strip() for elem in root.iter() if elem.text and elem.text.strip()]
                            if slide_texts:
                                text_parts.append(f"--- [Slide {idx+1}] ---\n" + "\n".join(slide_texts))
                        except Exception:
                            continue
                full_text = "\n\n".join(text_parts) if text_parts else "Presentation slides contains no readable text."
                return {
                    "success": True,
                    "path": str(p),
                    "extension": ext,
                    "content": full_text[:max_chars],
                    "truncated": len(full_text) > max_chars,
                    "total_chars": len(full_text)
                }
            except Exception as ppe:
                return {"success": False, "error": f"Failed reading presentation: {str(ppe)}"}

        if ext not in SUPPORTED_EXTENSIONS and not ext.isalnum():
            return {"success": False, "error": f"File type '{ext}' is not in supported readable formats."}

        with open(p, "r", encoding="utf-8", errors="replace") as f:
            content = f.read(max_chars + 1)

        truncated = len(content) > max_chars
        return {
            "success": True,
            "path": str(p),
            "extension": ext,
            "content": content[:max_chars],
            "truncated": truncated,
            "size": p.stat().st_size
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def create_folder(folder_path: str) -> dict:
    try:
        p = validate_safe_path(folder_path, must_exist=False)
        p.mkdir(parents=True, exist_ok=True)
        return {
            "success": True,
            "path": str(p),
            "message": f"Folder successfully created at: {p}"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def rename_file(old_path: str, new_name: str) -> dict:
    try:
        p = validate_safe_path(old_path, must_exist=True)
        target = p.parent / new_name
        # Prevent traversal in new_name
        validate_safe_path(str(target), must_exist=False)
        p.rename(target)
        return {
            "success": True,
            "old_path": str(p),
            "new_path": str(target),
            "message": f"Successfully renamed to {new_name}"
        }
    except Exception as e:
        return {"success": False, "error": str(e)}

def write_file(file_path: str, content: str) -> dict:
    try:
        p = validate_safe_path(file_path, must_exist=False)
        p.parent.mkdir(parents=True, exist_ok=True)
        with open(p, "w", encoding="utf-8") as f:
            f.write(content)
        stat = p.stat()
        return {
            "success": True,
            "path": str(p),
            "size": stat.st_size,
            "filename": p.name,
            "message": f"Successfully wrote {stat.st_size} bytes to '{p.name}'."
        }
    except Exception as e:
        return {"success": False, "error": f"Failed to write file: {str(e)}"}

def open_file_with_app(file_path: str) -> dict:
    try:
        import subprocess
        import time
        from automation.desktop import verify_window_presence
        p = validate_safe_path(file_path, must_exist=True)
        proc_pid = None
        proc_hints = []
        if p.suffix.lower() in (".txt", ".log", ".md", ".json"):
            # Ensure Windows 11 Store Notepad host is active so the document window renders visibly
            from automation.desktop import list_windows
            pre_wins = list_windows().get("windows", [])
            has_notepad = any("notepad" in str(w.get("process_name") or "").lower() for w in pre_wins)
            if not has_notepad:
                try:
                    os.startfile(r"shell:AppsFolder\Microsoft.WindowsNotepad_8wekyb3d8bbwe!App")
                    time.sleep(1.0)
                except Exception:
                    pass
            proc = subprocess.Popen(["notepad.exe", str(p)])
            proc_pid = proc.pid
            proc_hints = ["notepad"]
        else:
            os.startfile(str(p))

        title_hints = [p.name.lower(), p.stem.lower()]
        win_check = verify_window_presence(process_hints=proc_hints, title_hints=title_hints, pid=proc_pid, timeout_sec=4.5)
        return {
            "success": bool(win_check["window_visible"] or win_check["process_created"]),
            "path": str(p),
            "filename": p.name,
            "pid": win_check["pid"] or proc_pid,
            "process_created": win_check["process_created"],
            "window_visible": win_check["window_visible"],
            "document_title_matched": win_check["document_title_matched"],
            "matched_hwnd": win_check["matched_hwnd"],
            "matched_window_title": win_check["matched_window_title"],
            "verification_level": win_check["verification_level"],
            "message": (
                f"Opened '{p.name}' and confirmed window '{win_check['matched_window_title']}'."
                if win_check["window_visible"]
                else f"Dispatched open for '{p.name}', but visible document window could not be confirmed."
            )
        }
    except Exception as e:
        return {
            "success": False,
            "process_created": False,
            "window_visible": False,
            "document_title_matched": False,
            "verification_level": "none",
            "error": f"Failed to open file: {str(e)}"
        }
