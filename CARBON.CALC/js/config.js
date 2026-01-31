/* js/config.js
   Arquivo de configuração global para a aplicação.
   - Define `window.APP_CONFIG` com fatores de emissão, opções e defaults.
   - Tenta aplicar automaticamente os fatores ao `window.CALC` se disponível.
*/
(function () {
  'use strict';

  window.APP_CONFIG = window.APP_CONFIG || {
    version: '0.1.0',

    // Fatores em g CO2 / km (podem ser substituídos por valores oficiais)
    emissionFactors: {
      bicycle: 0,
      car: 192,   // g CO2/km
      bus: 27,    // g CO2/km por passageiro
      truck: 900, // g CO2/km
    },

    // Defaults para o comportamento do app
    defaults: {
      transport: 'car',
      decimals: 3,
      referenceDistanceKm: 100
    },

    ui: {
      demoAutoRun: true
    }
  };

  // Tenta aplicar as configurações imediatamente se o módulo de cálculo já estiver carregado
  if (window.CALC && typeof window.CALC.setEmissionFactors === 'function') {
    try {
      window.CALC.setEmissionFactors(window.APP_CONFIG.emissionFactors);
    } catch (err) {
      // ignore
    }
  }

  // Objeto global de configuração pública para UI e metadados
  window.CONFIG = window.CONFIG || {
    TRANSPORT_MODES: {
      bicycle: {
        label: 'Bicicleta',
        icon: '🚲',
        color: '#10b981'
      },
      car: {
        label: 'Carro',
        icon: '🚗',
        color: '#106b01'
      },
      bus: {
        label: 'Ônibus',
        icon: '🚌',
        color: '#059669'
      },
      truck: {
        label: 'Caminhão',
        icon: '🚛',
        color: '#475569'
      }
    },

    CARBON_CREDIT: {
      KG_PER_CREDIT: 1000,        // kg CO₂ por crédito
      PRICE_MIN_BRL: 50,          // preço mínimo em BRL
      PRICE_MAX_BRL: 150          // preço máximo em BRL
    },

    // Roteamento por estrada (opcional)
    ROUTING: {
      enabled: false, // por padrão desligado; ativar no CONFIG se desejar usar APIs de rota
      provider: 'osrm',
      endpoint: 'https://router.project-osrm.org/route/v1/driving',
      // se usar provedores que requerem chave, coloque-a aqui (opcional)
      apiKey: null,
      // tempo máximo de cache (ms) para resultados de rota
      cacheTtlMs: 1000 * 60 * 60 * 24 // 24h
    },

    // UI helpers: configura o comportamento do checkbox de inserção manual
    setupDistanceAutoFill: function () {
      const originInput = document.getElementById('origin');
      const destinationInput = document.getElementById('destination');
      const distanceInput = document.getElementById('distance');
      const manualChk = document.getElementById('manual-distance');
      const helper = document.getElementById('distance-help');
      if (!manualChk || !distanceInput || !helper) return;

      function setHelperSuccess(msg) {
        helper.textContent = msg;
        helper.style.color = 'var(--color-primary)';
      }

      function setHelperWarning(msg) {
        helper.textContent = msg;
        helper.style.color = '';
      }

      // Listener para o checkbox: quando marcado permite edição manual; quando desmarcado tenta auto-preencher
      manualChk.addEventListener('change', async () => {
        if (manualChk.checked) {
          distanceInput.removeAttribute('readonly');
          setHelperWarning('Insira a distância manualmente');
          distanceInput.focus();
        } else {
          distanceInput.setAttribute('readonly', '');

          // Tenta encontrar a distância automaticamente
          const origin = originInput ? originInput.value.trim() : '';
          const destination = destinationInput ? destinationInput.value.trim() : '';

          if (!origin || !destination) {
            distanceInput.value = '';
            setHelperWarning('Preencha origem e destino para buscar distância automaticamente');
            return;
          }

          const d = (window.RoutesDB && typeof window.RoutesDB.findDistance === 'function')
            ? window.RoutesDB.findDistance(origin, destination)
            : (window.getRouteDistance ? window.getRouteDistance(origin, destination) : null);

          if (d != null) {
            distanceInput.value = d;
            setHelperSuccess('Distância preenchida automaticamente');
          } else {
            distanceInput.value = '';
            setHelperWarning('Distância não encontrada — ative "Inserir distância manualmente" para editar');
          }
        }
      });
    },

    // Popula o datalist de cidades (delegando para ROUTE_UI quando disponível)
    populateDataList: function () {
      try {
        if (window.ROUTE_UI && typeof window.ROUTE_UI.populateDatalist === 'function') {
          window.ROUTE_UI.populateDatalist();
          return;
        }

        const datalist = document.getElementById('cities-list');
        if (!datalist) return;

        const cities = (window.APP_ROUTES && Array.isArray(window.APP_ROUTES.cities)) ? window.APP_ROUTES.cities.slice() : [];
        cities.sort((a, b) => a.localeCompare(b));
        datalist.innerHTML = '';
        for (const c of cities) {
          const opt = document.createElement('option');
          opt.value = c;
          datalist.appendChild(opt);
        }
      } catch (err) {
        // ignore errors while populating
      }
    }
  };
})();