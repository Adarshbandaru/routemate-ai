# Table 5: Rolling-Horizon Fleet Dispatch Performance (Experiment 013)

| Demand Regime | Policy | Fulfillment % | Cancel % | Pooling % | Wait Time (p50 / p95) | Fleet VKT (km) | In-Flight Insertions | Solver Latency (ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Balanced** | Static Batch | 92.7% | 1.8% | 0.0% | 169s / 350s | 127.8 | 0 | 2.87 |
| **Balanced** | Periodic Rolling | 90.9% | 1.8% | 100.0% | 173s / 302s | 53.3 | 34 | 2.10 |
| **Balanced** | Event Driven Rolling | 92.7% | 3.6% | 100.0% | 103s / 251s | 50.5 | 36 | 0.99 |
| **High** | Static Batch | 88.6% | 4.4% | 0.0% | 199s / 392s | 259.1 | 0 | 5.98 |
| **High** | Periodic Rolling | 88.6% | 2.6% | 100.0% | 145s / 274s | 93.7 | 76 | 3.17 |
| **High** | Event Driven Rolling | 90.4% | 3.5% | 100.0% | 140s / 301s | 72.7 | 88 | 0.89 |
| **Low** | Static Batch | 87.5% | 8.3% | 0.0% | 167s / 264s | 62.2 | 0 | 0.83 |
| **Low** | Periodic Rolling | 83.3% | 8.3% | 70.0% | 146s / 257s | 41.7 | 7 | 0.56 |
| **Low** | Event Driven Rolling | 87.5% | 8.3% | 100.0% | 127s / 246s | 34.8 | 11 | 0.99 |
