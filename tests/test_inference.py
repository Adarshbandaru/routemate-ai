import json, tempfile, unittest
from pathlib import Path
from routemate.ml import LogisticRanker, FEATURE_NAMES, MODEL_ARTIFACT_VERSION
from routemate.inference import predict_feature_rows, rank_eligible_feature_rows

def rows():
    return [{name: float(i + j) for j, name in enumerate(FEATURE_NAMES)} for i in (0, 1, 2)]

class InferenceTests(unittest.TestCase):
    def test_round_trip(self):
        model = LogisticRanker(epochs=20).fit(rows(), [0, 1, 1])
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "model.json"; model.save(path)
            loaded = LogisticRanker.load(path)
            self.assertEqual(model.predict_proba(rows()), loaded.predict_proba(rows()))
            self.assertEqual(model.rank(rows(), ["b", "a", "c"]), rank_eligible_feature_rows(path, rows(), ["b", "a", "c"]))

    def test_schema_rejection(self):
        model = LogisticRanker().fit(rows(), [0, 1, 1])
        artifact = model.to_artifact_dict(); artifact["artifact_version"] = "bad"
        with self.assertRaises(ValueError): LogisticRanker.from_artifact_dict(artifact)
        artifact = model.to_artifact_dict(); artifact["features"] = list(reversed(FEATURE_NAMES))
        with self.assertRaises(ValueError): LogisticRanker.from_artifact_dict(artifact)

    def test_deterministic_ties_and_predictions(self):
        model = LogisticRanker().fit(rows(), [1, 1, 1])
        self.assertEqual(model.rank(rows(), ["z", "a", "m"]), ("a", "m", "z"))
        self.assertEqual(model.predict_proba(rows()), [1.0, 1.0, 1.0])

    def test_inference_requires_feature_width(self):
        model = LogisticRanker().fit(rows(), [0, 1, 1])
        with tempfile.TemporaryDirectory() as d:
            path = Path(d) / "model.json"; model.save(path)
            with self.assertRaises(ValueError): predict_feature_rows(path, [{"bad": 1}])

if __name__ == "__main__": unittest.main()
