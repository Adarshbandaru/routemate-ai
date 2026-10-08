# RouteMate AI — Literature Review

## Review purpose and status
This is a targeted, source-reviewed foundation rather than a systematic review. The summaries below describe the cited works and their relevance; they are not independent replications or guarantees that a result transfers to RouteMate AI.

## Core sources

### Agatz, Erera, Savelsbergh & Wang (2012), “Optimization for dynamic ride-sharing: a review”
Source-reviewed reference: https://doi.org/10.1016/j.ejor.2012.05.028

The review organizes dynamic ride-sharing around demand/vehicle matching, routing, timing, and optimization challenges. It motivates explicit constraint definitions and baseline comparisons. RouteMate AI will record feasibility rules, objective weights, and solver assumptions instead of treating “matching” as a single metric.

### Santi et al. (2014), “Quantifying the benefits of vehicle pooling with shareability networks”
Source-reviewed reference: https://doi.org/10.1073/pnas.1403657111

The shareability-network framing represents compatible trips as graph relationships and studies pooling potential. It informs RouteMate AI’s candidate-edge and group-feasibility representations. Reported findings belong to the cited study and are not claims about a new network or local travel market.

### Alonso-Mora et al. (2017), “On-demand high-capacity ride-sharing via dynamic trip-vehicle assignment”
Source-reviewed reference: https://doi.org/10.1073/pnas.1611675114

The work combines feasible trip generation with dynamic assignment under vehicle capacity and operational constraints. It informs a staged pipeline (candidate generation, group feasibility, assignment) and the need to report computation as demand scales. Any performance figure must be independently reproduced before being attributed to RouteMate AI.

### Ma, Zheng & Wolfson (2013), “T-share”
Source-reviewed reference: https://doi.org/10.1109/ICDE.2013.6544843

T-share is relevant to spatiotemporal matching and scalable ride-share query processing. It motivates indexing and early pruning, while leaving RouteMate AI to validate behavior on its own network, constraints, and data.

## Data and design references
- OpenStreetMap data is available under its stated terms; attribution and applicable ODbL obligations must be checked before use: https://www.openstreetmap.org/copyright
- A design discussion used as a qualitative reference for avoiding generic or misleading “vibe-coded” product presentation: https://abhijayvuyyuru.substack.com/p/how-can-your-vibe-coded-website-not

## Gaps to address
The milestone should test robustness to uncertainty, cancellations, incomplete demand, subgroup burden, and explanation quality. Literature-derived methods are starting points, not evidence that a deployment is safe, fair, or beneficial.
