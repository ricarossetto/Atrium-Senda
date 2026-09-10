#!/usr/bin/env python3
"""
INPI RPI Scanner for ATRIUM Sidesystem
Adapted from PAINEL-INPI by Ricardo de Luca Rossetto.
Scans Seção V - Marcas of the Brazilian INPI RPI publication for monitored lawyers/attorneys.
"""
from __future__ import annotations

import argparse
import hashlib
import html
import json
import os
import re
import shutil
import sys
import tempfile
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from xml.etree import ElementTree as ET


BASE_RPI_URL = "https://revistas.inpi.gov.br/rpi/"
USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36"
SECTION = "Secao V - Marcas"


def now_iso() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat()


def read_json(path: Path, fallback: Any) -> Any:
    if not path.exists():
        return fallback
    try:
        with path.open("r", encoding="utf-8") as handle:
            return json.load(handle)
    except Exception:
        return fallback


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, ensure_ascii=False, indent=2)
        handle.write("\n")


def clean(value: Any) -> str:
    text = html.unescape(str(value or ""))
    return re.sub(r"\s+", " ", text).strip()


def normalize(value: Any) -> str:
    text = unicodedata.normalize("NFD", clean(value))
    text = "".join(char for char in text if unicodedata.category(char) != "Mn")
    return re.sub(r"\s+", " ", text.upper()).strip()


def compact(value: Any) -> str:
    return re.sub(r"[^A-Z0-9]", "", normalize(value))


def truncate(value: str, limit: int = 650) -> str:
    value = clean(value)
    if len(value) <= limit:
        return value
    return value[: limit - 1].rstrip() + "…"


def fetch_text(url: str) -> str:
    request = urllib.request.Request(
        url,
        headers={"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml,*/*"}
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        raw = response.read()
    return raw.decode("utf-8", errors="replace")


def fetch_json_post(url: str, payload: dict[str, str]) -> Any:
    encoded = urllib.parse.urlencode(payload).encode("utf-8")
    request = urllib.request.Request(
        url,
        data=encoded,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/json,*/*",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        raw = response.read()
    return json.loads(raw.decode("utf-8", errors="replace"))


def download_file(url: str, destination: Path, retries: int = 5, pause: float = 3.0) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    last_error: Exception | None = None
    for attempt in range(1, retries + 1):
        try:
            request = urllib.request.Request(
                url,
                headers={
                    "User-Agent": USER_AGENT,
                    "Accept": "application/zip,application/octet-stream,*/*",
                    "Referer": BASE_RPI_URL,
                },
            )
            expected_length = None
            with urllib.request.urlopen(request, timeout=180) as response, destination.open("wb") as handle:
                expected_length = response.headers.get("Content-Length")
                shutil.copyfileobj(response, handle)

            signature = destination.read_bytes()[:4]
            if not signature.startswith(b"PK"):
                preview = destination.read_bytes()[:160].decode("utf-8", errors="replace")
                raise RuntimeError(f"resposta inesperada do INPI no lugar do ZIP: {preview[:120]}")
            if expected_length and destination.stat().st_size != int(expected_length):
                raise RuntimeError(
                    f"download incompleto do ZIP: {destination.stat().st_size} de {expected_length} bytes"
                )
            if not zipfile.is_zipfile(destination):
                raise RuntimeError(f"ZIP invalido ou incompleto ({destination.stat().st_size} bytes)")
            return
        except (urllib.error.URLError, RuntimeError, zipfile.BadZipFile) as error:
            last_error = error
            if destination.exists():
                destination.unlink(missing_ok=True)
            if attempt < retries:
                time.sleep(pause * attempt)
    if last_error:
        raise last_error


def parse_revistas(page_html: str) -> list[dict[str, str]]:
    row_pattern = re.compile(
        r"<tr[^>]*>\s*<td>\s*(?P<number>\d{4})\s*</td>\s*<td>\s*(?P<date>\d{4}-\d{2}-\d{2})\s*</td>(?P<body>.*?)</tr>",
        re.IGNORECASE | re.DOTALL,
    )
    revistas: list[dict[str, str]] = []

    for row in row_pattern.finditer(page_html):
        number = row.group("number")
        body = row.group("body")
        pdf_match = re.search(r"https://revistas\.inpi\.gov\.br/pdf/Marcas" + re.escape(number) + r"\.pdf", body)
        xml_match = re.search(r"https://revistas\.inpi\.gov\.br/txt/RM" + re.escape(number) + r"\.zip", body)
        if not xml_match:
            continue
        revistas.append(
            {
                "numero": number,
                "data": row.group("date"),
                "pdfUrl": pdf_match.group(0) if pdf_match else f"https://revistas.inpi.gov.br/pdf/Marcas{number}.pdf",
                "xmlUrl": xml_match.group(0),
            }
        )

    return sorted(revistas, key=lambda item: int(item["numero"]), reverse=True)


def inpi_date_to_iso(value: str) -> str:
    value = clean(value)
    match = re.match(r"^(\d{2})/(\d{2})/(\d{4})$", value)
    if not match:
        return value
    day, month, year = match.groups()
    return f"{year}-{month}-{day}"


def fetch_revista_by_number(number: int) -> dict[str, str] | None:
    try:
        result = fetch_json_post(
            "https://revistas.inpi.gov.br/rpi/busca",
            {
                "revista.numero": str(number),
                "revista.tipoRevista.id": "5",
            },
        )
        if not result:
            return None
        item = result[0]
        xml_name = item.get("nomeArquivoEscritorio") or f"RM{number}.zip"
        pdf_name = item.get("nomeArquivo") or f"Marcas{number}.pdf"
        return {
            "numero": str(item.get("numero") or number),
            "data": inpi_date_to_iso(item.get("dataPublicacao", "")),
            "pdfUrl": f"https://revistas.inpi.gov.br/pdf/{pdf_name}",
            "xmlUrl": f"https://revistas.inpi.gov.br/txt/{xml_name}",
        }
    except Exception:
        return None


def complete_revistas(available: list[dict[str, str]], limit: int) -> list[dict[str, str]]:
    selected = available[:limit]
    seen = {item["numero"] for item in selected}
    if not selected:
        return selected

    next_number = int(selected[-1]["numero"]) - 1
    while len(selected) < limit and next_number >= 2404:
        try:
            extra = fetch_revista_by_number(next_number)
            if extra and extra["numero"] not in seen:
                selected.append(extra)
                seen.add(extra["numero"])
        except Exception:
            pass
        next_number -= 1
        time.sleep(0.5)
    return selected


def load_monitors_from_raw(raw_list: list[dict[str, Any]]) -> list[dict[str, Any]]:
    monitors = []
    for monitor in raw_list:
        terms = []
        for term in [monitor.get("label"), monitor.get("oab"), *monitor.get("terms", [])]:
            term = clean(term)
            if term and term not in terms:
                terms.append(term)
        monitors.append(
            {
                **monitor,
                "termsPrepared": [
                    {
                        "label": term,
                        "normalized": normalize(term),
                        "compact": compact(term),
                    }
                    for term in terms
                ],
            }
        )
    return monitors


def tag_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1] if "}" in tag else tag


def iter_children(element: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in list(element) if tag_name(child.tag) == name]


def first_child(element: ET.Element, name: str) -> ET.Element | None:
    for child in list(element):
        if tag_name(child.tag) == name:
            return child
    return None


def descendants(element: ET.Element, name: str) -> list[ET.Element]:
    return [child for child in element.iter() if tag_name(child.tag) == name]


def element_text(element: ET.Element | None) -> str:
    if element is None:
        return ""
    return clean(" ".join(part for part in element.itertext() if part and part.strip()))


def raw_process_text(element: ET.Element) -> str:
    parts: list[str] = []
    for child in element.iter():
        if tag_name(child.tag) == "especificacao":
            continue
        parts.extend(str(value) for value in child.attrib.values() if value)
        text = child.text.strip() if child.text and child.text.strip() else ""
        if text:
            parts.append(text)
    return clean(" ".join(parts))


def process_to_record(element: ET.Element, revista: dict[str, str]) -> dict[str, Any]:
    marca_el = first_child(element, "marca")
    marca_nome = element_text(first_child(marca_el, "nome")) if marca_el is not None else ""

    titulares = []
    titulares_el = first_child(element, "titulares")
    if titulares_el is not None:
        for titular in iter_children(titulares_el, "titular"):
            titulares.append(
                {
                    "nome": clean(titular.attrib.get("nome-razao-social")),
                    "pais": clean(titular.attrib.get("pais")),
                    "uf": clean(titular.attrib.get("uf")),
                }
            )

    despachos = []
    despachos_el = first_child(element, "despachos")
    if despachos_el is not None:
        for despacho in iter_children(despachos_el, "despacho"):
            despachos.append(
                {
                    "codigo": clean(despacho.attrib.get("codigo")),
                    "nome": clean(despacho.attrib.get("nome")),
                    "texto": truncate(element_text(despacho), 900),
                }
            )

    classes = []
    for classe in descendants(element, "classe-nice"):
        classes.append(
            {
                "codigo": clean(classe.attrib.get("codigo")),
                "status": truncate(element_text(first_child(classe, "status")), 160),
                "especificacao": truncate(element_text(first_child(classe, "especificacao")), 700),
            }
        )

    procuradores = []
    for procurador in descendants(element, "procurador"):
        nome = element_text(procurador)
        if nome and nome not in procuradores:
            procuradores.append(nome)

    raw_text = raw_process_text(element)
    fields = {
        "marca": marca_nome,
        "procurador": " ".join(procuradores),
        "requerente": " ".join(item["nome"] for item in titulares),
        "despacho": " ".join(
            f"{item.get('codigo', '')} {item.get('nome', '')} {item.get('texto', '')}" for item in despachos
        ),
        "classe": " ".join(f"{item.get('codigo', '')} {item.get('status', '')} {item.get('especificacao', '')}" for item in classes),
        "texto": raw_text,
    }

    return {
        "processo": clean(element.attrib.get("numero")),
        "dataDeposito": clean(element.attrib.get("data-deposito")),
        "dataConcessao": clean(element.attrib.get("data-concessao")),
        "dataVigencia": clean(element.attrib.get("data-vigencia")),
        "marca": {
            "nome": marca_nome,
            "apresentacao": clean(marca_el.attrib.get("apresentacao")) if marca_el is not None else "",
            "natureza": clean(marca_el.attrib.get("natureza")) if marca_el is not None else "",
        },
        "requerentes": titulares,
        "procuradores": procuradores,
        "despachos": despachos,
        "classes": classes,
        "fields": fields,
        "revista": {
            "numero": revista["numero"],
            "data": revista["data"],
        },
        "links": {
            "pdf": revista.get("pdfUrl"),
            "xml": revista.get("xmlUrl"),
        },
    }


def contains_prepared_field(field: dict[str, str], prepared_term: dict[str, str]) -> bool:
    if not field["normalized"]:
        return False
    if prepared_term["normalized"] and prepared_term["normalized"] in field["normalized"]:
        return True
    compact_term = prepared_term["compact"]
    if len(compact_term) >= 5 and compact_term in field["compact"]:
        return True
    return False


def match_monitors(record: dict[str, Any], monitors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    hits = []
    fields = {
        name: value
        for name, value in record["fields"].items()
        if name in {"marca", "procurador", "requerente", "despacho", "texto"}
    }
    prepared_fields = {
        name: {
            "normalized": normalize(value),
            "compact": compact(value),
        }
        for name, value in fields.items()
    }

    for monitor in monitors:
        matched_terms = []
        matched_fields: set[str] = set()
        for term in monitor["termsPrepared"]:
            term_fields = []
            for field_name, field_value in prepared_fields.items():
                if contains_prepared_field(field_value, term):
                    term_fields.append(field_name)
            if term_fields:
                matched_terms.append(term["label"])
                matched_fields.update(field for field in term_fields if field != "texto")

        if matched_terms:
            hits.append(
                {
                    "id": monitor.get("id"),
                    "label": monitor.get("label"),
                    "type": monitor.get("type", "advogado"),
                    "matchedTerms": sorted(set(matched_terms)),
                    "fields": sorted(matched_fields) if matched_fields else ["texto"],
                }
            )

    return hits


def make_match_id(record: dict[str, Any], monitor_hits: list[dict[str, Any]]) -> str:
    dispatch_codes = ",".join(item.get("codigo", "") for item in record.get("despachos", []))
    monitors = ",".join(hit.get("id", "") for hit in monitor_hits)
    seed = "|".join(
        [
            str(record.get("revista", {}).get("numero", "")),
            str(record.get("processo", "")),
            dispatch_codes,
            str(record.get("marca", {}).get("nome", "")),
            monitors,
        ]
    )
    return hashlib.sha1(seed.encode("utf-8")).hexdigest()[:20]


def strip_private_fields(record: dict[str, Any]) -> dict[str, Any]:
    return {key: value for key, value in record.items() if key != "fields"}


def scan_zip(zip_path: Path, revista: dict[str, str], monitors: list[dict[str, Any]]) -> list[dict[str, Any]]:
    matches = []
    with zipfile.ZipFile(zip_path, "r") as archive:
        members = [name for name in archive.namelist() if name.lower().endswith(".xml")]
        if not members:
            raise RuntimeError(f"XML nao encontrado em {zip_path.name}")
        with archive.open(members[0]) as stream:
            for _event, element in ET.iterparse(stream, events=("end",)):
                if tag_name(element.tag) != "processo":
                    continue
                record = process_to_record(element, revista)
                monitor_hits = match_monitors(record, monitors)
                if monitor_hits:
                    record["monitores"] = monitor_hits
                    record["id"] = make_match_id(record, monitor_hits)
                    matches.append(strip_private_fields(record))
                element.clear()
    return matches


def merge_by_id(old_items: list[dict[str, Any]], new_items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged = {item.get("id"): item for item in old_items if item.get("id")}
    for item in new_items:
        merged[item["id"]] = item
    return list(merged.values())


def sort_matches(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return sorted(
        items,
        key=lambda item: (
            int(item.get("revista", {}).get("numero") or 0),
            str(item.get("processo") or ""),
        ),
        reverse=True,
    )


def summarize_statistics(matches: list[dict[str, Any]], revistas: list[dict[str, Any]]) -> dict[str, Any]:
    process_count = len({item.get("processo") for item in matches if item.get("processo")})
    latest = None
    if revistas:
        latest = sorted(revistas, key=lambda item: int(item.get("numero") or 0), reverse=True)[0]
    return {
        "totalMatches": len(matches),
        "totalRevistas": len(revistas),
        "totalProcesses": process_count,
        "latestRevista": {
            "numero": latest.get("numero"),
            "data": latest.get("data"),
        }
        if latest
        else None,
    }


def build_revista_summary(
    scanned: list[dict[str, Any]],
    existing: list[dict[str, Any]],
    matches: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    by_number = {item.get("numero"): item for item in existing if item.get("numero")}
    match_counts = Counter(str(item.get("revista", {}).get("numero")) for item in matches)
    for item in scanned:
        number = item["numero"]
        by_number[number] = {
            **item,
            "status": item.get("status", "lida"),
            "matchCount": match_counts.get(number, 0),
        }
    for number, item in list(by_number.items()):
        item["matchCount"] = match_counts.get(str(number), item.get("matchCount", 0))
    return sorted(by_number.values(), key=lambda item: int(item.get("numero") or 0), reverse=True)


def run(args: argparse.Namespace) -> int:
    monitors_raw = []
    if args.monitors_json:
        try:
            parsed = json.loads(args.monitors_json)
            if isinstance(parsed, list):
                monitors_raw = parsed
            elif isinstance(parsed, dict) and "monitors" in parsed:
                monitors_raw = parsed["monitors"]
        except Exception as err:
            print(f"Erro ao decodificar --monitors-json: {err}", file=sys.stderr)

    if not monitors_raw and args.config:
        config_path = Path(args.config)
        cfg = read_json(config_path, {})
        monitors_raw = cfg.get("monitors", [])

    if not monitors_raw:
        print("Aviso: Nenhum monitor de advogado configurado para o escaneamento.", file=sys.stderr)
        return 0

    monitors = load_monitors_from_raw(monitors_raw)
    data_path = Path(args.data)

    print(f"Iniciando varredura da RPI para {len(monitors)} advogado(s) monitorado(s)...", file=sys.stderr)
    try:
        page_html = fetch_text(args.source)
        available = parse_revistas(page_html)
    except Exception as err:
        print(f"Falha ao baixar indice do INPI: {err}", file=sys.stderr)
        return 1

    selected = complete_revistas(available, args.limit)
    if not selected:
        print("Nenhuma revista da Secao V - Marcas encontrada no indice do INPI", file=sys.stderr)
        return 1

    existing_data = read_json(data_path, {"matches": [], "revistas": []})
    new_matches: list[dict[str, Any]] = []
    scanned_revistas: list[dict[str, Any]] = []
    errors: list[dict[str, str]] = []

    with tempfile.TemporaryDirectory(prefix="atrium-inpi-") as temp_dir:
        temp_root = Path(temp_dir)
        for revista in selected:
            number = revista["numero"]
            print(f"Processando RPI {number} ({revista['data']})...", file=sys.stderr)
            zip_path = temp_root / f"RM{number}.zip"
            try:
                download_file(revista["xmlUrl"], zip_path, retries=args.download_retries, pause=args.pause)
                revista_matches = scan_zip(zip_path, revista, monitors)
                new_matches.extend(revista_matches)
                scanned_revistas.append({**revista, "status": "lida", "matchCount": len(revista_matches)})
                print(f"  RPI {number}: {len(revista_matches)} ocorrencia(s) encontrada(s)", file=sys.stderr)
            except Exception as error:
                message = clean(error)
                errors.append({"revista": number, "message": message})
                scanned_revistas.append({**revista, "status": "erro", "error": message, "matchCount": 0})
                print(f"  RPI {number} falhou: {message}", file=sys.stderr)
            time.sleep(args.pause)

    matches = sort_matches(merge_by_id(existing_data.get("matches", []), new_matches))
    revistas = build_revista_summary(scanned_revistas, existing_data.get("revistas", []), matches)

    data = {
        "generatedAt": now_iso(),
        "source": {
            "rpiUrl": args.source,
            "section": SECTION,
        },
        "statistics": summarize_statistics(matches, revistas),
        "revistas": revistas,
        "matches": matches,
        "lastRun": {
            "startedAt": now_iso(),
            "scannedRevistas": len(scanned_revistas),
            "newMatchesThisRun": len(new_matches),
            "errors": errors,
            "monitors": [
                {
                    "id": monitor.get("id"),
                    "label": monitor.get("label"),
                    "type": monitor.get("type", "advogado"),
                    "oab": monitor.get("oab", ""),
                }
                for monitor in monitors
            ],
        },
    }

    write_json(data_path, data)
    print(f"Varredura concluida: {len(matches)} ocorrencia(s) acumulada(s), {len(new_matches)} nesta execucao.", file=sys.stderr)
    return 0


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Varredura RPI / INPI para o ATRIUM.")
    parser.add_argument("--limit", type=int, default=1, help="Quantidade de revistas recentes a processar (padrao: 1 para semanal).")
    parser.add_argument("--source", default=BASE_RPI_URL, help="URL do indice da RPI.")
    parser.add_argument("--config", default="", help="Caminho do arquivo config.json opcional.")
    parser.add_argument("--monitors-json", default="", help="JSON string com lista de monitores de advogados.")
    parser.add_argument("--data", default="data/inpi/inpi-dashboard.json", help="Arquivo de destino dos dados.")
    parser.add_argument("--pause", type=float, default=1.5, help="Pausa em segundos entre requisicoes.")
    parser.add_argument("--download-retries", type=int, default=4, help="Retentativas por arquivo.")
    return parser.parse_args()


if __name__ == "__main__":
    raise SystemExit(run(parse_args()))
