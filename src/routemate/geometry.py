"""Deterministic geographic heuristics, not road routing or safety prediction.

Proximity samples routes uniformly by arc length (0.1 km target, capped at
2048 samples; capped routes use length/2047 spacing). Local projection rejects
polar, antimeridian, and extents over 2 degrees or 200 km.
"""
from dataclasses import dataclass
from math import asin, atan2, ceil, cos, hypot, isfinite, pi, radians, sin, sqrt
from numbers import Real
from typing import Sequence
EARTH_RADIUS_KM=6371.0088; SAMPLE_SPACING_KM=.1; MAX_SAMPLES=2048
@dataclass(frozen=True)
class Coordinate:
    latitude: float
    longitude: float
    def __post_init__(self):
        for value, limit in ((self.latitude,90),(self.longitude,180)):
            if isinstance(value,bool) or not isinstance(value,Real) or not isfinite(value) or not -limit<=value<=limit:
                raise ValueError("coordinates must be finite and in range")
def haversine_km(a,b):
    p1,p2=radians(a.latitude),radians(b.latitude)
    h=sin((p2-p1)/2)**2+cos(p1)*cos(p2)*sin(radians(b.longitude-a.longitude)/2)**2
    return 2*EARTH_RADIUS_KM*asin(sqrt(max(0,min(1,h))))
def polyline_length_km(route): return sum(haversine_km(a,b) for a,b in zip(route,route[1:]))
def validate_local_domain(points):
    if not points or any(not isinstance(p,Coordinate) for p in points): raise ValueError("route must contain Coordinates")
    south,north=min(p.latitude for p in points),max(p.latitude for p in points); west,east=min(p.longitude for p in points),max(p.longitude for p in points)
    if max(abs(south),abs(north))>70 or north-south>2 or east-west>2 or haversine_km(Coordinate(south,west),Coordinate(north,east))>200: raise ValueError("unsupported local projection domain")
def _project(routes):
    points=tuple(p for route in routes for p in route); validate_local_domain(points); lat=(min(p.latitude for p in points)+max(p.latitude for p in points))/2; lon=(min(p.longitude for p in points)+max(p.longitude for p in points))/2
    return [[(EARTH_RADIUS_KM*radians(p.longitude-lon)*cos(radians(lat)),EARTH_RADIUS_KM*radians(p.latitude-lat)) for p in route] for route in routes]
def _dist(p,a,b):
    dx,dy=b[0]-a[0],b[1]-a[1]; q=dx*dx+dy*dy; t=0 if not q else max(0,min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/q)); return hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dy)
def _samples(route):
    ls=[hypot(b[0]-a[0],b[1]-a[1]) for a,b in zip(route,route[1:])]; total=sum(ls)
    if total<=1e-9: raise ValueError("route must be nondegenerate")
    n=min(MAX_SAMPLES,max(2,ceil(total/SAMPLE_SPACING_KM)+1)); seg=0; passed=0
    for i in range(n):
        target=total*i/(n-1)
        while seg<len(ls)-1 and (not ls[seg] or passed+ls[seg]<target): passed+=ls[seg]; seg+=1
        t=0 if not ls[seg] else (target-passed)/ls[seg]; a,b=route[seg],route[seg+1]; yield (a[0]+t*(b[0]-a[0]),a[1]+t*(b[1]-a[1]))
def route_similarity(route_a,route_b,tolerance_km=.5):
    if len(route_a)<2 or len(route_b)<2 or isinstance(tolerance_km,bool) or not isinstance(tolerance_km,Real) or not isfinite(tolerance_km) or tolerance_km<0: raise ValueError("invalid routes or tolerance")
    a,b=_project((route_a,route_b))
    def f(x,y):
        ss=list(_samples(x)); return sum(min(_dist(p,u,v) for u,v in zip(y,y[1:]))<=tolerance_km+1e-10 for p in ss)/len(ss)
    return (f(a,b)+f(b,a))/2
def ordered_insertion_detour_km(route,pickup,dropoff):
    validate_local_domain(tuple(route)+(pickup,dropoff)); best=float('inf'); prior=float('inf'); between=haversine_km(pickup,dropoff)
    for a,b in zip(route,route[1:]):
        edge=haversine_km(a,b); pc=max(0,haversine_km(a,pickup)+haversine_km(pickup,b)-edge); dc=max(0,haversine_km(a,dropoff)+haversine_km(dropoff,b)-edge); same=max(0,haversine_km(a,pickup)+between+haversine_km(dropoff,b)-edge); best=min(best,same,prior+dc); prior=min(prior,pc)
    return best
def direction_similarity(a,b,c,d):
    def bearing(x,y):
        p1,p2,dl=radians(x.latitude),radians(y.latitude),radians(y.longitude-x.longitude); return atan2(sin(dl)*cos(p2),cos(p1)*sin(p2)-sin(p1)*cos(p2)*cos(dl))
    delta=(bearing(a,b)-bearing(c,d)+pi)%(2*pi)-pi; return max(0,min(1,(1+cos(delta))/2))
