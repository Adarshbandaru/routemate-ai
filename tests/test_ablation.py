import json
import tempfile
import unittest
from pathlib import Path

from routemate.ablation import CONFIGURATIONS, rank_configuration, ranking_weights, run_ablation
from routemate.candidates import run_candidate_pipeline
from routemate.synthetic import generate_dataset


class AblationTests(unittest.TestCase):
    def test_weight_membership_and_renormalization(self):
        self.assertNotIn("route_similarity", ranking_weights("route_removed"))
        self.assertNotIn("direction_similarity", ranking_weights("route_removed"))
        self.assertNotIn("departure_difference_min", ranking_weights("temporal_removed"))
        self.assertEqual(set(ranking_weights("context_removed")), set(ranking_weights("full")))
        for name in CONFIGURATIONS:
            self.assertAlmostEqual(sum(ranking_weights(name).values()), 1.0)

    def test_gates_same_and_order_reproducible(self):
        q = generate_dataset(seeds=(11,), requests_per_scenario=1, scenarios={"thin": 4})[0]
        result = run_candidate_pipeline(q.rider, q.drivers)
        expected = tuple(d.driver_id for d in result.feasibility_matrix if d.final_eligible)
        rankings = [rank_configuration(result.feasibility_matrix, name) for name in CONFIGURATIONS]
        self.assertTrue(all(set(r) == set(expected) for r in rankings))
        self.assertEqual(rankings, [rank_configuration(result.feasibility_matrix, name) for name in CONFIGURATIONS])

    def test_known_metrics_and_empty_relevant(self):
        from routemate.experiment import evaluate
        self.assertEqual(evaluate(("a",), (), 2, 1)["precision_at_k"], 0.0)
        self.assertIsNone(evaluate(("a",), (), 2, 1)["recall_at_k"])
        self.assertTrue(evaluate(("a",), (), 2, 1)["zero_relevant"])

    def test_artifacts_and_overwrite_refusal(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "out"
            run_ablation(output, seeds=(11,), requests_per_scenario=1, k=3)
            for name in ("manifest.json", "metrics.csv", "per_query.csv", "timing.csv", "synthetic_dataset.json"):
                self.assertTrue((output / name).exists())
            with self.assertRaises(FileExistsError):
                run_ablation(output, seeds=(11,), requests_per_scenario=1)
            manifest = json.loads((output / "manifest.json").read_text())
            self.assertEqual(manifest["configurations"], list(CONFIGURATIONS))


if __name__ == "__main__":
    unittest.main()
