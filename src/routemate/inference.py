"""Artifact-only inference boundary.

Callers must apply RouteMate's deterministic hard safety, verification,
capacity, route, time, and detour gates before passing rows here.
"""
import argparse
import json
from pathlib import Path
from .ml import LogisticRanker

def predict_feature_rows(model_path, feature_rows):
    return LogisticRanker.load(model_path).predict_proba(feature_rows)

def rank_eligible_feature_rows(model_path, feature_rows, ids=None):
    model = LogisticRanker.load(model_path)
    return model.rank(feature_rows, ids)

def main(argv=None):
    p = argparse.ArgumentParser()
    p.add_argument("--model", required=True); p.add_argument("--features", required=True); p.add_argument("--output", required=True)
    a = p.parse_args(argv)
    rows = json.loads(Path(a.features).read_text(encoding="utf-8"))
    result = {"probabilities": predict_feature_rows(a.model, rows), "ranking": list(rank_eligible_feature_rows(a.model, rows))}
    Path(a.output).write_text(json.dumps(result, indent=2), encoding="utf-8")

if __name__ == "__main__":
    main()
