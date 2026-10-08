import csv
import json
import tempfile
import unittest
from pathlib import Path

from routemate.experiment import evaluate
from routemate.robustness import run_robustness


def _rows(path):
    with path.open(newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))


class RobustnessTests(unittest.TestCase):
  def test_control_metrics_match_evaluate(self):
    with tempfile.TemporaryDirectory() as d:
      manifest = run_robustness(Path(d) / "one", seeds=(11,), requests_per_scenario=1)
      rows = [r for r in _rows(Path(d) / "one" / "per_query.csv") if r["condition"] == "control"]
      self.assertTrue(rows)
      for row in rows:
        expected = evaluate(json.loads(row["ranking"]), [], int(row["original_pool_count"]),
                            int(row["eligible_count"]), 3)
        self.assertEqual(float(row["precision_at_k"]), expected["precision_at_k"])
      self.assertEqual(manifest["conditions"][0], "control")


  def test_availability_losses_are_disjoint(self):
    with tempfile.TemporaryDirectory() as d:
      out = Path(d) / "availability"
      run_robustness(out, seeds=(11,), requests_per_scenario=2)
      rows = [r for r in _rows(out / "per_query.csv") if r["condition"] == "availability_25pct"]
      self.assertTrue(all(int(r["relevant_lost_availability"]) + int(r["relevant_lost_hard_filter"]) <= int(r["relevant_count"]) for r in rows))


  def test_zero_labels_have_null_quality_denominators(self):
    with tempfile.TemporaryDirectory() as d:
      out = Path(d) / "zero"
      run_robustness(out, seeds=(11,), requests_per_scenario=1)
      row = next(r for r in _rows(out / "per_query.csv") if r["condition"] == "control" and r["query_id"].endswith("-000"))
      self.assertEqual(row["recall_at_k"], "")
      self.assertEqual(row["ndcg_at_k"], "")


  def test_manifest_hashes_and_matrix_include_unavailable(self):
    with tempfile.TemporaryDirectory() as d:
      out = Path(d) / "artifacts"
      run_robustness(out, seeds=(11,), requests_per_scenario=1)
      manifest = json.loads((out / "manifest.json").read_text(encoding="utf-8"))
      self.assertTrue(manifest["code_sha256"])
      self.assertNotIn("environment_variables", manifest)
      matrix = _rows(out / "feasibility_matrix.csv")
      self.assertTrue(matrix and {"query_id", "condition", "driver_id", "evaluated"}.issubset(matrix[0]))
      self.assertTrue(any(r["evaluated"] == "False" for r in matrix if r["condition"] == "availability_25pct"))


  def test_quality_is_deterministic(self):
    with tempfile.TemporaryDirectory() as d:
      root = Path(d); a, b = root / "a", root / "b"
      run_robustness(a, seeds=(11,), requests_per_scenario=1)
      run_robustness(b, seeds=(11,), requests_per_scenario=1)
      self.assertEqual([(r["condition"], r["ranking"]) for r in _rows(a / "per_query.csv")],
                       [(r["condition"], r["ranking"]) for r in _rows(b / "per_query.csv")])


if __name__ == "__main__":
    unittest.main()
