"""Train unsupervised skip-gram FastText subword vectors from permitted text."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
from datetime import datetime, timezone


def train(corpus: str, output: str, *, dim: int = 100, window: int = 5, min_count: int = 2, epoch: int = 20, threads: int = 4):
    source = Path(corpus)
    if not source.is_file():
        raise FileNotFoundError("Training corpus does not exist")
    try:
        import fasttext
    except ImportError as cause:
        raise RuntimeError("Install fasttext-wheel in the isolated research environment") from cause
    model = fasttext.train_unsupervised(
        str(source), model="skipgram", dim=dim, ws=window, minCount=min_count,
        minn=2, maxn=5, epoch=epoch, thread=threads,
    )
    output_path = Path(output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    model.save_model(str(output_path))
    lines = source.read_text(encoding="utf-8").splitlines()
    manifest = {
        "model_type": "fasttext_skipgram_subword",
        "artifact": str(output_path),
        "corpus_file": source.name,
        "corpus_lines": len(lines),
        "dimensions": dim,
        "window": window,
        "min_token_frequency": min_count,
        "subword_ngrams": [2, 5],
        "epochs": epoch,
        "threads": threads,
        "trained_at_utc": datetime.now(timezone.utc).isoformat(),
        "license_and_consent_review_required": True,
    }
    output_path.with_suffix(output_path.suffix + ".manifest.json").write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    return model, manifest


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("corpus", help="UTF-8 narration-only corpus; one normalized narration per line")
    parser.add_argument("output")
    parser.add_argument("--dim", type=int, default=100)
    parser.add_argument("--window", type=int, default=5)
    parser.add_argument("--min-count", type=int, default=2)
    parser.add_argument("--epoch", type=int, default=20)
    parser.add_argument("--threads", type=int, default=4)
    args = parser.parse_args()
    train(args.corpus, args.output, dim=args.dim, window=args.window, min_count=args.min_count, epoch=args.epoch, threads=args.threads)
