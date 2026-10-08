import csv
import json
import tempfile
import unittest
from pathlib import Path

from routemate.candidates import run_candidate_pipeline
from routemate.heldout import HELDOUT_SEEDS, generate_heldout_labels, run_heldout
from routemate.synthetic import generate_dataset


class HeldoutTests(unittest.TestCase):
    def test_labels_are_deterministic_and_distinct(self):
        q = generate_dataset((101,), 3)
        a, _ = generate_heldout_labels(q); b, _ = generate_heldout_labels(q)
        self.assertEqual(a, b)
        self.assertTrue(any(a[x] != q[i].relevant_ids for i, x in enumerate(a)))

    def test_metric_denominators_and_seed_validation(self):
        with tempfile.TemporaryDirectory() as d:
            run_heldout(Path(d) / "out", requests_per_scenario=1)
            with (Path(d) / "out" / "metrics.csv").open(newline="") as f:
                rows = list(csv.DictReader(f))
            self.assertEqual({int(r["queries"]) for r in rows}, {3})
            self.assertEqual({r["scenario"] for r in rows}, {"thin", "balanced", "dense"})
        with self.assertRaises(ValueError):
            run_heldout(Path(tempfile.gettempdir()) / "heldout-invalid", seeds=(11, 29, 47))

    def test_artifact_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d) / "out"
            run_heldout(out, requests_per_scenario=1)
            with self.assertRaises(FileExistsError):
                run_heldout(out, requests_per_scenario=1)

    def test_hard_gates_are_shared_and_unchanged(self):
        query = generate_dataset((101,), 1)[0]
        pipeline = run_candidate_pipeline(query.rider, query.drivers)
        expected = {x.driver_id for x in pipeline.feasibility_matrix if x.final_eligible}
        self.assertEqual(set(pipeline.eligible_ids), expected)
        # Ranking/labels cannot alter the gate decisions or the candidate pool.
        self.assertEqual(pipeline.retrieved_count, len(query.drivers))
        self.assertEqual(len(pipeline.feasibility_matrix), len(query.drivers))


if __name__ == "__main__":
    unittest.main()
