"""Train a supervised FastText model on a pre-cleaned, permitted corpus."""
from __future__ import annotations
import argparse
from pathlib import Path


def train(training_file: str, output_prefix: str, epoch: int = 25, dim: int = 100):
    path = Path(training_file)
    if not path.is_file():
        raise FileNotFoundError("Training data file does not exist")
    try:
        import fasttext
    except ImportError as cause:
        raise RuntimeError("Install fasttext-wheel in the isolated research environment") from cause
    model = fasttext.train_supervised(input=str(path), epoch=epoch, dim=dim, wordNgrams=2, minn=2, maxn=5, loss="softmax")
    model.save_model(output_prefix)
    return model


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("training_file", help="One normalized narration per line, prefixed by __label__category")
    parser.add_argument("output_prefix")
    args = parser.parse_args()
    train(args.training_file, args.output_prefix)
