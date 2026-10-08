"""Experiment 005: a small, deterministic classical ML ranking experiment.

The model and experiment intentionally use only the Python standard library.
Labels are held-out synthetic labels; they are never included in feature rows.
"""
import argparse, csv, hashlib, json, math, platform, sys
from pathlib import Path
from time import perf_counter

from .candidates import run_candidate_pipeline
from .experiment import evaluate
from .heldout import generate_heldout_labels
from .synthetic import DATASET_VERSION, SCENARIOS, generate_dataset

FEATURE_NAMES = ("pickup_distance_km", "destination_distance_km", "route_similarity",
                 "direction_similarity", "detour_km", "departure_difference_min",
                 "capacity_slack")
EXPERIMENT_VERSION = "classical-ml-ranking-v1"
MODEL_ARTIFACT_VERSION = "routemate-logistic-artifact-v1"

def _sigmoid(x):
    if x < -35: return 0.0
    if x > 35: return 1.0
    return 1.0 / (1.0 + math.exp(-x))

def pair_features(decision):
    """Return the documented, pre-match, non-sensitive feature vector."""
    f = decision.features
    return tuple(float(f[n]) if n != "capacity_slack" else float(decision.capacity_eligible and
        max(0, decision.features.get("capacity_slack", 0.0))) for n in FEATURE_NAMES)

def features_for_decision(decision, rider=None, driver=None):
    # Candidate features do not expose slack in the existing feature map.  The
    # pipeline decision has the capacity gate, so callers may provide journeys.
    f = decision.features
    slack = 0.0
    if driver is not None and rider is not None:
        slack = max(0, driver.vehicle.capacity - rider.seats_requested)
    return tuple(float(f[n]) for n in FEATURE_NAMES[:-1]) + (float(slack),)

class LogisticRanker:
    """L2 logistic regression trained with deterministic batch gradient descent."""
    def __init__(self, l2=1.0, learning_rate=0.15, epochs=500):
        self.l2, self.learning_rate, self.epochs = float(l2), float(learning_rate), int(epochs)
        self.means = self.scales = self.weights = None
        self.intercept = 0.0
        self.fallback = None
        self.n_iter = 0

    @property
    def feature_means(self):
        return self.means

    @property
    def feature_scales(self):
        return self.scales

    def _matrix(self, X):
        out = []
        for row in X:
            if isinstance(row, dict):
                if set(row) != set(FEATURE_NAMES):
                    raise ValueError("feature mapping keys do not match required features")
                out.append([float(row[n]) for n in FEATURE_NAMES])
            else: out.append([float(v) for v in row])
        if out and any(len(r) != len(FEATURE_NAMES) for r in out): raise ValueError("feature width mismatch")
        return out

    def fit(self, X, y):
        X, y = self._matrix(X), [int(v) for v in y]
        if len(X) != len(y) or not X: raise ValueError("X and y must be non-empty and equal length")
        if any(v not in (0, 1) for v in y): raise ValueError("labels must be binary")
        self.means = tuple(sum(r[j] for r in X) / len(X) for j in range(len(FEATURE_NAMES)))
        self.scales = tuple(math.sqrt(sum((r[j]-self.means[j])**2 for r in X)/len(X)) or 1.0 for j in range(len(FEATURE_NAMES)))
        Z = [[(r[j]-self.means[j])/self.scales[j] for j in range(len(FEATURE_NAMES))] for r in X]
        self.weights = [0.0] * len(FEATURE_NAMES); self.intercept = 0.0
        self.fallback = None
        if all(v == y[0] for v in y):
            self.fallback = int(y[0]); self.n_iter = 0; return self
        n = len(y)
        for epoch in range(self.epochs):
            probs = [_sigmoid(self.intercept + sum(w*x for w,x in zip(self.weights, row))) for row in Z]
            gi = sum(p-t for p,t in zip(probs,y)) / n
            gw = [sum((p-t)*row[j] for p,t,row in zip(probs,y,Z))/n + self.l2*w/n for j,w in enumerate(self.weights)]
            self.intercept -= self.learning_rate * gi
            self.weights = [w-self.learning_rate*g for w,g in zip(self.weights,gw)]
        self.n_iter = self.epochs
        return self

    def predict_proba(self, X):
        if self.means is None: raise ValueError("model is not fitted")
        rows = self._matrix(X)
        if self.fallback is not None: return [float(self.fallback) for _ in rows]
        return [_sigmoid(self.intercept + sum(w*((v-self.means[j])/self.scales[j]) for j,(w,v) in enumerate(zip(self.weights,row)))) for row in rows]

    def rank(self, X, ids=None):
        rows = self._matrix(X); probs = self.predict_proba(rows)
        ids = list(range(len(rows))) if ids is None else list(ids)
        if len(ids) != len(rows): raise ValueError("ids length mismatch")
        return tuple(x for _, x in sorted(zip(probs, ids), key=lambda z: (-z[0], str(z[1]))))

    def to_artifact_dict(self, metadata=None):
        if self.means is None or self.weights is None:
            raise ValueError("model is not fitted")
        values = {
            "artifact_version": MODEL_ARTIFACT_VERSION,
            "model_version": EXPERIMENT_VERSION,
            "features": list(FEATURE_NAMES),
            "hyperparameters": {"l2": self.l2, "learning_rate": self.learning_rate, "epochs": self.epochs},
            "means": list(self.means), "scales": list(self.scales),
            "weights": list(self.weights), "intercept": self.intercept,
            "fallback": self.fallback, "n_iter": self.n_iter,
            "warning": "Synthetic-label artifact; not production calibrated and not a safety model.",
        }
        if metadata:
            values["metadata"] = dict(metadata)
        return values

    def save(self, path, metadata=None):
        Path(path).write_text(json.dumps(self.to_artifact_dict(metadata), indent=2, sort_keys=True), encoding="utf-8")

    @classmethod
    def from_artifact_dict(cls, artifact):
        if not isinstance(artifact, dict) or artifact.get("artifact_version") != MODEL_ARTIFACT_VERSION:
            raise ValueError("unsupported or missing model artifact version")
        if artifact.get("features") != list(FEATURE_NAMES):
            raise ValueError("model feature order does not match runtime feature order")
        required = ("means", "scales", "weights", "intercept", "fallback", "n_iter", "hyperparameters")
        if any(key not in artifact for key in required):
            raise ValueError("incomplete model artifact")
        hp = artifact["hyperparameters"]
        model = cls(hp["l2"], hp["learning_rate"], hp["epochs"])
        arrays = [artifact["means"], artifact["scales"], artifact["weights"]]
        if any(not isinstance(x, list) or len(x) != len(FEATURE_NAMES) for x in arrays):
            raise ValueError("invalid model vector width")
        if any(not math.isfinite(float(x)) for arr in arrays + [[artifact["intercept"]]] for x in arr):
            raise ValueError("model artifact contains non-finite values")
        if any(float(x) <= 0 for x in artifact["scales"]):
            raise ValueError("model scales must be positive")
        if artifact["fallback"] not in (None, 0, 1):
            raise ValueError("invalid fallback")
        model.means = tuple(float(x) for x in artifact["means"])
        model.scales = tuple(float(x) for x in artifact["scales"])
        model.weights = [float(x) for x in artifact["weights"]]
        model.intercept = float(artifact["intercept"])
        model.fallback = artifact["fallback"]
        model.n_iter = int(artifact["n_iter"])
        return model

    @classmethod
    def load(cls, path):
        return cls.from_artifact_dict(json.loads(Path(path).read_text(encoding="utf-8")))

def _snapshot(j):
    return {"journey_id":j.journey_id,"start":{"latitude":j.start.latitude,"longitude":j.start.longitude},"destination":{"latitude":j.destination.latitude,"longitude":j.destination.longitude},"departure":j.departure.isoformat(),"route":[{"latitude":p.latitude,"longitude":p.longitude} for p in j.route],"vehicle":{"kind":j.vehicle.kind,"capacity":j.vehicle.capacity,"verified":j.vehicle.verified},"verification":{"identity_verified":j.verification.identity_verified,"vehicle_verified":j.verification.vehicle_verified,"safety_flags":list(j.verification.safety_flags)},"seats_requested":j.seats_requested}

def run_classical_ml(output, k=3, requests_per_scenario=20):
    out=Path(output)
    if out.exists() and any(out.iterdir()): raise FileExistsError("output directory must be absent or empty: "+str(out))
    out.mkdir(parents=True, exist_ok=True)
    train_q=generate_dataset((101,202), requests_per_scenario); test_q=generate_dataset((303,), requests_per_scenario)
    all_q=train_q+test_q; labels, details=generate_heldout_labels(all_q)
    train_X=[]; train_y=[]; train_pairs=0; test_pairs=0; train_start=perf_counter()
    pipelines={}
    for q in all_q:
        pipelines[q.query_id]=run_candidate_pipeline(q.rider,q.drivers)
        elig=[d for d in pipelines[q.query_id].feasibility_matrix if d.final_eligible]
        if q in train_q:
            byid={d.driver.journey_id:d for d in pipelines[q.query_id].retrieved_pairs}
            for d in elig:
                train_X.append(features_for_decision(d, q.rider, byid[d.driver_id].driver)); train_y.append(int(d.driver_id in labels[q.query_id]))
            train_pairs += len(elig)
        else: test_pairs += len(elig)
    model=LogisticRanker(); model.fit(train_X,train_y); training_seconds=perf_counter()-train_start
    rows=[]; timing=[]
    for q in test_q:
        pipe=pipelines[q.query_id]; elig=[d for d in pipe.feasibility_matrix if d.final_eligible]; byid={d.driver_id:d for d in elig}
        X=[features_for_decision(d,q.rider,next(x.driver for x in pipe.retrieved_pairs if x.driver_id==d.driver_id)) for d in elig]
        ids=[d.driver_id for d in elig]; start=perf_counter(); ranking=model.rank(X,ids); model_seconds=perf_counter()-start
        for method, ranking2 in (("ml_logistic",ranking),("route_time",tuple(d.driver_id for d in sorted(elig,key=lambda d:(-d.score,d.driver_id)))),("distance_destination",tuple(d.driver_id for d in sorted(elig,key=lambda d:(d.features['pickup_distance_km']+d.features['destination_distance_km'],d.driver_id))))):
            m=evaluate(ranking2,labels[q.query_id],pipe.retrieved_count,len(elig),k)
            rows.append({"query_id":q.query_id,"seed":q.seed,"scenario":q.scenario,"method":method,"ranking":json.dumps(ranking2),"train_pair_count":train_pairs,"test_pair_count":test_pairs,"pre_filter_heldout_relevant_count":len(labels[q.query_id]),"relevant_lost_to_hard_filter":m["relevant_lost_to_filter"],**m})
            timing.append({"query_id":q.query_id,"scenario":q.scenario,"method":method,"candidate_generation_seconds":pipe.retrieval_seconds+pipe.feature_seconds+pipe.filtering_seconds,"model_ranking_seconds":model_seconds if method=="ml_logistic" else "","training_seconds":training_seconds if method=="ml_logistic" else ""})
    aggregates=[]
    for scenario,method in sorted({(r['scenario'],r['method']) for r in rows}):
        g=[r for r in rows if r['scenario']==scenario and r['method']==method]; a={'scenario':scenario,'method':method,'queries':len(g),'train_pair_count':train_pairs,'test_pair_count':test_pairs}
        for key in ('precision_at_k','recall_at_k','ndcg_at_k','coverage','relevant_lost_to_filter'):
            vals=[r[key] for r in g if r[key] is not None]; a[key+'_mean']=sum(vals)/len(vals) if vals else None
        tg=[t for t in timing if t['scenario']==scenario and t['method']==method]
        for key, name in (('candidate_generation_seconds','candidate_generation_seconds_mean'),('model_ranking_seconds','model_ranking_seconds_mean'),('training_seconds','training_seconds_mean')):
            vals=[float(t[key]) for t in tg if t[key] != '']; a[name]=sum(vals)/len(vals) if vals else None
        a['relevant_lost_to_hard_filter_mean']=a['relevant_lost_to_filter_mean']
        aggregates.append(a)
    artifact_path = out / 'model.json'
    model.save(artifact_path, {"train_seeds": [101, 202], "test_seed": 303,
                               "evidence_class": "synthetic_only"})
    snap=[{'query_id':q.query_id,'seed':q.seed,'scenario':q.scenario,'rider':_snapshot(q.rider),'drivers':[_snapshot(d) for d in q.drivers],'heldout_relevant_ids':list(labels[q.query_id])} for q in all_q]
    data=json.dumps(snap,sort_keys=True,indent=2).encode(); (out/'synthetic_dataset.json').write_bytes(data)
    root=Path(__file__).resolve().parents[2]; source_files=['src/routemate/ml.py','src/routemate/heldout.py','src/routemate/synthetic.py','src/routemate/candidates.py','src/routemate/experiment.py']
    manifest={'experiment_version':EXPERIMENT_VERSION,'model_artifact_version':MODEL_ARTIFACT_VERSION,'model_artifact':'model.json','dataset_version':DATASET_VERSION,'train_seeds':[101,202],'test_seed':303,'scenarios':list(SCENARIOS),'requests_per_scenario':requests_per_scenario,'k':k,'features':list(FEATURE_NAMES),'hyperparameters':{'l2':model.l2,'learning_rate':model.learning_rate,'epochs':model.epochs},'fallback':model.fallback,'train_pair_count':train_pairs,'test_pair_count':test_pairs,'code_sha256':{n:hashlib.sha256((root/n).read_bytes()).hexdigest() for n in source_files},'synthetic_dataset_sha256':hashlib.sha256(data).hexdigest(),'python':sys.version,'platform':platform.platform(),'privacy':'synthetic data only; no private environment variables'}
    (out/'manifest.json').write_text(json.dumps(manifest,indent=2,sort_keys=True),encoding='utf-8')
    def write(name, vals):
        with (out/name).open('w',newline='',encoding='utf-8') as f: w=csv.DictWriter(f,fieldnames=list(vals[0])); w.writeheader(); w.writerows(vals)
    write('per_query.csv',rows); write('metrics.csv',aggregates); write('timing.csv',timing); return manifest

def main(argv=None):
    p=argparse.ArgumentParser(); p.add_argument('--output',required=True); args=p.parse_args(argv); run_classical_ml(args.output)
if __name__=='__main__': main()

# Naming parallel to the earlier experiment modules.
run_experiment = run_classical_ml
