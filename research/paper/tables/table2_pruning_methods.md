# Table 2: Hybrid Candidate Pruning Performance (Experiment 009)

| Method | % Pruned | Routed Pairs | Feasible Recall | False Negatives | False Positives Rem. | Top-1 Match | Speedup |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **A No Pruning** | 0.0% | 450 | 1.000 | 0 | 443 | 100.0% | 462.46x |
| **B Fixed Euclidean** | 56.9% | 194 | 1.000 | 0 | 187 | 100.0% | 106.43x |
| **C Circuity Aware** | 97.8% | 10 | 0.143 | 6 | 9 | 86.7% | 161.95x |
| **D Two Stage Geometric** | 82.7% | 78 | 1.000 | 0 | 71 | 100.0% | 44.44x |
| **E Admissible Lower Bound** | 81.8% | 82 | 1.000 | 0 | 75 | 100.0% | 124.86x |
