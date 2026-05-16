#!/usr/bin/env python3
"""
Cortex Arena · Signal Pusher
============================

Sends synthetic biometric + workflow signals to the team's Oracle backend on
the DGX Spark every 30 seconds (configurable). Drives a realistic cognitive
arc so the demo dashboard animates:

    GREEN  →  YELLOW  →  RED  →  INTERVENTION  →  RECOVERY  →  GREEN

Usage
-----
    python3 scripts/signal_pusher.py
    python3 scripts/signal_pusher.py --interval 15
    python3 scripts/signal_pusher.py --host http://100.80.177.127:8000
    python3 scripts/signal_pusher.py --once    # one shot, useful for testing

Endpoints used (per team spec)
------------------------------
    GET  /health   — verify connection before pushing
    POST /oracle   — body: synthetic signals, response: Socratic question + risk
    GET  /signals  — read back current risk score (for logging)
    GET  /trace    — read back session history (for logging)

Privacy
-------
This script generates synthetic data only. Nothing from your actual machine
is uploaded.
"""

from __future__ import annotations

import argparse
import json
import random
import signal
import sys
import time
import urllib.error
import urllib.request
from dataclasses import dataclass
from typing import Optional

DEFAULT_HOST = "http://100.80.177.127:8000"
DEFAULT_INTERVAL = 30  # seconds


# ─────────────────────────────────────────────────────────────────────────────
# Cognitive arc — a scripted journey through realistic states
# ─────────────────────────────────────────────────────────────────────────────


@dataclass
class StatePreset:
    """Realistic ranges for a single cognitive state."""

    label: str
    hr_range: tuple[int, int]
    hrv_range: tuple[int, int]
    attention_range: tuple[int, int]
    switches_range: tuple[int, int]
    notif_range: tuple[int, int]
    error_rate_range: tuple[float, float]
    deadline_minutes_range: tuple[int, int]
    active_apps: list[str]
    task_pool: list[str]
    workflow_state: str
    duration_ticks: int  # how many emissions to stay in this state


ARC: list[StatePreset] = [
    StatePreset(
        label="green_flow",
        hr_range=(60, 72),
        hrv_range=(60, 85),
        attention_range=(82, 95),
        switches_range=(1, 4),
        notif_range=(0, 3),
        error_rate_range=(0.01, 0.04),
        deadline_minutes_range=(55, 60),
        active_apps=["VS Code"],
        task_pool=[
            "Drafting hackathon submission",
            "Implementing agent loop",
        ],
        workflow_state="flow",
        duration_ticks=2,
    ),
    StatePreset(
        label="yellow_drift",
        hr_range=(78, 92),
        hrv_range=(38, 55),
        attention_range=(55, 70),
        switches_range=(8, 14),
        notif_range=(8, 16),
        error_rate_range=(0.05, 0.09),
        deadline_minutes_range=(25, 40),
        active_apps=["VS Code", "Chrome", "Slack"],
        task_pool=[
            "Pair debugging socket layer",
            "Researching async cleanup pattern",
        ],
        workflow_state="switching",
        duration_ticks=2,
    ),
    StatePreset(
        label="red_overload",
        hr_range=(98, 118),
        hrv_range=(18, 30),
        attention_range=(28, 48),
        switches_range=(18, 28),
        notif_range=(22, 34),
        error_rate_range=(0.10, 0.18),
        deadline_minutes_range=(3, 15),
        active_apps=["Terminal", "Slack", "Chrome"],
        task_pool=[
            "Resolving TypeError in agent loop",
            "Triaging design review thread",
        ],
        workflow_state="debugging",
        duration_ticks=3,
    ),
    StatePreset(
        label="intervention",
        hr_range=(85, 95),
        hrv_range=(32, 45),
        attention_range=(55, 70),
        switches_range=(5, 9),
        notif_range=(4, 8),
        error_rate_range=(0.05, 0.08),
        deadline_minutes_range=(8, 18),
        active_apps=["VS Code"],
        task_pool=["Focus mode active, Slack muted"],
        workflow_state="flow",
        duration_ticks=2,
    ),
    StatePreset(
        label="recovery",
        hr_range=(72, 82),
        hrv_range=(50, 65),
        attention_range=(72, 85),
        switches_range=(2, 5),
        notif_range=(2, 5),
        error_rate_range=(0.03, 0.06),
        deadline_minutes_range=(12, 25),
        active_apps=["VS Code"],
        task_pool=["Back in deep work"],
        workflow_state="flow",
        duration_ticks=2,
    ),
]


def jitter(lo: float, hi: float, decimals: int = 0) -> float:
    """Random value in [lo, hi], rounded."""
    val = random.uniform(lo, hi)
    return round(val, decimals) if decimals > 0 else round(val)


def build_signals(preset: StatePreset, tick: int) -> dict:
    """
    Build a synthetic signal payload.

    The Oracle backend expects the following four "stuck developer" signals:
      - hrv_drop:         int   how much HRV has dropped (higher = more stuck)
      - compile_failures: int   count of repeated compilation errors
      - repeated_file:    str   filename the developer keeps re-opening
      - deleted_comment:  str   recent code or comment the dev deleted

    We synthesize realistic values from the cognitive-state preset so the
    scripted arc translates into the team's signal schema.
    """
    # Derive hrv_drop from the preset's HRV range — lower HRV = bigger drop.
    # Map HRV 80 → drop 0, HRV 20 → drop 60.
    hrv_target = jitter(*preset.hrv_range)
    hrv_drop = max(0, round(80 - hrv_target))

    # Compile failures correlate with debugging intensity.
    compile_map = {
        "green_flow": 0,
        "yellow_drift": jitter(1, 3),
        "red_overload": jitter(4, 9),
        "intervention": jitter(0, 2),
        "recovery": 0,
    }
    compile_failures = compile_map.get(preset.label, 0)

    # Files the developer keeps reopening — scenario-specific.
    repeated_file_pool = {
        "green_flow": [""],
        "yellow_drift": ["", "agent.ts", "useAttentionTracking.ts"],
        "red_overload": [
            "nemotronAgent.ts",
            "reactLoop.ts",
            "useAttentionTracking.ts",
            "orchestrator.ts",
        ],
        "intervention": ["nemotronAgent.ts"],
        "recovery": [""],
    }
    repeated_file = random.choice(repeated_file_pool.get(preset.label, [""]))

    # Recently deleted comment / code — what the dev is yanking out in frustration.
    deleted_comment_pool = {
        "green_flow": [""],
        "yellow_drift": [
            "// TODO: fix this later",
            "// will revisit",
        ],
        "red_overload": [
            "// this should work??",
            "// FIXME: wtf",
            "// FIX: why is this null",
            "// XXX: investigate",
        ],
        "intervention": [""],
        "recovery": [""],
    }
    deleted_comment = random.choice(deleted_comment_pool.get(preset.label, [""]))

    return {
        "hrv_drop": int(hrv_drop),
        "compile_failures": int(compile_failures),
        "repeated_file": repeated_file,
        "deleted_comment": deleted_comment,
        # Metadata the backend may ignore — kept for trace context.
        "state_hint": preset.label,
        "tick": tick,
        "timestamp_ms": int(time.time() * 1000),
    }


# ─────────────────────────────────────────────────────────────────────────────
# HTTP helpers — stdlib only, no extra deps
# ─────────────────────────────────────────────────────────────────────────────


def http_get(url: str, timeout: float = 6.0) -> Optional[dict]:
    try:
        with urllib.request.urlopen(url, timeout=timeout) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except (urllib.error.URLError, json.JSONDecodeError, TimeoutError) as e:
        print(f"  ! GET {url} failed: {e}")
        return None


def http_post_json(url: str, body: dict, timeout: float = 30.0) -> Optional[dict]:
    data = json.dumps(body).encode("utf-8")
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            raw = resp.read().decode("utf-8")
            try:
                return json.loads(raw)
            except json.JSONDecodeError:
                return {"_raw": raw}
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", errors="replace")[:200]
        print(f"  ! POST {url} → HTTP {e.code}: {body}")
        return None
    except (urllib.error.URLError, TimeoutError) as e:
        print(f"  ! POST {url} failed: {e}")
        return None


# ─────────────────────────────────────────────────────────────────────────────
# Driver
# ─────────────────────────────────────────────────────────────────────────────


def ts() -> str:
    return time.strftime("%H:%M:%S")


def check_health(host: str) -> bool:
    print(f"[{ts()}] health check → {host}/health")
    res = http_get(f"{host}/health")
    if not res:
        return False
    print(f"  ✓ {res.get('status', '?')}")
    if "model" in res:
        print(f"    model:     {res['model']}")
    if "inference" in res:
        print(f"    inference: {res['inference']}")
    if "privacy" in res:
        print(f"    privacy:   {res['privacy']}")
    return True


def push_one(host: str, preset: StatePreset, tick: int) -> None:
    payload = build_signals(preset, tick)
    file_disp = payload["repeated_file"] or "—"
    comment_disp = (payload["deleted_comment"] or "—")[:30]
    print(
        f"[{ts()}] arc={preset.label:14s} tick={tick:>3d}  "
        f"hrv_drop={payload['hrv_drop']:>2d} compile_failures={payload['compile_failures']:>2d}  "
        f"file=\"{file_disp}\"  deleted=\"{comment_disp}\""
    )

    oracle = http_post_json(f"{host}/oracle", payload)
    if oracle:
        # Surface common response shapes — adapt to whatever the backend returns.
        risk = oracle.get("risk_score") or oracle.get("risk")
        question = (
            oracle.get("socratic_question")
            or oracle.get("question")
            or oracle.get("oracle")
            or oracle.get("response")
        )
        if risk is not None:
            print(f"  → oracle risk={risk}")
        if question:
            q = question if isinstance(question, str) else json.dumps(question)
            print(f"  → \"{q[:120]}{'...' if len(q) > 120 else ''}\"")
        if not risk and not question:
            print(f"  → {json.dumps(oracle)[:200]}")

    signals = http_get(f"{host}/signals")
    if signals:
        rs = signals.get("risk_score")
        n = len(signals.get("signals", []) or [])
        print(f"  · /signals  risk_score={rs}  history_size={n}")


def run_loop(host: str, interval: float, once: bool) -> None:
    if not check_health(host):
        print("[fatal] backend is not reachable. exiting.")
        sys.exit(1)

    def shutdown(_signum, _frame):
        print(f"\n[{ts()}] stopped.")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    print(f"[{ts()}] starting demo arc. interval={interval}s. ctrl-c to stop.\n")

    tick = 0
    while True:
        for preset in ARC:
            for _ in range(preset.duration_ticks):
                push_one(host, preset, tick)
                tick += 1
                if once:
                    return
                time.sleep(interval)


def main() -> None:
    parser = argparse.ArgumentParser(description="Cortex Arena signal pusher")
    parser.add_argument(
        "--host",
        default=DEFAULT_HOST,
        help=f"Oracle backend base URL (default: {DEFAULT_HOST})",
    )
    parser.add_argument(
        "--interval",
        type=float,
        default=DEFAULT_INTERVAL,
        help=f"Seconds between pushes (default: {DEFAULT_INTERVAL})",
    )
    parser.add_argument(
        "--once",
        action="store_true",
        help="Send a single payload then exit. Useful for smoke testing.",
    )
    args = parser.parse_args()

    run_loop(args.host, args.interval, args.once)


if __name__ == "__main__":
    main()
