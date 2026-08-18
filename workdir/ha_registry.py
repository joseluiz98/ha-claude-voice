#!/usr/bin/env python3
"""Resolve entity_id -> aparelho físico real (device, integração, área, gwId).

POR QUE ISTO EXISTE: /api/states NÃO devolve device, área nem integração, e o
registry do HA é WS-only (REST dá 404). Sem isto, um agente que lê o entity_id
não tem como saber que switch.interruptor_cozinha_interruptor_1 é o QUARTO.
Ver docs/superpowers/specs/2026-08-15-identidade-de-entidades-design.md
"""
import json
import os
import sys

STORAGE = "/config/.storage"
PREFERIDAS = ("localtuya", "tuya_local")   # a verdade da casa
NUVEM = ("tuya",)                          # recurso de emergência


def _carregar(storage_dir, nome):
    with open(os.path.join(storage_dir, nome), encoding="utf-8") as fh:
        return json.load(fh)["data"]


def gwid(device):
    """Chave que casa as duas visões do mesmo aparelho físico.

    LocalTuya identifica como local_<gwId>; a nuvem como <gwId> puro.
    """
    for ident in (device.get("identifiers") or []):
        if len(ident) < 2:
            continue
        valor = ident[1]
        return valor[6:] if valor.startswith("local_") else valor
    return None


def build_index(storage_dir=STORAGE):
    entidades = _carregar(storage_dir, "core.entity_registry")["entities"]
    devices = {d["id"]: d for d in _carregar(storage_dir, "core.device_registry")["devices"]}
    areas = {a["id"]: a["name"] for a in _carregar(storage_dir, "core.area_registry")["areas"]}

    por_entidade = {}
    por_gwid = {}
    for e in entidades:
        dev = devices.get(e.get("device_id") or "")
        g = gwid(dev) if dev else None
        area_id = e.get("area_id") or (dev.get("area_id") if dev else None)
        por_entidade[e["entity_id"]] = {
            "entity_id": e["entity_id"],
            "platform": e.get("platform") or None,
            "device": (dev.get("name_by_user") or dev.get("name")) if dev else None,
            "area": areas.get(area_id or ""),
            "gwid": g,
        }
        if g:
            por_gwid.setdefault(g, []).append(e["entity_id"])
    return {"entities": por_entidade, "by_gwid": por_gwid}


def resolve(index, entity_id):
    base = index["entities"].get(entity_id)
    rec = dict(base) if base else {
        "entity_id": entity_id, "platform": None,
        "device": None, "area": None, "gwid": None,
    }
    dominio = entity_id.split(".", 1)[0]
    irmas = [x for x in index["by_gwid"].get(rec.get("gwid") or "", []) if x != entity_id]
    preferidas = [x for x in irmas
                  if index["entities"][x].get("platform") in PREFERIDAS
                  and x.split(".", 1)[0] == dominio]
    rec["twins"] = irmas
    rec["preferred_twins"] = preferidas
    rec["is_preferred"] = rec.get("platform") in PREFERIDAS
    rec["is_fallback"] = bool(rec.get("platform") in NUVEM and preferidas)
    return rec


def format_suffix(rec):
    """Sufixo humano que os helpers concatenam em cada linha."""
    partes = []
    if rec.get("device"):
        partes.append(rec["device"].strip())
    if rec.get("platform"):
        rotulo = rec["platform"]
        # O aviso de nuvem depende SÓ da plataforma, nunca de existir gêmea local.
        # Amarrá-lo a is_fallback fazia entidades de nuvem sem gêmea do mesmo domínio
        # exibirem apenas "[tuya]", sem sinal nenhum de que dependem da nuvem.
        if rec.get("platform") in NUVEM:
            rotulo += "/NUVEM"
        partes.append("[" + rotulo + "]")
    if rec.get("area"):
        partes.append("area=" + rec["area"])
    if rec.get("is_preferred"):
        partes.append("<- PREFERIR")
    elif rec.get("is_fallback"):
        partes.append("<- FALLBACK, prefira " + ", ".join(rec["preferred_twins"]))
    return " ".join(partes)


def main(argv):
    if len(argv) < 2:
        print("uso: ha_registry.py <entity_id> [entity_id ...]", file=sys.stderr)
        return 2
    index = build_index()
    for eid in argv[1:]:
        rec = resolve(index, eid)
        sufixo = format_suffix(rec)
        print(eid + " | " + (sufixo if sufixo else "(sem device no registry)"))
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
