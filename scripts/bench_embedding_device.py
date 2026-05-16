#!/usr/bin/env python3
"""CPU vs MPS embedding device benchmark for RAG indexing.

2-layer measurement:
  Layer A — pure HuggingFaceEmbeddings.embed_documents() (isolates device effect)
  Layer B — ProjectVectorStore._index_project_sync() (real end-to-end indexing)

No production code is modified. RAG_EMBEDDING_DEVICE is toggled per run via
a monkeypatch on the rag_service module attribute. A throwaway Qdrant
collection (bench_proj_<timestamp>) is created and deleted by the script.
"""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from datetime import datetime
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO_ROOT / "src" / "backend"))

DEFAULT_MODEL = "BAAI/bge-m3"
SOURCE_EXTS = {".py", ".ts", ".tsx", ".js", ".jsx", ".md", ".json", ".yaml", ".yml"}
IGNORE_DIRS = {".git", "node_modules", ".venv", "venv", "dist", "build", "__pycache__", ".cache", "coverage", ".next"}


def collect_chunks(root: Path, max_chunks: int, chunk_size: int = 1500, overlap: int = 300) -> list[str]:
    """Walk root, slice files into fixed-size character windows. Stops at max_chunks."""
    chunks: list[str] = []
    for path in root.rglob("*"):
        if not path.is_file() or path.suffix not in SOURCE_EXTS:
            continue
        if any(part in IGNORE_DIRS for part in path.parts):
            continue
        try:
            text = path.read_text(encoding="utf-8", errors="ignore")
        except Exception:
            continue
        if not text.strip():
            continue
        i = 0
        step = max(1, chunk_size - overlap)
        while i < len(text):
            piece = text[i : i + chunk_size]
            if len(piece) >= 100:
                chunks.append(piece)
                if len(chunks) >= max_chunks:
                    return chunks
            i += step
    return chunks


def mps_available() -> bool:
    try:
        import torch
        return bool(torch.backends.mps.is_available() and torch.backends.mps.is_built())
    except Exception:
        return False


def mps_sync() -> None:
    try:
        import torch
        if torch.backends.mps.is_available():
            torch.mps.synchronize()
    except Exception:
        pass


def make_embeddings(device: str, batch_size: int):
    from langchain_huggingface import HuggingFaceEmbeddings
    return HuggingFaceEmbeddings(
        model_name=DEFAULT_MODEL,
        model_kwargs={"device": device},
        encode_kwargs={"batch_size": batch_size, "normalize_embeddings": True},
    )


def bench_layer_a(chunks: list[str], runs: int, batch_size: int, devices: list[str]) -> dict:
    results: dict[str, dict] = {}
    for device in devices:
        print(f"\n[Layer A] device={device}: loading model {DEFAULT_MODEL}…", flush=True)
        emb = make_embeddings(device, batch_size)

        warm = chunks[: min(128, len(chunks))]
        emb.embed_documents(warm)
        if device == "mps":
            mps_sync()

        times: list[float] = []
        for i in range(runs):
            t0 = time.perf_counter()
            emb.embed_documents(chunks)
            if device == "mps":
                mps_sync()
            dt = time.perf_counter() - t0
            times.append(dt)
            print(f"  run {i + 1}/{runs}: {dt:.3f}s ({len(chunks) / dt:.1f} chunks/s)", flush=True)

        results[device] = {
            "times": times,
            "median": statistics.median(times),
            "p95": sorted(times)[max(0, int(len(times) * 0.95) - 1)],
            "stdev_ratio": (statistics.stdev(times) / statistics.median(times)) if len(times) > 1 else 0.0,
            "chunks_per_sec": len(chunks) / statistics.median(times),
            "n_chunks": len(chunks),
        }

        del emb
    return results


def bench_layer_b(corpus_root: Path, runs: int, devices: list[str]) -> dict:
    import services.rag_service as rs

    results: dict[str, dict] = {}
    bench_id_base = f"bench_proj_{int(time.time())}"

    for device in devices:
        print(f"\n[Layer B] device={device}: indexing {corpus_root}", flush=True)

        rs.RAG_EMBEDDING_DEVICE = device
        store = rs.ProjectVectorStore()

        warm_id = f"{bench_id_base}_{device}_warm"
        print(f"  warmup: {warm_id}", flush=True)
        try:
            store._index_project_sync(warm_id, str(corpus_root), force_reindex=True)
        except Exception as e:
            print(f"  warmup error: {e}", flush=True)
        finally:
            try:
                store.client.delete_collection(store._get_collection_name(warm_id))
            except Exception:
                pass

        times: list[float] = []
        chunks_indexed = 0
        files_indexed = 0
        for i in range(runs):
            run_id = f"{bench_id_base}_{device}_{i}"
            t0 = time.perf_counter()
            res = store._index_project_sync(run_id, str(corpus_root), force_reindex=True)
            if device == "mps":
                mps_sync()
            dt = time.perf_counter() - t0
            times.append(dt)
            chunks_indexed = res.chunks_created
            files_indexed = res.documents_indexed
            print(f"  run {i + 1}/{runs}: {dt:.3f}s | files={files_indexed} chunks={chunks_indexed}", flush=True)

            try:
                store.client.delete_collection(store._get_collection_name(run_id))
            except Exception:
                pass

        results[device] = {
            "times": times,
            "median": statistics.median(times),
            "stdev_ratio": (statistics.stdev(times) / statistics.median(times)) if len(times) > 1 else 0.0,
            "files": files_indexed,
            "chunks": chunks_indexed,
            "chunks_per_sec": chunks_indexed / statistics.median(times) if chunks_indexed else 0.0,
        }

        cache_file = Path.home() / ".aos" / "rag_index" / f"{bench_id_base}_{device}.json"
        for f in cache_file.parent.glob(f"{bench_id_base}*"):
            try:
                f.unlink()
            except Exception:
                pass

        del store
    return results


def print_table(title: str, results: dict, throughput_label: str) -> None:
    print(f"\n=== {title} ===")
    if not results:
        print("(no results)")
        return
    base = results.get("cpu", {}).get("median")
    print(f"{'device':<8}{'median':<12}{'p95':<10}{throughput_label:<16}{'stdev/med':<12}{'speedup':<10}")
    for dev, r in results.items():
        speed = (base / r["median"]) if base and r.get("median") else 0.0
        p95 = r.get("p95", r.get("median", 0))
        print(
            f"{dev:<8}{r['median']:<12.3f}{p95:<10.3f}"
            f"{r.get('chunks_per_sec', 0):<16.1f}{r.get('stdev_ratio', 0):<12.2%}{speed:<10.2f}x"
        )


def verdict(layer_a: dict, layer_b: dict) -> str:
    lines = ["", "=== Verdict ==="]
    a_speed = (layer_a.get("cpu", {}).get("median") / layer_a["mps"]["median"]) if layer_a.get("mps") and layer_a.get("cpu") else None
    b_speed = (layer_b.get("cpu", {}).get("median") / layer_b["mps"]["median"]) if layer_b.get("mps") and layer_b.get("cpu") else None

    if a_speed is not None:
        lines.append(f"Layer A speedup (pure embed): {a_speed:.2f}x")
    if b_speed is not None:
        lines.append(f"Layer B speedup (end-to-end): {b_speed:.2f}x")

    decision_speed = b_speed if b_speed is not None else a_speed
    if decision_speed is None:
        lines.append("Decision: insufficient data (MPS not measured)")
    elif decision_speed >= 3.0:
        lines.append("Decision: ≥3x — flip indexing CLI to MPS AND update rag_service.py:100-103 comment")
    elif decision_speed >= 2.0:
        lines.append("Decision: ≥2x — flip indexing CLI to MPS only (uvicorn stays on CPU)")
    else:
        lines.append("Decision: <2x — keep CPU default. Speedup not worth deadlock-risk asymmetry")

    if a_speed and b_speed and a_speed < b_speed:
        lines.append("WARNING: Layer A speedup < Layer B — measurement anomaly, re-run with more iterations")
    return "\n".join(lines)


def run_check() -> int:
    print("=== Sanity check ===")
    try:
        import torch
        print(f"torch: {torch.__version__}")
        print(f"mps available: {torch.backends.mps.is_available()}")
        print(f"mps built: {torch.backends.mps.is_built()}")
    except Exception as e:
        print(f"torch: FAIL ({e})")
        return 1
    try:
        import langchain_huggingface  # noqa: F401
        import sentence_transformers  # noqa: F401
        print("langchain_huggingface + sentence_transformers: OK")
    except Exception as e:
        print(f"embedding libs: FAIL ({e})")
        return 1
    try:
        import urllib.request
        urllib.request.urlopen(os.getenv("QDRANT_URL", "http://localhost:6333") + "/collections", timeout=3)
        print(f"qdrant {os.getenv('QDRANT_URL', 'http://localhost:6333')}: OK")
    except Exception as e:
        print(f"qdrant: UNREACHABLE ({e}) — Layer B will be skipped")
    cache = Path.home() / ".cache" / "huggingface" / "hub" / "models--BAAI--bge-m3"
    print(f"bge-m3 cache: {'PRESENT' if cache.exists() else 'MISSING (will download)'}")
    try:
        import services.rag_service as rs
        print(f"rag_service import: OK (default device={rs.RAG_EMBEDDING_DEVICE})")
    except Exception as e:
        print(f"rag_service import: FAIL ({e})")
        return 1
    return 0


def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--layer", choices=["a", "b", "both"], default="both")
    p.add_argument("--runs", type=int, default=3)
    p.add_argument("--batch-size", type=int, default=64)
    p.add_argument("--corpus-root", default="src")
    p.add_argument("--max-chunks", type=int, default=2000)
    p.add_argument("--devices", default="auto", help="auto|cpu|mps|cpu,mps")
    p.add_argument("--check", action="store_true")
    args = p.parse_args()

    if args.check:
        return run_check()

    if args.devices == "auto":
        devices = ["cpu"] + (["mps"] if mps_available() else [])
    else:
        devices = [d.strip() for d in args.devices.split(",") if d.strip()]
        if "mps" in devices and not mps_available():
            print("ERROR: --devices includes mps but MPS unavailable", file=sys.stderr)
            return 1
    print(f"[setup] measuring devices: {devices}")

    corpus_root = (REPO_ROOT / args.corpus_root).resolve()
    print(f"[setup] corpus root: {corpus_root}")
    print(f"[setup] collecting up to {args.max_chunks} chunks…")
    chunks = collect_chunks(corpus_root, args.max_chunks)
    print(f"[setup] collected {len(chunks)} chunks")
    if not chunks:
        print("ERROR: no chunks collected", file=sys.stderr)
        return 1

    layer_a: dict = {}
    layer_b: dict = {}
    if args.layer in ("a", "both"):
        layer_a = bench_layer_a(chunks, args.runs, args.batch_size, devices)
    if args.layer in ("b", "both"):
        try:
            import urllib.request
            urllib.request.urlopen(os.getenv("QDRANT_URL", "http://localhost:6333") + "/collections", timeout=3)
            layer_b = bench_layer_b(corpus_root, args.runs, devices)
        except Exception as e:
            print(f"[Layer B] SKIPPED — Qdrant unreachable: {e}", flush=True)

    print_table(f"Layer A (pure embed_documents, N={len(chunks)} chunks, batch={args.batch_size})", layer_a, "chunks/sec")
    if layer_b:
        print_table(f"Layer B (end-to-end indexing, project={args.corpus_root})", layer_b, "chunks/sec")
    print(verdict(layer_a, layer_b))

    out_dir = REPO_ROOT / "scripts" / "bench_results"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"bench_{datetime.now():%Y%m%d_%H%M%S}.json"
    out_path.write_text(json.dumps({
        "model": DEFAULT_MODEL,
        "batch_size": args.batch_size,
        "runs": args.runs,
        "n_chunks": len(chunks),
        "corpus_root": str(corpus_root),
        "layer_a": layer_a,
        "layer_b": layer_b,
    }, indent=2))
    print(f"\n[saved] {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
