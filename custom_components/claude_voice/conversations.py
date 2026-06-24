"""Leitura e parse dos NDJSON de conversas do Jarvis (puro/filesystem)."""
from __future__ import annotations

import datetime as _dt
import json
import os
from typing import Any

MAX_RANGE_DAYS = 92


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


def read_range(
    base_dir: str, date_from: str, date_to: str
) -> tuple[list[dict[str, Any]], int]:
    """Lê e concatena os NDJSON de [date_from, date_to] (inclusive).

    Ordena as datas se vierem invertidas e limita a janela a MAX_RANGE_DAYS
    (clampando date_from) para evitar leituras enormes.
    """
    d0 = _dt.date.fromisoformat(date_from)
    d1 = _dt.date.fromisoformat(date_to)
    if d1 < d0:
        d0, d1 = d1, d0
    if (d1 - d0).days > MAX_RANGE_DAYS:
        d0 = d1 - _dt.timedelta(days=MAX_RANGE_DAYS)
    records: list[dict[str, Any]] = []
    unreadable = 0
    cur = d0
    while cur <= d1:
        recs, unread = read_day(base_dir, cur.isoformat())
        records.extend(recs)
        unreadable += unread
        cur += _dt.timedelta(days=1)
    return records, unreadable


def list_conversations(base_dir: str, date: str) -> dict[str, Any]:
    """Payload do comando WS para um dia."""
    records, unreadable = read_day(base_dir, date)
    return {
        "records": records,
        "unreadable": unreadable,
        "dates_available": list_dates(base_dir),
    }


def list_conversations_range(
    base_dir: str, date_from: str, date_to: str
) -> dict[str, Any]:
    """Payload do comando WS para um intervalo de dias."""
    records, unreadable = read_range(base_dir, date_from, date_to)
    return {
        "records": records,
        "unreadable": unreadable,
        "dates_available": list_dates(base_dir),
    }
