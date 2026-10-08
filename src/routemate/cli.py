from .sample import simulated_journeys
from .scoring import compatibility_score

def main():
    driver, rider = simulated_journeys()
    result = compatibility_score(driver, rider)
    print("SIMULATED DATA ONLY (not real users; score is not a probability)")
    print(f"journeys: {driver.journey_id} + {rider.journey_id}")
    print(f"heuristic compatibility score: {result.score}/100")
    print(f"compatible: {result.compatible}")
    for key, value in result.features.items(): print(f"  {key}: {value:.3f}")
    print("explanations:")
    for item in result.explanations: print(f"  - {item}")

if __name__ == "__main__": main()
