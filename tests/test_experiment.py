import json, tempfile, unittest
from pathlib import Path
from routemate.experiment import evaluate, run_experiment
from routemate.synthetic import generate_dataset

class ExperimentTests(unittest.TestCase):
    def test_metrics_empty_zero_and_short(self):
        self.assertEqual(evaluate([], [], 0, 0)["precision_at_k"], 0)
        m = evaluate(["a"], ["a", "b"], 2, 1, 3)
        self.assertAlmostEqual(m["precision_at_k"], 1/3); self.assertAlmostEqual(m["recall_at_k"], .5)
        self.assertIsNone(evaluate([], [], 2, 0)["ndcg_at_k"])
    def test_reproducibility(self):
        a = generate_dataset((11,), 2); b = generate_dataset((11,), 2)
        self.assertEqual([(q.query_id,q.relevant_ids) for q in a], [(q.query_id,q.relevant_ids) for q in b])
    def test_artifacts_and_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "out"; run_experiment(p, (11,), requests_per_scenario=1)
            self.assertTrue((p / "manifest.json").exists()); self.assertTrue((p / "metrics.csv").exists())
            manifest = json.loads((p / "manifest.json").read_text())
            snapshot = json.loads((p / "synthetic_dataset.json").read_text())
            self.assertIn("src/routemate/geometry.py", manifest["code_sha256"])
            self.assertIn("route", snapshot[0]["rider"])
            self.assertIn("verification", snapshot[0]["drivers"][0])
            with self.assertRaises(FileExistsError): run_experiment(p, (11,), requests_per_scenario=1)
