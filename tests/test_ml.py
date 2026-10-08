import csv, json, tempfile, unittest
from pathlib import Path
from routemate.ml import FEATURE_NAMES, LogisticRanker, run_classical_ml

class ClassicalMLTests(unittest.TestCase):
    def test_standardization_is_training_only(self):
        m=LogisticRanker(epochs=20).fit([[0]*7,[2]*7],[0,1])
        self.assertEqual(m.means,(1.0,)*7)
        self.assertEqual(m.scales,(1.0,)*7)
        self.assertEqual(len(m.predict_proba([[100]*7])),1)

    def test_deterministic_fit_and_ordering(self):
        x=[[0]*7,[1,0,0,0,0,0,0],[2,0,0,0,0,0,0]]; y=[0,1,1]
        a=LogisticRanker(epochs=40).fit(x,y); b=LogisticRanker(epochs=40).fit(x,y)
        self.assertEqual(a.weights,b.weights); self.assertEqual(a.rank(x,['a','b','c']),b.rank(x,['a','b','c']))

    def test_constant_label_fallback(self):
        m=LogisticRanker().fit([[1]*7,[3]*7],[1,1]); self.assertEqual(m.fallback,1); self.assertEqual(m.predict_proba([[0]*7]),[1.0])

    def test_width_and_metric_run(self):
        with self.assertRaises(ValueError): LogisticRanker().fit([[1,2]],[1])

    def test_cli_outputs_and_refuses_overwrite(self):
        with tempfile.TemporaryDirectory() as d:
            out=Path(d)/'outputs'; run_classical_ml(out)
            for name in ('manifest.json','metrics.csv','per_query.csv','timing.csv','synthetic_dataset.json'): self.assertTrue((out/name).exists())
            with self.assertRaises(FileExistsError): run_classical_ml(out)
            manifest=json.loads((out/'manifest.json').read_text()); self.assertEqual(manifest['test_seed'],303)
            with (out/'metrics.csv').open(newline='') as f:
                methods={r['method'] for r in csv.DictReader(f)}
            self.assertEqual(methods,{'ml_logistic','route_time','distance_destination'})

if __name__=='__main__': unittest.main()
