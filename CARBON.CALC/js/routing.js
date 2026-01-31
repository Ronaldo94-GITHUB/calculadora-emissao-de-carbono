/* js/routing.js
   Simple routing client for driving distances (OSRM-compatible)
   - Exports: window.ROUTING.getDrivingDistance({lat,lon}, {lat,lon}) -> Promise<number|null> (kilometers)
   - Uses localStorage caching to avoid repeat queries
*/
(function () {
  'use strict';

  function storageKey(a, b) {
    return `routing:${a.lat},${a.lon}|${b.lat},${b.lon}`;
  }

  async function fetchJson(url) {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error('Request failed');
    return res.json();
  }

  async function getDrivingDistance(a, b, opts = {}) {
    // Verify coords
    if (!a || !b || typeof a.lat !== 'number' || typeof a.lon !== 'number' || typeof b.lat !== 'number' || typeof b.lon !== 'number') return null;

    // Respect global configuration
    const cfg = (window.CONFIG && window.CONFIG.ROUTING) ? window.CONFIG.ROUTING : {};
    if (!cfg.enabled) return null;

    const key = storageKey(a, b);
    const raw = localStorage.getItem(key);
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        const now = Date.now();
        if (parsed.ts && (now - parsed.ts < (cfg.cacheTtlMs || 0)) && typeof parsed.m === 'number') {
          return Math.round(parsed.m / 1000);
        }
      } catch (err) {
        // ignore and refetch
      }
    }

    // Build URL (OSRM-like)
    const endpoint = (cfg.endpoint || 'https://router.project-osrm.org/route/v1/driving').replace(/\/$/, '');
    const coords = `${a.lon},${a.lat};${b.lon},${b.lat}`;
    const url = `${endpoint}/${coords}?overview=false&alternatives=false&steps=false`;

    try {
      const json = await fetchJson(url);
      if (json && Array.isArray(json.routes) && json.routes[0] && typeof json.routes[0].distance === 'number') {
        const meters = json.routes[0].distance;
        try {
          localStorage.setItem(key, JSON.stringify({ ts: Date.now(), m: meters }));
        } catch (err) {
          // ignore storage errors
        }
        return Math.round(meters / 1000);
      }
    } catch (err) {
      // network or parse error
    }

    return null;
  }

  window.ROUTING = window.ROUTING || { getDrivingDistance };
})();