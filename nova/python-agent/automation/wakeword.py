import os
import sys
import time
from typing import Dict, Any, Optional

class LocalWakeWordEngine:
    def __init__(self):
        self.active = True
        self.phrase = "Hey Jarvis"
        self.sensitivity = 0.75
        self.is_muted = False
        self.last_triggered_at = None
        self.trigger_count = 0

    def get_status(self) -> Dict[str, Any]:
        return {
            "success": True,
            "engine": "JARVIS Local Wake-Word Engine (Zero External Audio Streaming)",
            "active": self.active,
            "phrase": self.phrase,
            "sensitivity": self.sensitivity,
            "is_muted": self.is_muted,
            "last_triggered_at": self.last_triggered_at,
            "trigger_count": self.trigger_count,
            "privacy_mode": "Strict Local Processing"
        }

    def configure(self, phrase: Optional[str] = None, active: Optional[bool] = None, 
                  is_muted: Optional[bool] = None, sensitivity: Optional[float] = None) -> Dict[str, Any]:
        if phrase is not None:
            self.phrase = phrase.strip()
        if active is not None:
            self.active = active
        if is_muted is not None:
            self.is_muted = is_muted
        if sensitivity is not None:
            self.sensitivity = max(0.1, min(1.0, float(sensitivity)))

        return {
            "success": True,
            "message": "Wake-word engine parameters updated.",
            "status": self.get_status()
        }

    def process_utterance(self, text: str) -> Dict[str, Any]:
        """
        Locally detects if the activation phrase was spoken.
        If detected, extracts the remaining command payload.
        """
        if not self.active or self.is_muted or not text:
            return {"detected": False, "command": ""}

        lower_text = text.lower().strip()
        lower_phrase = self.phrase.lower().strip()
        variants = [
            lower_phrase,
            "hey jarvis",
            "jarvis",
            "ok jarvis",
            "hi jarvis",
            "hello jarvis",
            "hey nova",
            "nova",
            "ok nova",
            "hi nova",
            "hello nova"
        ]

        matched_variant = None
        for v in variants:
            if lower_text.startswith(v) or f" {v} " in f" {lower_text} ":
                matched_variant = v
                break

        if matched_variant:
            self.trigger_count += 1
            self.last_triggered_at = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
            # Extract command after the wake-word
            pos = lower_text.find(matched_variant)
            after = text[pos + len(matched_variant):].strip().lstrip(',').lstrip('.').strip()
            return {
                "detected": True,
                "phrase_matched": matched_variant,
                "command": after,
                "timestamp": self.last_triggered_at
            }

        return {"detected": False, "command": ""}

wake_word_engine = LocalWakeWordEngine()

def get_wake_word_status() -> Dict[str, Any]:
    return wake_word_engine.get_status()

def configure_wake_word(phrase: Optional[str] = None, active: Optional[bool] = None, 
                        is_muted: Optional[bool] = None, sensitivity: Optional[float] = None) -> Dict[str, Any]:
    return wake_word_engine.configure(phrase, active, is_muted, sensitivity)

def process_wake_word(text: str) -> Dict[str, Any]:
    return wake_word_engine.process_utterance(text)
