import webbrowser
from typing import Optional, Dict, Any
from security.validator import validate_url

SENSITIVE_DOMAIN_TOKENS = ("1password", "bitwarden", "keepass", "lastpass", "dashlane", "paypal", "stripe", "coinbase", "metamask", "chase.com", "bankofamerica")


def open_url(url: str) -> dict:
    valid_url = validate_url(url)
    try:
        webbrowser.open(valid_url)
        return {
            "success": True,
            "url": valid_url,
            "message": f"Opened {valid_url} in system browser"
        }
    except Exception as e:
        return {
            "success": False,
            "url": valid_url,
            "error": f"Failed to open browser: {str(e)}"
        }


def browser_interact(
    url: str,
    action: str = "inspect",
    selector: Optional[str] = None,
    text: Optional[str] = None,
    confirmed: bool = False,
    headless: bool = False,
) -> Dict[str, Any]:
    """
    Performs local verified browser automation using Playwright when available,
    with sensitive domain/credential protection.
    """
    valid_url = validate_url(url)
    low = valid_url.lower()
    if any(tok in low for tok in SENSITIVE_DOMAIN_TOKENS):
        return {
            "success": False,
            "blocked": True,
            "error": f"Security Policy Blocked: Browser automation restricted on financial/password domain ({valid_url})."
        }

    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        return open_url(valid_url)

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=headless)
            page = browser.new_page(viewport={"width": 1280, "height": 800})
            page.goto(valid_url, wait_until="domcontentloaded", timeout=15000)

            action_result = {}
            if action == "click" and selector:
                page.click(selector, timeout=8000)
                action_result = {"clicked": selector}
            elif action == "fill" and selector and text is not None:
                el_type = ""
                el_name = ""
                try:
                    loc = page.locator(selector).first
                    el_type = (loc.get_attribute("type") or "").lower()
                    el_name = ((loc.get_attribute("name") or "") + " " + (loc.get_attribute("placeholder") or "")).lower()
                except Exception:
                    pass
                is_pw_field = (el_type == "password") or any(k in (selector.lower() + " " + el_name) for k in ("password", "passcode", "secret", "_pw"))
                if is_pw_field and not confirmed:
                    browser.close()
                    return {
                        "success": False,
                        "blocked": True,
                        "requires_approval": True,
                        "error": "Confirmation required: Browser password/credential field entry blocked without approval."
                    }
                page.fill(selector, text, timeout=8000)
                action_result = {"filled": selector, "length": len(text)}
            elif action == "scroll":
                page.mouse.wheel(0, 400)
                action_result = {"scrolled": True}

            title = page.title()
            visible_text = (page.inner_text("body") or "")[:3000]
            elements = page.evaluate("""() => {
              const out = [];
              document.querySelectorAll('button, a, input, select, textarea, h1, h2').forEach((el, idx) => {
                if (idx >= 40) return;
                const r = el.getBoundingClientRect();
                if (r.width <= 0 || r.height <= 0) return;
                out.push({
                  tag: el.tagName.toLowerCase(),
                  id: el.id || '',
                  type: el.getAttribute('type') || '',
                  text: (el.innerText || el.value || el.placeholder || '').trim().slice(0, 100),
                  rect: { x: Math.round(r.left), y: Math.round(r.top), width: Math.round(r.width), height: Math.round(r.height) }
                });
              });
              return out;
            }""")
            shot_bytes = page.screenshot(type="png")
            import base64
            shot_b64 = "data:image/png;base64," + base64.b64encode(shot_bytes).decode("utf-8")
            browser.close()

            return {
                "success": True,
                "url": valid_url,
                "title": title,
                "action": action,
                "action_result": action_result,
                "visible_text": visible_text,
                "elements_count": len(elements),
                "elements": elements,
                "screenshot": shot_b64,
                "verified": True,
            }
    except Exception as e:
        return {"success": False, "url": valid_url, "error": f"Browser interaction failed: {str(e)}"}
