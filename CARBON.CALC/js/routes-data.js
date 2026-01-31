/* js/routes-data.js
   Exemplo simples de dados de rotas e integração com `calculator.js`.
   - Define `window.APP_ROUTES` com `cities` e `distances` (chave: "Origin|Destination").
   - Registra `window.CALC.fetchDistance` quando `CALC` estiver disponível.
   - Tenta popular o datalist chamando `CALC.populateCities()` quando possível.
*/

(function () {
  'use strict';

  // Constroi `window.APP_ROUTES` a partir de `window.RoutesDB` quando disponível
  const FALLBACK = {
    cities: [
      'São Paulo',
      'Rio de Janeiro',
      'Belo Horizonte',
      'Curitiba',
      'Porto Alegre'
    ],
    // Distâncias exemplo em km (origem|destino)
    distances: {
      'São Paulo|Rio de Janeiro': 429,
      'São Paulo|Belo Horizonte': 586,
      'São Paulo|Curitiba': 408,
      'Rio de Janeiro|Belo Horizonte': 434,
      'Curitiba|Porto Alegre': 706
    }
  };

  function buildAppRoutes() {
    if (window.RoutesDB) {
      const cities = window.RoutesDB.getAllCities();
      const distances = {};
      // Use only rotas únicas ao construir o mapa de distâncias
      const unique = (typeof window.RoutesDB.getUniqueRoutes === 'function') ? window.RoutesDB.getUniqueRoutes() : window.RoutesDB.routes;
      unique.forEach(r => {
        distances[`${r.origin}|${r.destination}`] = r.distanceKm;
      });
      return { cities, distances };
    }
    return FALLBACK;
  }

  window.APP_ROUTES = buildAppRoutes();

  // Tenta carregar datasets adicionais de cidades (primeiro um sample, depois dataset completo em data/)
  (function loadCitiesJson() {
    const tryLoad = async (path) => {
      try {
        const res = await fetch(path, { cache: 'no-store' });
        if (!res.ok) return null;
        const json = await res.json();
        if (json && typeof json === 'object') return json;
      } catch (err) {
        return null;
      }
      return null;
    };

    (async () => {
      const sample = await tryLoad('js/cities-br.json');
      if (sample) {
        window.CitiesBR = Object.assign({}, window.CitiesBR || {}, sample);
      }
      // Tenta carregar dataset completo se o usuário tiver colocado em data/municipalities-br.json
      const full = await tryLoad('data/municipalities-br.json');
      if (full) {
        window.CitiesBR = Object.assign({}, window.CitiesBR || {}, full);
      }

      // Atualiza APP_ROUTES.cities caso já exista
      if (window.APP_ROUTES && Array.isArray(window.APP_ROUTES.cities) && window.CitiesBR) {
        window.APP_ROUTES.cities = [...new Set([...(window.APP_ROUTES.cities || []), ...Object.keys(window.CitiesBR)])];
      }
    })();
  })();

  function findDistance(origin, destination) {
    if (!origin || !destination) return null;

    // Prefer RouteDB API if available for more robust matching
    if (window.RoutesDB && typeof window.RoutesDB.findDistance === 'function') {
      return window.RoutesDB.findDistance(origin, destination);
    }

    const key1 = `${origin}|${destination}`;
    const key2 = `${destination}|${origin}`;
    return window.APP_ROUTES.distances[key1] ?? window.APP_ROUTES.distances[key2] ?? null;
  }

  // Utilitário disponível globalmente
  window.getRouteDistance = function (origin, destination) {
    return findDistance(origin, destination);
  };

  // UI helpers: popula datalist e auto-preenche distância
  const ROUTE_UI = {
    populateDatalist: function () {
      const datalist = document.getElementById('cities-list');
      if (!datalist) return;
      // Obtém cidades da fonte principal
      const cities = (window.RoutesDB && typeof window.RoutesDB.getAllCities === 'function')
        ? window.RoutesDB.getAllCities()
        : (window.APP_ROUTES && Array.isArray(window.APP_ROUTES.cities) ? window.APP_ROUTES.cities : []);

      datalist.innerHTML = '';
      for (const city of cities) {
        const opt = document.createElement('option');
        opt.value = city;
        datalist.appendChild(opt);
      }
    },

    setupDistanceAutoFill: function () {
      const originInput = document.getElementById('origin');
      const destinationInput = document.getElementById('destination');
      const distanceInput = document.getElementById('distance');
      const manualChk = document.getElementById('manual-distance');
      const helper = document.getElementById('distance-help');
      if (!originInput || !destinationInput || !distanceInput || !helper) return;

      function setHelperSuccess(msg) {
        helper.textContent = msg;
        helper.style.color = 'var(--color-primary)';
      }

      function setHelperWarning(msg) {
        helper.textContent = msg;
        helper.style.color = '';
      }

      async function updateDistance() {
        // Se o usuário escolheu inserir manualmente, não auto-preenche
        if (manualChk && manualChk.checked) return;

        const origin = originInput.value.trim();
        const destination = destinationInput.value.trim();
        if (!origin || !destination) {
          // Limpa estado quando incompleto
          distanceInput.value = '';
          distanceInput.setAttribute('readonly', '');
          setHelperWarning('Preencha origem e destino para buscar distância automaticamente');
          return;
        }

        // Primeiro tenta rota direta a partir do banco de rotas
        let d = (window.RoutesDB && typeof window.RoutesDB.findDistance === 'function')
          ? window.RoutesDB.findDistance(origin, destination)
          : findDistance(origin, destination);

        // Se o usuário escolheu usar rota por estrada e a configuração global permitir, tentamos rota assíncrona (API)
        const useRoad = document.getElementById('use-road')?.checked;
        if (useRoad && !(window.CONFIG && window.CONFIG.ROUTING && window.CONFIG.ROUTING.enabled)) {
          setHelperWarning('Roteamento por estrada não ativado no app (CONFIG.ROUTING.enabled = false)');
        }

        if ((d == null) && useRoad && window.CONFIG && window.CONFIG.ROUTING && window.CONFIG.ROUTING.enabled && window.RoutesDB && typeof window.RoutesDB.fetchRoadDistance === 'function') {
          distanceInput.value = '';
          distanceInput.setAttribute('readonly', '');
          setHelperWarning('Buscando distância por estrada…');
          const road = await window.RoutesDB.fetchRoadDistance(origin, destination);
          if (road != null) {
            distanceInput.value = road;
            distanceInput.setAttribute('readonly', '');
            setHelperSuccess('Distância por estrada preenchida automaticamente');
            return;
          }
        }

        // Fallback: estima por coordenadas (Haversine) se dataset estiver disponível
        let approx = false;
        if (d == null && window.CitiesBR && typeof window.CitiesBR === 'object' && window.RoutesDB && typeof window.RoutesDB._findCityCoord === 'function') {
          const c1 = window.RoutesDB._findCityCoord(origin);
          const c2 = window.RoutesDB._findCityCoord(destination);
          if (c1 && c2) { d = Math.round(window.RoutesDB._haversineKm(c1.lat, c1.lon, c2.lat, c2.lon)); approx = true; }
        }

        if (d != null) {
          distanceInput.value = d;
          distanceInput.setAttribute('readonly', '');
          setHelperSuccess(approx ? 'Distância preenchida automaticamente (estimativa, linha reta)' : 'Distância preenchida automaticamente');
        } else {
          distanceInput.value = '';
          distanceInput.setAttribute('readonly', '');
          setHelperWarning('Distância não encontrada — ative "Inserir distância manualmente" para editar');
        }
      }

      // Eventos
      originInput.addEventListener('change', updateDistance);
      destinationInput.addEventListener('change', updateDistance);
      originInput.addEventListener('input', updateDistance);
      destinationInput.addEventListener('input', updateDistance);

      if (manualChk) {
        // Se CONFIG fornece um handler, delega para ele (para centralizar lógica de UI)
        if (window.CONFIG && typeof window.CONFIG.setupDistanceAutoFill === 'function') {
          try {
            window.CONFIG.setupDistanceAutoFill();
          } catch (err) {
            // fallback para comportamento local caso CONFIG falhe
            manualChk.addEventListener('change', () => {
              if (manualChk.checked) {
                distanceInput.removeAttribute('readonly');
                setHelperWarning('Insira a distância manualmente');
              } else {
                distanceInput.setAttribute('readonly', '');
                updateDistance();
              }
            });
          }
        } else {
          manualChk.addEventListener('change', () => {
            if (manualChk.checked) {
              distanceInput.removeAttribute('readonly');
              setHelperWarning('Insira a distância manualmente');
            } else {
              distanceInput.setAttribute('readonly', '');
              updateDistance();
            }
          });
        }
      }

      // Inicializa: tentar preencher se houver valores já definidos
      updateDistance();
    }
  };

  window.ROUTE_UI = ROUTE_UI;

  // Compute emission summaries for unique routes and render them using UI renderers
  async function computeAndRenderRoutesSummaries() {
    try {
      if (!window.Calculator || !window.UI || typeof window.UI.renderRoutesSummaryList !== 'function') return;

      // Obtain list of unique routes
      const routes = (window.RoutesDB && typeof window.RoutesDB.getUniqueRoutes === 'function')
        ? window.RoutesDB.getUniqueRoutes()
        : Object.keys(window.APP_ROUTES.distances || {}).map(k => {
          const [o, d] = k.split('|');
          return { origin: (o || '').trim(), destination: (d || '').trim(), distance: window.APP_ROUTES.distances[k] };
        });

      const summaries = routes.map(route => {
        const distance = route.distanceKm ?? route.distance ?? 0;
        // compute emissions per transport mode
        const modes = Object.keys((window.CONFIG && window.CONFIG.TRANSPORT_MODES) || { car: {} });
        const byMode = modes.map(mode => ({
          mode,
          emission: Number(window.Calculator.calculateEmission(distance, mode) || 0)
        }));

        const carEmission = byMode.find(m => m.mode === 'car')?.emission || 0;
        const credits = window.Calculator.calculateCarbonCredits(carEmission);
        const price = window.Calculator.estimateCreditPrice(credits);

        return {
          origin: route.origin,
          destination: route.destination,
          distance: Number(distance || 0),
          byMode,
          carEmission,
          credits,
          price
        };
      });

      window.UI.renderRoutesSummaryList(summaries);
    } catch (err) {
      // ignore errors — não bloqueia a aplicação
      console.error('Erro ao calcular resumos de rotas:', err);
    }
  }



  // Registrar integração com CALC quando disponível
  let tries = 0;
  const maxTries = 80; // ~4s
  const intervalMs = 50;
  const interval = setInterval(() => {
    if (window.CALC) {
      // Define fetchDistance para usar os dados locais
      window.CALC.fetchDistance = async (origin, destination) => {
        // Simula latência mínima
        await new Promise((r) => setTimeout(r, 10));
        return findDistance(origin, destination);
      };

      // Popula o datalist se houver cidades
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          ROUTE_UI.populateDatalist();
          ROUTE_UI.setupDistanceAutoFill();
          // Calcula e renderiza resumos de rotas após inicialização
          try { computeAndRenderRoutesSummaries(); } catch (err) { /* ignore */ }
        });
      } else {
        ROUTE_UI.populateDatalist();
        ROUTE_UI.setupDistanceAutoFill();
        // Calcula e renderiza resumos de rotas após inicialização
        try { computeAndRenderRoutesSummaries(); } catch (err) { /* ignore */ }
      }

      // Se APP_ROUTES tiver cidades, atualiza também o CALC (legacy)
      if (Array.isArray(window.APP_ROUTES.cities) && window.CALC.populateCities) {
        try {
          window.CALC.populateCities(window.APP_ROUTES.cities);
        } catch (err) {
          // ignore
        }
      }

      clearInterval(interval);
    } else if (++tries > maxTries) {
      // Se CALC nunca foi registrado, ainda assim inicializa UI quando DOM pronto
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
          ROUTE_UI.populateDatalist();
          ROUTE_UI.setupDistanceAutoFill();
          // Calcula e renderiza resumos de rotas quando CALC não estiver presente
          try { computeAndRenderRoutesSummaries(); } catch (err) { /* ignore */ }
        });
      } else {
        ROUTE_UI.populateDatalist();
        ROUTE_UI.setupDistanceAutoFill();
        // Calcula e renderiza resumos de rotas quando CALC não estiver presente
        try { computeAndRenderRoutesSummaries(); } catch (err) { /* ignore */ }
      }
      clearInterval(interval);
    }
  }, intervalMs);

})();