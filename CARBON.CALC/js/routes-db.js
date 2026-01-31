/* js/routes-db.js
   Banco de rotas local com métodos utilitários.
   - Proporciona 30+ rotas populares entre cidades brasileiras
   - Exports global: window.RoutesDB
*/
(function () {
  'use strict';

  const RoutesDB = {
    routes: [
      { origin: 'São Paulo, SP', destination: 'Rio de Janeiro, RJ', distanceKm: 430 },
      { origin: 'São Paulo, SP', destination: 'Brasília, DF', distanceKm: 1015 },
      { origin: 'Rio de Janeiro, RJ', destination: 'Brasília, DF', distanceKm: 1148 },
      { origin: 'São Paulo, SP', destination: 'Campinas, SP', distanceKm: 95 },
      { origin: 'Rio de Janeiro, RJ', destination: 'Niterói, RJ', distanceKm: 13 },
      { origin: 'Belo Horizonte, MG', destination: 'Ouro Preto, MG', distanceKm: 100 },
      { origin: 'Curitiba, PR', destination: 'Joinville, SC', distanceKm: 130 },
      { origin: 'Salvador, BA', destination: 'Feira de Santana, BA', distanceKm: 116 },
      { origin: 'Fortaleza, CE', destination: 'Sobral, CE', distanceKm: 240 },
      { origin: 'Manaus, AM', destination: 'Itacoatiara, AM', distanceKm: 270 },
      { origin: 'Belém, PA', destination: 'Marabá, PA', distanceKm: 485 },
      { origin: 'Goiânia, GO', destination: 'Anápolis, GO', distanceKm: 55 },
      { origin: 'Porto Alegre, RS', destination: 'Caxias do Sul, RS', distanceKm: 130 },
      { origin: 'Recife, PE', destination: 'Caruaru, PE', distanceKm: 130 },
      { origin: 'Natal, RN', destination: 'Mossoró, RN', distanceKm: 280 },
      { origin: 'João Pessoa, PB', destination: 'Campina Grande, PB', distanceKm: 130 },
      { origin: 'Aracaju, SE', destination: 'Lagarto, SE', distanceKm: 75 },
      { origin: 'Palmas, TO', destination: 'Porto Nacional, TO', distanceKm: 60 },
      { origin: 'Cuiabá, MT', destination: 'Rondonópolis, MT', distanceKm: 215 },
      { origin: 'Campo Grande, MS', destination: 'Dourados, MS', distanceKm: 230 },
      { origin: 'São Paulo, SP', destination: 'Santos, SP', distanceKm: 72 },
      { origin: 'Rio de Janeiro, RJ', destination: 'Petrópolis, RJ', distanceKm: 68 },
      { origin: 'Belo Horizonte, MG', destination: 'Uberlândia, MG', distanceKm: 500 },
      { origin: 'Curitiba, PR', destination: 'Florianópolis, SC', distanceKm: 300 },
      { origin: 'Salvador, BA', destination: 'Ilhéus, BA', distanceKm: 280 },
      { origin: 'Fortaleza, CE', destination: 'Juazeiro do Norte, CE', distanceKm: 530 },
      { origin: 'Manaus, AM', destination: 'Manacapuru, AM', distanceKm: 87 },
      { origin: 'Belém, PA', destination: 'Santarém, PA', distanceKm: 700 },
      { origin: 'Goiânia, GO', destination: 'Rio Verde, GO', distanceKm: 230 },
      { origin: 'Porto Alegre, RS', destination: 'Pelotas, RS', distanceKm: 260 },
      { origin: 'Recife, PE', destination: 'João Pessoa, PB', distanceKm: 185 },
      { origin: 'Natal, RN', destination: 'Recife, PE', distanceKm: 292 },
      { origin: 'São Paulo, SP', destination: 'Ribeirão Preto, SP', distanceKm: 315 },
      { origin: 'Campinas, SP', destination: 'Ribeirão Preto, SP', distanceKm: 150 }
    ],

    getAllCities: function () {
      const cities = this.getUniqueRoutes().flatMap(route => [route.origin, route.destination]);
      // Se houver um dataset adicional (cities-br.json / data/municipalities), inclua suas chaves
      const extra = (window.CitiesBR && typeof window.CitiesBR === 'object') ? Object.keys(window.CitiesBR) : [];
      return [...new Set([...cities, ...extra])].sort((a, b) => a.localeCompare(b));
    },

    // Retorna uma lista de rotas sem duplicatas (uniques by origin|destination)
    getUniqueRoutes: function () {
      const map = new Map();
      for (const r of this.routes) {
        const key = `${r.origin.trim().toLowerCase()}|${r.destination.trim().toLowerCase()}`;
        if (!map.has(key)) map.set(key, r);
      }
      return [...map.values()];
    },

    _findCityCoord: function (name) {
      if (!name) return null;
      const lookup = (window.CitiesBR && typeof window.CitiesBR === 'object') ? window.CitiesBR : {};
      // Direct key match
      if (lookup[name]) return lookup[name];
      const lower = name.trim().toLowerCase();

      // Try direct prefix match like "São Paulo" matching "São Paulo, SP"
      for (const k of Object.keys(lookup)) {
        const kl = k.toLowerCase();
        if (kl === lower || kl.startsWith(lower + ',') || kl.includes(lower)) return lookup[k];
      }

      // Also allow matching by removing diacritics / simpler heuristics in the future
      return null;
    },

    // Async: try to fetch driving distance via routing provider (if CONFIG.ROUTING.enabled)
    fetchRoadDistance: async function (origin, destination) {
      if (!origin || !destination) return null;
      const c1 = this._findCityCoord(origin);
      const c2 = this._findCityCoord(destination);
      if (!c1 || !c2) return null;

      if (!window.ROUTING || typeof window.ROUTING.getDrivingDistance !== 'function') return null;
      try {
        const km = await window.ROUTING.getDrivingDistance(c1, c2);
        return km; // km or null
      } catch (err) {
        return null;
      }
    },

    _haversineKm: function (lat1, lon1, lat2, lon2) {
      const toRad = v => v * Math.PI / 180;
      const R = 6371.0088;
      const dLat = toRad(lat2 - lat1);
      const dLon = toRad(lon2 - lon1);
      const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) *
                Math.sin(dLon / 2) * Math.sin(dLon / 2);
      const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
      return R * c;
    },

    findDistance: function (origin, destination) {
      if (!origin || !destination) return null;
      const o = origin.trim().toLowerCase();
      const d = destination.trim().toLowerCase();

      const match = this.routes.find(route => {
        const ro = route.origin.toLowerCase();
        const rd = route.destination.toLowerCase();
        return (ro === o && rd === d) || (ro === d && rd === o);
      });

      if (match) return match.distanceKm;

      // fallback: try to resolve coordinates from cities dataset and compute great-circle distance
      const c1 = this._findCityCoord(origin);
      const c2 = this._findCityCoord(destination);
      if (c1 && c2) {
        return Math.round(this._haversineKm(c1.lat, c1.lon, c2.lat, c2.lon));
      }

      return null;
    }
  };

  window.RoutesDB = RoutesDB;
})();