# Table 4: Dynamic Recourse & Incident Recovery Outcomes (Experiment 012)

| Scenario | Policy | Perturbation | Feasibility % | Mean Objective | Mean Detour (km) | Duration (s) | Recourse Latency (ms) | Regret vs Oracle |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **1 Static Nominal** | Static | none | 100.0% | 86.60 | 2.259 | 323.6 | --- | --- |
| **2 Static Dwell** | Static | dwell | 100.0% | 82.61 | 2.259 | 484.5 | --- | --- |
| **3 Static Incident** | Static | incident | 60.0% | 52.23 | 1.307 | 218.5 | --- | 33.43 |
| **4 Static Dwell Incident** | Static | dwell+incident | 60.0% | 49.80 | 1.307 | 350.7 | --- | 35.86 |
| **5 Recourse Incident** | Recourse | incident | 100.0% | 84.61 | 2.569 | 362.4 | 4.17 | 1.06 |
| **6 Recourse Dwell Incident** | Recourse | dwell+incident | 100.0% | 80.24 | 2.569 | 537.8 | 3.52 | 5.42 |
