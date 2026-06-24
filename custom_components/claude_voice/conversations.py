"""Leitura e parse dos NDJSON de conversas do Jarvis (puro/filesystem)."""
from __future__ import annotations

import json
import os
from typing import Any


def parse_ndjson(text: str) -> tuple[list[dict[str, Any]], int]:
    """Parseia NDJSON; retorna (registros dict, nº de linhas ilegíveis)."""
    records: list[dict[str, Any]] = []
    unreadable = 0
    for raw in text.splitlines():
        line = raw.strip()
        if not line:
            continue
        try:
            obj = json.loads(line)
        except ValueError:
            unreadable += 1
            continue
        if isinstance(obj, dict):
            records.append(obj)
        else:
            unreadable += 1
    return records, unreadable


def read_day(base_dir: str, date: str) -> tuple[list[dict[str, Any]], int]:
    """Lê o NDJSON de um dia. Arquivo ausente -> ([], 0)."""
    path = os.path.join(base_dir, f"{date}.ndjson")
    try:
        with open(path, "r", encoding="utf-8") as fh:
            return parse_ndjson(fh.read())
    except FileNotFoundError:
        return [], 0


def list_dates(base_dir: str) -> list[str]:
    """Datas disponíveis (YYYY-MM-DD), ordenadas."""
    try:
        names = os.listdir(base_dir)
    except FileNotFoundError:
        return []
    return sorted(n[:-7] for n in names if n.endswith(".ndjson") and len(n) == 17)


def list_conversations(base_dir: str, date: str) -> dict[str, Any]:
    """Payload do comando WS para um dia."""
    records, unreadable = read_day(base_dir, date)
    return {
        "records": records,
        "unreadable": unreadable,
        "dates_available": list_dates(base_dir),
    }
