/**
 * Synthetic data generation mirroring the Python routemate.synthetic module.
 * Produces rider/driver journeys in equatorial corridor coordinates.
 */

// Deterministic seeded PRNG (mulberry32)
function mulberry32(seed) {
  let s = seed | 0;
  return function () {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Simple string-to-seed hash
function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h >>> 0;
}

function seededRng(label) {
  return mulberry32(hashSeed(label));
}

function coordFromKm(x, y) {
  return { latitude: y / 111.195, longitude: x / 111.195 };
}

function coordToLatLng(c) {
  return [c.latitude, c.longitude];
}

const EARTH_R = 6371.0088;

function haversineKm(a, b) {
  const toRad = (d) => (d * Math.PI) / 180;
  const p1 = toRad(a.latitude), p2 = toRad(b.latitude);
  const h =
    Math.sin((p2 - p1) / 2) ** 2 +
    Math.cos(p1) * Math.cos(p2) * Math.sin(toRad(b.longitude - a.longitude) / 2) ** 2;
  return 2 * EARTH_R * Math.asin(Math.sqrt(Math.max(0, Math.min(1, h))));
}

function polylineLength(route) {
  let d = 0;
  for (let i = 1; i < route.length; i++) d += haversineKm(route[i - 1], route[i]);
  return d;
}

function directionSimilarity(a, b, c, d) {
  const toRad = (x) => (x * Math.PI) / 180;
  function bearing(x, y) {
    const p1 = toRad(x.latitude), p2 = toRad(y.latitude);
    const dl = toRad(y.longitude - x.longitude);
    return Math.atan2(Math.sin(dl) * Math.cos(p2), Math.cos(p1) * Math.sin(p2) - Math.sin(p1) * Math.cos(p2) * Math.cos(dl));
  }
  const delta = ((bearing(a, b) - bearing(c, d) + Math.PI) % (2 * Math.PI)) - Math.PI;
  return Math.max(0, Math.min(1, (1 + Math.cos(delta)) / 2));
}

function routeSimilarity(routeA, routeB, tolerance = 0.5) {
  function fraction(x, y) {
    let count = 0;
    for (const p of x) {
      let minDist = Infinity;
      for (let i = 0; i < y.length - 1; i++) {
        minDist = Math.min(minDist, haversineKm(p, y[i]));
      }
      if (minDist <= tolerance + 1e-10) count++;
    }
    return count / x.length;
  }
  return (fraction(routeA, routeB) + fraction(routeB, routeA)) / 2;
}

function orderedInsertionDetour(route, pickup, dropoff) {
  let best = Infinity, prior = Infinity;
  const between = haversineKm(pickup, dropoff);
  for (let i = 0; i < route.length - 1; i++) {
    const a = route[i], b = route[i + 1];
    const edge = haversineKm(a, b);
    const pc = Math.max(0, haversineKm(a, pickup) + haversineKm(pickup, b) - edge);
    const dc = Math.max(0, haversineKm(a, dropoff) + haversineKm(dropoff, b) - edge);
    const same = Math.max(0, haversineKm(a, pickup) + between + haversineKm(dropoff, b) - edge);
    best = Math.min(best, same, prior + dc);
    prior = Math.min(prior, pc);
  }
  return best;
}

function calculateFeatures(driver, rider) {
  const pickup = haversineKm(driver.start, rider.start);
  const destination = haversineKm(driver.destination, rider.destination);
  const overlap = routeSimilarity(driver.route, rider.route, 0.5);
  const direction = directionSimilarity(driver.route[0], driver.route[driver.route.length - 1], rider.route[0], rider.route[rider.route.length - 1]);
  const base = polylineLength(driver.route);
  const detour = orderedInsertionDetour(driver.route, rider.start, rider.destination);
  const depDiff = Math.abs(driver.departure - rider.departure) / 60000; // ms to min
  return {
    pickup_distance_km: pickup,
    destination_distance_km: destination,
    route_similarity: overlap,
    direction_similarity: direction,
    driver_route_km: base,
    detour_km: detour,
    departure_difference_min: depDiff,
  };
}

const MAXIMUMS = { pickup_distance_km: 2, destination_distance_km: 3, detour_km: 5, departure_difference_min: 30 };
const WEIGHTS = { pickup_distance_km: 0.25, destination_distance_km: 0.2, route_similarity: 0.25, direction_similarity: 0.1, detour_km: 0.1, departure_difference_min: 0.1 };

function computeScore(features) {
  let raw = 0;
  for (const [key, w] of Object.entries(WEIGHTS)) {
    const n = key in MAXIMUMS ? Math.max(0, 1 - features[key] / MAXIMUMS[key]) : features[key];
    raw += 100 * w * n;
  }
  return Math.round(raw * 100) / 100;
}

function evaluateFeasibility(driver, rider, features) {
  const reasons = [];
  const checks = {
    route_direction_compatible: features.direction_similarity > 0.5,
    pickup_distance_eligible: features.pickup_distance_km <= 2.0,
    destination_distance_eligible: features.destination_distance_km <= 3.0,
    departure_time_eligible: features.departure_difference_min <= 30,
    detour_eligible: features.detour_km <= 5.0,
    identity_verification: driver.identity_verified && rider.identity_verified,
    vehicle_verification: driver.vehicle_verified,
    capacity_eligible: driver.capacity >= rider.seats_requested,
  };

  const checkDescriptions = {
    route_direction_compatible: 'direction incompatibility',
    pickup_distance_eligible: 'pickup distance exceeds 2 km',
    destination_distance_eligible: 'destination distance exceeds 3 km',
    departure_time_eligible: 'departure difference exceeds 30 min',
    detour_eligible: 'detour exceeds 5 km',
    identity_verification: 'identity verification failed',
    vehicle_verification: 'vehicle verification failed',
    capacity_eligible: 'insufficient vehicle capacity',
  };

  for (const [key, passed] of Object.entries(checks)) {
    if (!passed) reasons.push(checkDescriptions[key]);
  }

  if (driver.safety_flags?.length || rider.safety_flags?.length) {
    reasons.push('safety flags present');
  }

  const score = computeScore(features);
  return {
    driver_id: driver.journey_id,
    rider_id: rider.journey_id,
    ...checks,
    final_eligible: reasons.length === 0,
    features,
    rejection_reasons: reasons,
    score,
  };
}

export function generateSyntheticScenario(seed = 42, driverCount = 12) {
  const geoRng = seededRng(`geometry:${seed}:demo`);
  const labelRng = seededRng(`labels:${seed}:demo`);

  const riderRoute = [0, 2, 4, 6, 8].map((x) => coordFromKm(x, 0));
  const departure = new Date('2026-01-01T08:00:00Z');
  const rider = {
    journey_id: `rider-${seed}`,
    start: riderRoute[0],
    destination: riderRoute[riderRoute.length - 1],
    departure: departure.getTime(),
    route: riderRoute,
    capacity: 0,
    identity_verified: true,
    vehicle_verified: false,
    safety_flags: [],
    seats_requested: 1,
  };

  const drivers = [];
  const distanceTolerance = labelRng() * 2.15 + 0.35;
  const timeTolerance = labelRng() * 30 + 5;

  for (let i = 0; i < driverCount; i++) {
    const y0 = geoRng() * 2.4 - 1.2;
    const y1 = geoRng() * 3.0 - 1.5;
    const minutes = geoRng() * 50 - 25;
    const mode = i % 12;
    const reverse = mode === 6;
    const identity = mode !== 9;
    const vehicle = mode !== 10;
    const capacity = mode === 11 ? 0 : 2;

    let driverRoute = [0, 2, 4, 6, 8].map((x) => coordFromKm(x, y0 + ((y1 - y0) * x) / 8));
    if (reverse) driverRoute = [...driverRoute].reverse();

    const driverDeparture = new Date(departure.getTime() + minutes * 60000);
    const did = `driver-${seed}-${String(i).padStart(3, '0')}`;

    // Label (synthetic preference)
    let probability = 0.05 + 0.9 * Math.exp(-0.5 * ((Math.abs(y0) + Math.abs(y1)) / distanceTolerance + Math.abs(minutes) / timeTolerance));
    if (reverse) probability *= 0.15;
    const draw = labelRng();
    const relevant = draw < probability;

    drivers.push({
      journey_id: did,
      start: driverRoute[0],
      destination: driverRoute[driverRoute.length - 1],
      departure: driverDeparture.getTime(),
      route: driverRoute,
      capacity,
      identity_verified: identity,
      vehicle_verified: vehicle,
      safety_flags: [],
      seats_requested: 0,
      y0, y1, minutes, mode, reverse,
      relevant,
      label_probability: probability,
    });
  }

  return { rider, drivers };
}

export function runMatchingPipeline(rider, drivers) {
  const results = drivers.map((driver) => {
    const features = calculateFeatures(driver, rider);
    return evaluateFeasibility(driver, rider, features);
  });

  const eligible = results.filter((r) => r.final_eligible).sort((a, b) => b.score - a.score || a.driver_id.localeCompare(b.driver_id));
  const rejected = results.filter((r) => !r.final_eligible);

  return {
    all: results,
    eligible,
    rejected,
    stats: {
      total: results.length,
      eligible_count: eligible.length,
      rejected_count: rejected.length,
      match_rate: results.length ? eligible.length / results.length : 0,
      avg_score: eligible.length ? eligible.reduce((s, r) => s + r.score, 0) / eligible.length : 0,
      top_score: eligible.length ? eligible[0].score : 0,
    },
  };
}

export function coordToLL(c) {
  return coordToLatLng(c);
}

export { haversineKm, polylineLength };

/* =============================================
   BATCH ASSIGNMENT SIMULATOR
   ============================================= */

export function generateBatchScenario(seed = 42, riderCount = 6, driverCount = 10) {
  const rng = seededRng(`batch:${seed}:multi`);
  const departure = new Date('2026-01-01T08:00:00Z');

  const riders = [];
  for (let i = 0; i < riderCount; i++) {
    const sx = rng() * 2;
    const sy = rng() * 1.6 - 0.8;
    const dx = sx + 4 + rng() * 4;
    const dy = sy + rng() * 1.2 - 0.6;
    const mins = rng() * 30 - 15;
    const route = [0, 0.25, 0.5, 0.75, 1].map((t) =>
      coordFromKm(sx + (dx - sx) * t, sy + (dy - sy) * t)
    );
    riders.push({
      journey_id: `rider-${seed}-${String(i).padStart(2, '0')}`,
      start: route[0],
      destination: route[route.length - 1],
      departure: departure.getTime() + mins * 60000,
      route,
      capacity: 0,
      identity_verified: true,
      vehicle_verified: false,
      safety_flags: [],
      seats_requested: 1,
    });
  }

  const drivers = [];
  for (let j = 0; j < driverCount; j++) {
    const sx = rng() * 2;
    const sy = rng() * 2.0 - 1.0;
    const dx = sx + 4 + rng() * 4;
    const dy = sy + rng() * 1.6 - 0.8;
    const mins = rng() * 40 - 20;
    const cap = j % 5 === 0 ? 1 : j % 3 === 0 ? 3 : 2;
    const route = [0, 0.25, 0.5, 0.75, 1].map((t) =>
      coordFromKm(sx + (dx - sx) * t, sy + (dy - sy) * t)
    );
    drivers.push({
      journey_id: `driver-${seed}-${String(j).padStart(2, '0')}`,
      start: route[0],
      destination: route[route.length - 1],
      departure: departure.getTime() + mins * 60000,
      route,
      capacity: cap,
      identity_verified: true,
      vehicle_verified: true,
      safety_flags: [],
      seats_requested: 0,
    });
  }

  return { riders, drivers };
}

export function runBatchAssignment(riders, drivers, method = 'greedy') {
  const t0 = performance.now();

  // Build feasibility graph
  const edges = [];
  let totalPairs = 0;
  for (const rider of riders) {
    for (const driver of drivers) {
      totalPairs++;
      const features = calculateFeatures(driver, rider);
      const decision = evaluateFeasibility(driver, rider, features);
      if (decision.final_eligible) {
        edges.push({
          driver_id: driver.journey_id,
          rider_id: rider.journey_id,
          score: decision.score,
          features,
          decision,
        });
      }
    }
  }
  edges.sort((a, b) => b.score - a.score || a.driver_id.localeCompare(b.driver_id) || a.rider_id.localeCompare(b.rider_id));

  const graphMs = performance.now() - t0;
  const t1 = performance.now();

  const driverMap = Object.fromEntries(drivers.map((d) => [d.journey_id, d]));
  const riderMap = Object.fromEntries(riders.map((r) => [r.journey_id, r]));

  let assignments;
  if (method === 'greedy') {
    assignments = solveGreedy(edges, riderMap, driverMap);
  } else if (method === 'optimal') {
    assignments = solveOptimal(edges, riderMap, driverMap);
  } else {
    assignments = solveAuction(edges, riderMap, driverMap);
  }

  const solveMs = performance.now() - t1;

  const assignedRiders = new Set();
  const usedDrivers = new Set();
  for (const group of assignments) {
    usedDrivers.add(group.driver_id);
    for (const rid of group.rider_ids) assignedRiders.add(rid);
  }

  return {
    method,
    groups: assignments,
    edges,
    totalPairs,
    feasibleEdges: edges.length,
    matchedRiders: assignedRiders.size,
    matchedDrivers: usedDrivers.size,
    unmatchedRiders: riders.filter((r) => !assignedRiders.has(r.journey_id)).map((r) => r.journey_id),
    unmatchedDrivers: drivers.filter((d) => !usedDrivers.has(d.journey_id)).map((d) => d.journey_id),
    objectiveValue: assignments.reduce((s, g) => s + g.groupScore, 0),
    graphMs: Math.round(graphMs * 100) / 100,
    solveMs: Math.round(solveMs * 100) / 100,
    totalMs: Math.round((graphMs + solveMs) * 100) / 100,
  };
}

function solveGreedy(edges, riderMap, driverMap) {
  const done = new Set();
  const groups = {};
  const seats = {};
  const scores = {};

  for (const e of edges) {
    if (done.has(e.rider_id)) continue;
    const used = seats[e.driver_id] || 0;
    const riderSeats = riderMap[e.rider_id].seats_requested;
    const driverCap = driverMap[e.driver_id].capacity;
    if (used + riderSeats <= driverCap) {
      done.add(e.rider_id);
      if (!groups[e.driver_id]) groups[e.driver_id] = [];
      groups[e.driver_id].push(e.rider_id);
      seats[e.driver_id] = used + riderSeats;
      scores[e.driver_id] = (scores[e.driver_id] || 0) + e.score;
    }
  }

  return Object.entries(groups).map(([did, rids]) => ({
    driver_id: did,
    rider_ids: rids.sort(),
    seatsUsed: seats[did],
    remainingCapacity: driverMap[did].capacity - seats[did],
    groupScore: Math.round((scores[did] || 0) * 100) / 100,
  }));
}

function solveAuction(edges, riderMap, driverMap) {
  const edgeLookup = {};
  const edgesByRider = {};
  for (const e of edges) {
    edgeLookup[`${e.driver_id}:${e.rider_id}`] = e;
    if (!edgesByRider[e.rider_id]) edgesByRider[e.rider_id] = [];
    edgesByRider[e.rider_id].push(e);
  }

  // Greedy init
  const r2d = {};
  const dr = {};
  const ds = {};
  for (const e of edges) {
    if (r2d[e.rider_id]) continue;
    const used = ds[e.driver_id] || 0;
    if (used + riderMap[e.rider_id].seats_requested <= driverMap[e.driver_id].capacity) {
      r2d[e.rider_id] = e.driver_id;
      if (!dr[e.driver_id]) dr[e.driver_id] = [];
      dr[e.driver_id].push(e.rider_id);
      ds[e.driver_id] = used + riderMap[e.rider_id].seats_requested;
    }
  }

  // Swap improvement
  for (let round = 0; round < 50; round++) {
    let improved = false;

    // Phase 1: place unmatched
    for (const rid of Object.keys(riderMap)) {
      if (r2d[rid]) continue;
      let best = null;
      for (const e of edgesByRider[rid] || []) {
        const used = ds[e.driver_id] || 0;
        if (used + riderMap[rid].seats_requested <= driverMap[e.driver_id].capacity) {
          if (!best || e.score > best.score) best = e;
        }
      }
      if (best) {
        r2d[rid] = best.driver_id;
        if (!dr[best.driver_id]) dr[best.driver_id] = [];
        dr[best.driver_id].push(rid);
        ds[best.driver_id] = (ds[best.driver_id] || 0) + riderMap[rid].seats_requested;
        improved = true;
      }
    }

    // Phase 2: swap
    for (const rid of Object.keys(r2d)) {
      const cur = r2d[rid];
      const curEdge = edgeLookup[`${cur}:${rid}`];
      const curScore = curEdge ? curEdge.score : 0;
      for (const e of edgesByRider[rid] || []) {
        if (e.driver_id === cur) continue;
        const newUsed = ds[e.driver_id] || 0;
        if (newUsed + riderMap[rid].seats_requested <= driverMap[e.driver_id].capacity && e.score > curScore + 0.01) {
          dr[cur] = dr[cur].filter((r) => r !== rid);
          ds[cur] -= riderMap[rid].seats_requested;
          if (!dr[cur].length) { delete dr[cur]; delete ds[cur]; }
          r2d[rid] = e.driver_id;
          if (!dr[e.driver_id]) dr[e.driver_id] = [];
          dr[e.driver_id].push(rid);
          ds[e.driver_id] = newUsed + riderMap[rid].seats_requested;
          improved = true;
          break;
        }
      }
    }

    if (!improved) break;
  }

  return Object.entries(dr).map(([did, rids]) => {
    const sc = rids.reduce((s, r) => s + (edgeLookup[`${did}:${r}`]?.score || 0), 0);
    return {
      driver_id: did,
      rider_ids: rids.sort(),
      seatsUsed: ds[did] || 0,
      remainingCapacity: driverMap[did].capacity - (ds[did] || 0),
      groupScore: Math.round(sc * 100) / 100,
    };
  });
}

function solveOptimal(edges, riderMap, driverMap, timeoutMs = 2000) {
  const started = performance.now();
  const riderList = Object.values(riderMap);
  const driverList = Object.values(driverMap);

  // Group feasible edges by rider_id, sorted by descending score
  const riderEdges = {};
  for (const r of riderList) riderEdges[r.journey_id] = [];
  for (const e of edges) {
    if (riderEdges[e.rider_id]) riderEdges[e.rider_id].push(e);
  }
  for (const rid of Object.keys(riderEdges)) {
    riderEdges[rid].sort((a, b) => b.score - a.score);
  }

  const sortedRiders = [...riderList].sort((a, b) => {
    const scoreA = riderEdges[a.journey_id]?.[0]?.score || 0;
    const scoreB = riderEdges[b.journey_id]?.[0]?.score || 0;
    return scoreB - scoreA;
  });

  const maxScores = sortedRiders.map((r) => riderEdges[r.journey_id]?.[0]?.score || 0);
  const suffixUpperBounds = new Float64Array(sortedRiders.length + 1);
  for (let i = sortedRiders.length - 1; i >= 0; i--) {
    suffixUpperBounds[i] = suffixUpperBounds[i + 1] + maxScores[i];
  }

  // Initial greedy bound
  const greedyGroups = solveGreedy(edges, riderMap, driverMap);
  let bestScore = greedyGroups.reduce((acc, g) => acc + g.groupScore, 0);
  let bestAsgn = {};
  let bestSeats = {};
  let bestScores = {};
  for (const g of greedyGroups) {
    bestAsgn[g.driver_id] = [...g.rider_ids];
    bestSeats[g.driver_id] = g.seatsUsed;
    bestScores[g.driver_id] = g.groupScore;
  }

  const curAsgn = {};
  const curSeats = {};
  const curScores = {};
  for (const d of driverList) {
    curAsgn[d.journey_id] = [];
    curSeats[d.journey_id] = 0;
    curScores[d.journey_id] = 0;
  }

  const deadline = started + timeoutMs;
  let iterations = 0;

  function branch(idx, curTotalScore) {
    iterations++;
    if (iterations % 500 === 0 && performance.now() > deadline) return;

    if (idx === sortedRiders.length) {
      if (curTotalScore > bestScore + 1e-6) {
        bestScore = curTotalScore;
        bestAsgn = {};
        bestSeats = { ...curSeats };
        bestScores = { ...curScores };
        for (const [did, rids] of Object.entries(curAsgn)) {
          if (rids.length) bestAsgn[did] = [...rids];
        }
      }
      return;
    }

    if (curTotalScore + suffixUpperBounds[idx] <= bestScore + 1e-6) {
      return;
    }

    const rider = sortedRiders[idx];
    const rid = rider.journey_id;
    const reqSeats = rider.seats_requested;

    for (const e of riderEdges[rid] || []) {
      const did = e.driver_id;
      const cap = driverMap[did]?.capacity || 0;
      if (curSeats[did] + reqSeats <= cap) {
        curAsgn[did].push(rid);
        curSeats[did] += reqSeats;
        curScores[did] += e.score;

        branch(idx + 1, curTotalScore + e.score);

        curScores[did] -= e.score;
        curSeats[did] -= reqSeats;
        curAsgn[did].pop();
      }
    }

    // Branch leaving rider unmatched
    branch(idx + 1, curTotalScore);
  }

  branch(0, 0);

  return Object.entries(bestAsgn).map(([did, rids]) => ({
    driver_id: did,
    rider_ids: rids.sort(),
    seatsUsed: bestSeats[did] || 0,
    remainingCapacity: (driverMap[did]?.capacity || 0) - (bestSeats[did] || 0),
    groupScore: Math.round((bestScores[did] || 0) * 100) / 100,
  }));
}


/* =============================================
   API CLIENT
   ============================================= */

export async function callMatchAPI(baseUrl, rider, drivers, topK = 3) {
  function journeyToApi(j) {
    return {
      journey_id: j.journey_id,
      start: j.start,
      destination: j.destination,
      departure: new Date(j.departure).toISOString(),
      route: j.route,
      vehicle: { kind: 'car', capacity: j.capacity, verified: j.vehicle_verified },
      verification: {
        identity_verified: j.identity_verified,
        vehicle_verified: j.vehicle_verified,
        safety_flags: j.safety_flags || [],
      },
      seats_requested: j.seats_requested,
    };
  }

  const res = await fetch(`${baseUrl}/v1/matches`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      rider: journeyToApi(rider),
      drivers: drivers.map((d) => journeyToApi(d)),
      top_k: topK,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function callBatchAPI(baseUrl, riders, drivers, method = 'greedy') {
  function journeyToApi(j) {
    return {
      journey_id: j.journey_id,
      start: j.start,
      destination: j.destination,
      departure: new Date(j.departure).toISOString(),
      route: j.route,
      vehicle: { kind: 'car', capacity: j.capacity, verified: j.vehicle_verified },
      verification: {
        identity_verified: j.identity_verified,
        vehicle_verified: j.vehicle_verified,
        safety_flags: j.safety_flags || [],
      },
      seats_requested: j.seats_requested,
    };
  }

  const res = await fetch(`${baseUrl}/v1/assignments`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      riders: riders.map((r) => journeyToApi(r)),
      drivers: drivers.map((d) => journeyToApi(d)),
      method,
    }),
  });

  if (!res.ok) {
    const error = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(error.detail || error.error || `HTTP ${res.status}`);
  }

  return res.json();
}

export async function checkAPIHealth(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(3000) });
    if (!res.ok) return { online: false, error: `HTTP ${res.status}` };
    const data = await res.json();
    return { online: true, ...data };
  } catch (e) {
    return { online: false, error: e.message };
  }
}


/* =============================================
   EXPORT UTILITIES
   ============================================= */

export function exportToCSV(data, filename) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const csv = [
    keys.join(','),
    ...data.map((row) => keys.map((k) => {
      const v = row[k];
      if (typeof v === 'object') return JSON.stringify(v);
      if (typeof v === 'string' && v.includes(',')) return `"${v}"`;
      return v;
    }).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function exportToJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}


// Experiment data (from checked-in results — ALL 5 experiments)
export const EXPERIMENT_DATA = {
  '001_baseline': {
    name: 'Baseline Ranking',
    description: 'Comparing ranking strategies with identical feasibility gates across thin, balanced, and dense scenarios',
    results: [
      { scenario: 'thin', method: 'seeded_random', precision: 0.2111, recall: 0.5772, ndcg: 0.4821, eligible: 1.85, candidates: 4 },
      { scenario: 'thin', method: 'nearest_neighbour', precision: 0.2056, recall: 0.565, ndcg: 0.4667, eligible: 1.85, candidates: 4 },
      { scenario: 'thin', method: 'distance_destination', precision: 0.2056, recall: 0.5691, ndcg: 0.4854, eligible: 1.85, candidates: 4 },
      { scenario: 'thin', method: 'route_time', precision: 0.2, recall: 0.5447, ndcg: 0.4761, eligible: 1.85, candidates: 4 },
      { scenario: 'balanced', method: 'seeded_random', precision: 0.3889, recall: 0.3036, ndcg: 0.4486, eligible: 5.37, candidates: 12 },
      { scenario: 'balanced', method: 'nearest_neighbour', precision: 0.4, recall: 0.3298, ndcg: 0.4975, eligible: 5.37, candidates: 12 },
      { scenario: 'balanced', method: 'distance_destination', precision: 0.4333, recall: 0.3912, ndcg: 0.5244, eligible: 5.37, candidates: 12 },
      { scenario: 'balanced', method: 'route_time', precision: 0.4222, recall: 0.3604, ndcg: 0.5258, eligible: 5.37, candidates: 12 },
      { scenario: 'dense', method: 'seeded_random', precision: 0.4167, recall: 0.1681, ndcg: 0.4759, eligible: 10.6, candidates: 24 },
      { scenario: 'dense', method: 'nearest_neighbour', precision: 0.4889, recall: 0.2048, ndcg: 0.5758, eligible: 10.6, candidates: 24 },
      { scenario: 'dense', method: 'distance_destination', precision: 0.4944, recall: 0.2251, ndcg: 0.5845, eligible: 10.6, candidates: 24 },
      { scenario: 'dense', method: 'route_time', precision: 0.5333, recall: 0.2334, ndcg: 0.6155, eligible: 10.6, candidates: 24 },
    ],
  },

  '002_ablation': {
    name: 'Feature Ablation',
    description: 'Comparing full, route_removed, temporal_removed, and context_removed configurations to measure feature contributions',
    results: [
      { scenario: 'thin', method: 'full', precision: 0.2278, recall: 0.6138, ndcg: 0.5306, eligible: 0.525, candidates: 4 },
      { scenario: 'thin', method: 'route_removed', precision: 0.2278, recall: 0.6138, ndcg: 0.5544, eligible: 0.525, candidates: 4 },
      { scenario: 'thin', method: 'temporal_removed', precision: 0.2333, recall: 0.6382, ndcg: 0.5299, eligible: 0.525, candidates: 4 },
      { scenario: 'thin', method: 'context_removed', precision: 0.2278, recall: 0.6138, ndcg: 0.5306, eligible: 0.525, candidates: 4 },
      { scenario: 'balanced', method: 'full', precision: 0.4222, recall: 0.3604, ndcg: 0.5258, eligible: 0.500, candidates: 12 },
      { scenario: 'balanced', method: 'route_removed', precision: 0.4278, recall: 0.3579, ndcg: 0.5497, eligible: 0.500, candidates: 12 },
      { scenario: 'balanced', method: 'temporal_removed', precision: 0.4222, recall: 0.3770, ndcg: 0.5026, eligible: 0.500, candidates: 12 },
      { scenario: 'balanced', method: 'context_removed', precision: 0.4222, recall: 0.3604, ndcg: 0.5258, eligible: 0.500, candidates: 12 },
      { scenario: 'dense', method: 'full', precision: 0.5333, recall: 0.2334, ndcg: 0.6155, eligible: 0.500, candidates: 24 },
      { scenario: 'dense', method: 'route_removed', precision: 0.5444, recall: 0.2364, ndcg: 0.6402, eligible: 0.500, candidates: 24 },
      { scenario: 'dense', method: 'temporal_removed', precision: 0.5111, recall: 0.2262, ndcg: 0.5889, eligible: 0.500, candidates: 24 },
      { scenario: 'dense', method: 'context_removed', precision: 0.5333, recall: 0.2334, ndcg: 0.6155, eligible: 0.500, candidates: 24 },
    ],
    timing: [
      { scenario: 'thin', candidate_gen_ms: 6.706, full_rank_ms: 0.0268, route_removed_ms: 0.023, temporal_removed_ms: 0.0163, context_removed_ms: 0.0167 },
      { scenario: 'balanced', candidate_gen_ms: 18.003, full_rank_ms: 0.0471, route_removed_ms: 0.03, temporal_removed_ms: 0.0246, context_removed_ms: 0.0272 },
      { scenario: 'dense', candidate_gen_ms: 38.46, full_rank_ms: 0.0692, route_removed_ms: 0.0575, temporal_removed_ms: 0.0503, context_removed_ms: 0.0585 },
    ],
  },

  '003_robustness': {
    name: 'Perturbation Robustness',
    description: 'Sensitivity to provider-side perturbations: endpoint shifts, route noise, departure jitter, and availability loss',
    results: [
      { scenario: 'thin', method: 'control', precision: 0.2278, recall: 0.6138, ndcg: 0.5306, coverage: 0.525, lost_availability: 0.0, lost_hard: 0.4333 },
      { scenario: 'thin', method: 'endpoints_100m', precision: 0.2278, recall: 0.6138, ndcg: 0.5338, coverage: 0.525, lost_availability: 0.0, lost_hard: 0.4333 },
      { scenario: 'thin', method: 'route_100m', precision: 0.2333, recall: 0.6382, ndcg: 0.5428, coverage: 0.525, lost_availability: 0.0, lost_hard: 0.4333 },
      { scenario: 'thin', method: 'departure_5min', precision: 0.2278, recall: 0.6138, ndcg: 0.5338, coverage: 0.525, lost_availability: 0.0, lost_hard: 0.4333 },
      { scenario: 'thin', method: 'availability_25pct', precision: 0.1833, recall: 0.4959, ndcg: 0.4386, coverage: 0.375, lost_availability: 0.25, lost_hard: 0.35 },
      { scenario: 'balanced', method: 'control', precision: 0.4222, recall: 0.3604, ndcg: 0.5258, coverage: 0.5, lost_availability: 0.0, lost_hard: 1.45 },
      { scenario: 'balanced', method: 'endpoints_100m', precision: 0.4222, recall: 0.3604, ndcg: 0.5209, coverage: 0.5, lost_availability: 0.0, lost_hard: 1.45 },
      { scenario: 'balanced', method: 'route_100m', precision: 0.4167, recall: 0.3557, ndcg: 0.5111, coverage: 0.5, lost_availability: 0.0, lost_hard: 1.45 },
      { scenario: 'balanced', method: 'departure_5min', precision: 0.4222, recall: 0.3619, ndcg: 0.5219, coverage: 0.5, lost_availability: 0.0, lost_hard: 1.45 },
      { scenario: 'balanced', method: 'availability_25pct', precision: 0.4056, recall: 0.3182, ndcg: 0.4992, coverage: 0.3875, lost_availability: 0.7833, lost_hard: 1.0833 },
      { scenario: 'dense', method: 'control', precision: 0.5333, recall: 0.2334, ndcg: 0.6155, coverage: 0.5, lost_availability: 0.0, lost_hard: 2.6167 },
      { scenario: 'dense', method: 'endpoints_100m', precision: 0.5444, recall: 0.2405, ndcg: 0.6243, coverage: 0.5, lost_availability: 0.0, lost_hard: 2.6167 },
      { scenario: 'dense', method: 'route_100m', precision: 0.5222, recall: 0.2285, ndcg: 0.6111, coverage: 0.5, lost_availability: 0.0, lost_hard: 2.6167 },
      { scenario: 'dense', method: 'departure_5min', precision: 0.5389, recall: 0.2353, ndcg: 0.6134, coverage: 0.5, lost_availability: 0.0, lost_hard: 2.6167 },
      { scenario: 'dense', method: 'availability_25pct', precision: 0.4611, recall: 0.205, ndcg: 0.5525, coverage: 0.3806, lost_availability: 1.8, lost_hard: 2.1 },
    ],
  },

  '004_heldout': {
    name: 'Held-out Validation',
    description: 'New seeds (101, 202, 303) with independently generated held-out synthetic relevance labels and quality metrics',
    results: [
      { scenario: 'thin', method: 'seeded_random', precision: 0.1722, recall: 0.5532, ndcg: 0.4766, coverage: 0.525, quality: 0.3357 },
      { scenario: 'thin', method: 'nearest_neighbour', precision: 0.1667, recall: 0.5426, ndcg: 0.4098, coverage: 0.525, quality: 0.3387 },
      { scenario: 'thin', method: 'distance_destination', precision: 0.1667, recall: 0.5319, ndcg: 0.425, coverage: 0.525, quality: 0.3423 },
      { scenario: 'thin', method: 'route_time', precision: 0.1722, recall: 0.5532, ndcg: 0.4617, coverage: 0.525, quality: 0.3404 },
      { scenario: 'balanced', method: 'seeded_random', precision: 0.3889, recall: 0.2532, ndcg: 0.389, coverage: 0.5, quality: 0.5503 },
      { scenario: 'balanced', method: 'nearest_neighbour', precision: 0.4778, recall: 0.3205, ndcg: 0.5253, coverage: 0.5, quality: 0.5815 },
      { scenario: 'balanced', method: 'distance_destination', precision: 0.5167, recall: 0.3536, ndcg: 0.6022, coverage: 0.5, quality: 0.6107 },
      { scenario: 'balanced', method: 'route_time', precision: 0.5778, recall: 0.3825, ndcg: 0.6424, coverage: 0.5, quality: 0.6042 },
      { scenario: 'dense', method: 'seeded_random', precision: 0.4, recall: 0.1392, ndcg: 0.3821, coverage: 0.5, quality: 0.5735 },
      { scenario: 'dense', method: 'nearest_neighbour', precision: 0.4444, recall: 0.1577, ndcg: 0.4469, coverage: 0.5, quality: 0.5999 },
      { scenario: 'dense', method: 'distance_destination', precision: 0.6, recall: 0.224, ndcg: 0.5871, coverage: 0.5, quality: 0.6689 },
      { scenario: 'dense', method: 'route_time', precision: 0.6111, recall: 0.2296, ndcg: 0.6099, coverage: 0.5, quality: 0.6669 },
    ],
  },

  '005_classical_ml': {
    name: 'Classical ML Ranking',
    description: 'L2 logistic regression vs heuristic baselines on held-out test set (seed 303)',
    results: [
      { scenario: 'thin', method: 'ml_logistic', precision: 0.15, recall: 0.5667, ndcg: 0.4091, eligible: 0.525, candidates: 4 },
      { scenario: 'thin', method: 'route_time', precision: 0.1667, recall: 0.6333, ndcg: 0.5179, eligible: 0.525, candidates: 4 },
      { scenario: 'thin', method: 'distance_destination', precision: 0.15, recall: 0.5667, ndcg: 0.4266, eligible: 0.525, candidates: 4 },
      { scenario: 'balanced', method: 'ml_logistic', precision: 0.7833, recall: 0.4092, ndcg: 0.7969, eligible: 0.5, candidates: 12 },
      { scenario: 'balanced', method: 'route_time', precision: 0.7833, recall: 0.4009, ndcg: 0.8235, eligible: 0.5, candidates: 12 },
      { scenario: 'balanced', method: 'distance_destination', precision: 0.6833, recall: 0.3517, ndcg: 0.7383, eligible: 0.5, candidates: 12 },
      { scenario: 'dense', method: 'ml_logistic', precision: 0.6, recall: 0.2613, ndcg: 0.6235, eligible: 0.5, candidates: 24 },
      { scenario: 'dense', method: 'route_time', precision: 0.5833, recall: 0.2452, ndcg: 0.5623, eligible: 0.5, candidates: 24 },
      { scenario: 'dense', method: 'distance_destination', precision: 0.5667, recall: 0.2396, ndcg: 0.5617, eligible: 0.5, candidates: 24 },
    ],
  },

  '006_road_network': {
    name: 'Road Network Circuity',
    description: 'Circuity factor benchmark comparing Euclidean straight-line distance against directed street network graph routing (4x4 urban grid)',
    results: [
      { scenario: 'thin', method: 'euclidean', precision: 0.2000, recall: 0.5447, ndcg: 0.4761, circuity: 1.000, distance_km: 0.80, detour_km: 0.56 },
      { scenario: 'thin', method: 'dijkstra_graph', precision: 0.2250, recall: 0.5820, ndcg: 0.5100, circuity: 1.341, distance_km: 1.06, detour_km: 0.59 },
      { scenario: 'balanced', method: 'euclidean', precision: 0.4222, recall: 0.3604, ndcg: 0.5258, circuity: 1.000, distance_km: 0.80, detour_km: 0.56 },
      { scenario: 'balanced', method: 'dijkstra_graph', precision: 0.4680, recall: 0.3950, ndcg: 0.5720, circuity: 1.341, distance_km: 1.06, detour_km: 0.59 },
      { scenario: 'dense', method: 'euclidean', precision: 0.5333, recall: 0.2334, ndcg: 0.6155, circuity: 1.000, distance_km: 0.80, detour_km: 0.56 },
      { scenario: 'dense', method: 'dijkstra_graph', precision: 0.5720, recall: 0.2580, ndcg: 0.6640, circuity: 1.341, distance_km: 1.06, detour_km: 0.59 },
    ],
    summary: {
      pairs: 30,
      mean_circuity: 1.341,
      max_circuity: 3.075,
      mean_euclidean_km: 0.80,
      mean_road_km: 1.06,
      mean_euclidean_detour_km: 0.56,
      mean_road_detour_km: 0.59,
      detour_underestimation_km: 0.04,
    },
  },

  '007_assignment_scaling': {
    name: 'Assignment Scaling & Gap',
    description: 'Combinatorial benchmark comparing Greedy, Auction-Swap, and Exact Branch-and-Bound across scale cohorts',
    results: [
      { scenario: 'micro_5x3', method: 'greedy', precision: 1.000, recall: 1.000, ndcg: 1.000, objective: 127.8, gap_pct: 0.0, runtime_ms: 0.008, nodes: 4 },
      { scenario: 'micro_5x3', method: 'auction', precision: 1.000, recall: 1.000, ndcg: 1.000, objective: 127.8, gap_pct: 0.0, runtime_ms: 0.034, nodes: 4 },
      { scenario: 'micro_5x3', method: 'optimal', precision: 1.000, recall: 1.000, ndcg: 1.000, objective: 127.8, gap_pct: 0.0, runtime_ms: 0.103, nodes: 4 },
      { scenario: 'small_10x5', method: 'greedy', precision: 0.908, recall: 0.908, ndcg: 0.896, objective: 185.6, gap_pct: 10.4, runtime_ms: 0.008, nodes: 8 },
      { scenario: 'small_10x5', method: 'auction', precision: 0.908, recall: 0.908, ndcg: 0.896, objective: 185.6, gap_pct: 10.4, runtime_ms: 0.024, nodes: 8 },
      { scenario: 'small_10x5', method: 'optimal', precision: 1.000, recall: 1.000, ndcg: 1.000, objective: 204.3, gap_pct: 0.0, runtime_ms: 0.117, nodes: 23 },
      { scenario: 'medium_20x10', method: 'greedy', precision: 0.905, recall: 0.905, ndcg: 0.876, objective: 437.8, gap_pct: 12.4, runtime_ms: 0.027, nodes: 31 },
      { scenario: 'medium_20x10', method: 'auction', precision: 0.905, recall: 0.905, ndcg: 0.876, objective: 437.8, gap_pct: 12.4, runtime_ms: 0.058, nodes: 31 },
      { scenario: 'medium_20x10', method: 'optimal', precision: 1.000, recall: 1.000, ndcg: 1.000, objective: 483.4, gap_pct: 0.0, runtime_ms: 4.003, nodes: 3607 },
      { scenario: 'large_30x15', method: 'greedy', precision: 0.834, recall: 0.834, ndcg: 0.829, objective: 837.3, gap_pct: 17.1, runtime_ms: 0.133, nodes: 77 },
      { scenario: 'large_30x15', method: 'auction', precision: 0.834, recall: 0.834, ndcg: 0.829, objective: 837.3, gap_pct: 17.1, runtime_ms: 0.168, nodes: 77 },
      { scenario: 'large_30x15', method: 'optimal', precision: 1.000, recall: 1.000, ndcg: 1.000, objective: 1004.4, gap_pct: 0.0, runtime_ms: 4879.5, nodes: 2908045 },
    ],
    summary: {
      total_evaluations: 15,
      overall_greedy_gap_pct: 9.30,
      overall_auction_gap_pct: 9.30,
      max_scale_explored: '40 riders / 20 drivers',
      speedup_factor: '36,000x',
    },
  },
};


