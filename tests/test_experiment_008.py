"""Unit tests for Experiment 008: Realistic Road-Network and Trajectory Validation."""
import tempfile
import unittest
from pathlib import Path

from routemate.road_network_validation import (
    CandidateTripFeatures,
    generate_sf_study_dataset,
    extract_candidate_pair_features,
    score_approach_a_geometric,
    score_approach_b_existing,
    score_approach_c_network_aware,
    score_ablation_geom_only,
    score_ablation_geom_plus_net_dist,
    score_ablation_geom_plus_net_time,
    score_ablation_full_network,
    run_road_network_validation_experiment,
    save_experiment_008_outputs,
)
from routemate.routing import NetworkGraphRouter, create_osm_sf_downtown_network


class TestExperiment008(unittest.TestCase):
    def setUp(self):
        self.network = create_osm_sf_downtown_network()
        self.router = NetworkGraphRouter(self.network, weight="duration")

    def test_osm_network_topology(self):
        self.assertEqual(len(self.network.nodes), 26)
        # Verify both connected main grid and isolated dock spur exist
        comps = self.network.connected_components()
        self.assertGreaterEqual(len(comps), 2)
        self.assertFalse(self.network.is_connected())

    def test_dataset_generation_determinism(self):
        d1, r1 = generate_sf_study_dataset(network=self.network, seed=42)
        d2, r2 = generate_sf_study_dataset(network=self.network, seed=42)
        self.assertEqual(len(d1), 10)
        self.assertEqual(len(r1), 25)
        self.assertEqual([d.journey_id for d in d1], [d.journey_id for d in d2])
        self.assertEqual([r.journey_id for r in r1], [r.journey_id for r in r2])
        for d in d1:
            self.assertTrue(d.verification.identity_verified)
            self.assertTrue(d.verification.vehicle_verified)
            self.assertEqual(d.verification.safety_flags, ())

    def test_feature_extraction_aligned_pair(self):
        drivers, riders = generate_sf_study_dataset(network=self.network, seed=42)
        # DRV-01 is Howard St eastbound (4th to Beale)
        # RID-01 is Howard St eastbound (3rd to 1st) -> should be reachable and aligned
        d01 = next(d for d in drivers if d.journey_id == "DRV-01")
        r01 = next(r for r in riders if r.journey_id == "RID-01")

        feat = extract_candidate_pair_features(d01, r01, self.network, self.router)
        self.assertIsInstance(feat, CandidateTripFeatures)
        self.assertTrue(feat.is_network_reachable)
        self.assertGreaterEqual(feat.direction_similarity, 0.9)
        self.assertLess(feat.road_detour_km, 1.0)
        self.assertTrue(feat.network_eligible)

    def test_feature_extraction_opposing_one_way_pair(self):
        drivers, riders = generate_sf_study_dataset(network=self.network, seed=42)
        # DRV-01 is Howard St eastbound
        # RID-14 is Howard St westbound (opposing one-way)
        d01 = next(d for d in drivers if d.journey_id == "DRV-01")
        r14 = next(r for r in riders if r.journey_id == "RID-14")

        feat = extract_candidate_pair_features(d01, r14, self.network, self.router)
        # Direction similarity should be near 0.0 for opposing directions
        self.assertLessEqual(feat.direction_similarity, 0.1)
        self.assertFalse(feat.network_eligible)

    def test_feature_extraction_dock_spur_disconnected(self):
        drivers, riders = generate_sf_study_dataset(network=self.network, seed=42)
        # DRV-01 is on Howard St
        # RID-21 is on isolated dock spur
        d01 = next(d for d in drivers if d.journey_id == "DRV-01")
        r21 = next(r for r in riders if r.journey_id == "RID-21")

        feat = extract_candidate_pair_features(d01, r21, self.network, self.router)
        self.assertFalse(feat.is_network_reachable)
        self.assertFalse(feat.network_eligible)

    def test_scoring_approaches(self):
        drivers, riders = generate_sf_study_dataset(network=self.network, seed=42)
        d01 = next(d for d in drivers if d.journey_id == "DRV-01")
        r01 = next(r for r in riders if r.journey_id == "RID-01")
        feat = extract_candidate_pair_features(d01, r01, self.network, self.router)

        sa = score_approach_a_geometric(feat)
        sb = score_approach_b_existing(feat)
        sc = score_approach_c_network_aware(feat)

        self.assertGreater(sa, 0.0)
        self.assertGreater(sb, 0.0)
        self.assertGreater(sc, 0.0)

    def test_experiment_end_to_end_and_serialization(self):
        report = run_road_network_validation_experiment(network=self.network, seed=42)
        self.assertEqual(report.total_pairs, 250)
        self.assertEqual(len(report.approach_metrics), 3)
        self.assertEqual(len(report.ablation_metrics), 4)

        da = report.disagreement_analysis
        self.assertGreater(da.total_candidate_pairs, 0)
        self.assertGreaterEqual(da.geometric_false_positives, 0)
        self.assertGreater(da.feasibility_disagreement_rate, 0.0)
        self.assertGreater(da.top1_rank_disagreement_rate, 0.0)

        # Test output persistence to temp dir
        with tempfile.TemporaryDirectory() as tmp_dir:
            out_path = Path(tmp_dir)
            res_p, met_p, man_p = save_experiment_008_outputs(report, out_path)
            self.assertTrue(res_p.exists())
            self.assertTrue(met_p.exists())
            self.assertTrue(man_p.exists())


if __name__ == "__main__":
    unittest.main()
