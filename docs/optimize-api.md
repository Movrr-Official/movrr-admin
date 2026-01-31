# POST /optimize API (Prototype)

Endpoint: `POST http://localhost:5000/optimize`

Request JSON:

{
"start_index": 0, // optional index in locations to start from
"locations": [
{ "id": "A", "lat": 37.7749, "lng": -122.4194 },
{ "id": "B", "lat": 37.7849, "lng": -122.4094 }
]
}

Response JSON:

{
"route": [ { "id": "A", "lat": ..., "lng": ... }, ... ],
"metrics": {
"locations_count": 4,
"approx_distance_units": 123456 // internal scaled units
}
}

Notes:

- This is a prototype service using Euclidean distances and OR-Tools TSP.
- The production API should accept richer constraints (time windows, vehicle capacity, avoid zones) and return per-leg metadata (ETA, distance, scoring).

Minimal production POST /optimize (suggested fields):

- request:
  - `campaign_id` (optional)
  - `locations`: [{id, lat, lng, earliest_ts, latest_ts, service_time}]
  - `vehicle`: {id, capacity, start_location, end_location}
  - `preferences`: {avoid_traffic, include_rest_stops, max_duration_minutes}

- response:
  - `route`: [{stop_id, sequence, lat, lng, eta, leg_distance_meters}]
  - `score`: {impressions_estimate, cost_estimate, confidence}
  - `model_version`, `solver_version`
