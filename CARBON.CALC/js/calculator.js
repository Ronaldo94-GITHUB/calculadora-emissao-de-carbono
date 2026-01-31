/* js/calculator.js
   Implementação do objeto global `Calculator` com funções de cálculo de emissões
   - Usa `window.CONFIG` (se disponível) para fatores e parâmetros
   - Cada função possui comentários explicativos
*/

(function () {
  'use strict';

  // --- Helpers internos ---
  function round(value, decimals = 2) {
    const f = Math.pow(10, decimals);
    return Math.round((value + Number.EPSILON) * f) / f;
  }

  function getConfigEmissionFactors() {
    // Prioriza CONFIG.EMISSION_FACTORS, depois APP_CONFIG.emissionFactors, senão um default seguro
    return (window.CONFIG && window.CONFIG.EMISSION_FACTORS)
      || (window.APP_CONFIG && window.APP_CONFIG.emissionFactors)
      || { bicycle: 0, car: 192, bus: 27, truck: 900 };
  }

  function getCarbonCreditConfig() {
    // Suporta CONFIG.CARBON_CREDIT ou legacy names
    return (window.CONFIG && window.CONFIG.CARBON_CREDIT)
      || (window.APP_CONFIG && window.APP_CONFIG.CARBON_CREDIT)
      || (window.CONFIG && window.CONFIG.CARBON_CREDIT) // fallback to same
      || { KG_PER_CREDIT: 1000, PRICE_MIN_BRL: 50, PRICE_MAX_BRL: 150 };
  }

  // --- Calculator object ---
  const Calculator = {
    // calculateEmission: calcula emissões (kg) para um modo de transporte
    // - distanceKm: distância em km
    // - transportMode: chave do modo (ex: 'car')
    // Lógica: obtém fator (gCO2/km) e calcula grams = distanceKm * factor
    // Converte para kg e arredonda para 2 casas
    calculateEmission: function (distanceKm, transportMode) {
      if (typeof distanceKm !== 'number' || Number.isNaN(distanceKm) || distanceKm < 0) {
        throw new Error('distanceKm deve ser um número >= 0');
      }

      const factors = getConfigEmissionFactors();
      const factorG = factors[transportMode];
      if (typeof factorG !== 'number') {
        throw new Error(`Modo de transporte inválido: ${transportMode}`);
      }

      // Emissão em gramas = distância (km) * fator (g/km)
      const grams = distanceKm * factorG;
      // Converte para kg
      const kg = grams / 1000;
      // Retorna com 2 casas
      return round(kg, 2);
    },

    // calculateAllModes: calcula emissões para todos os modos configurados
    // - distanceKm: distância em km
    // Retorna array de objetos: { mode, emission, percentageVsCar }
    calculateAllModes: function (distanceKm) {
      if (typeof distanceKm !== 'number' || Number.isNaN(distanceKm) || distanceKm < 0) {
        throw new Error('distanceKm deve ser um número >= 0');
      }

      const factors = getConfigEmissionFactors();
      const modes = Object.keys(factors);

      // Calcula emissões por modo (kg)
      const results = modes.map(mode => {
        const emission = this.calculateEmission(distanceKm, mode);
        return { mode, emission };
      });

      // Usamos a emissão do carro como baseline (se existir)
      const carEntry = results.find(r => r.mode === 'car');
      const carEmission = carEntry ? carEntry.emission : null;

      // Calcula percentuais vs carro
      const enriched = results.map(r => {
        const percentageVsCar = (carEmission && carEmission > 0) ? round((r.emission / carEmission) * 100, 2) : (r.mode === 'car' ? 100 : 0);
        return { mode: r.mode, emission: r.emission, percentageVsCar };
      });

      // Ordena por emissão crescente (menor emissões primeiro)
      enriched.sort((a, b) => a.emission - b.emission);
      return enriched;
    },

    // calculateSavings: compara emissão com baseline e retorna economia
    // - emission: emissão atual (kg)
    // - baselineEmission: emissão base (kg) para comparar
    // Retorna { savedKg, percentage } com 2 casas
    calculateSavings: function (emission, baselineEmission) {
      if (typeof emission !== 'number' || typeof baselineEmission !== 'number') {
        throw new Error('emission e baselineEmission devem ser números');
      }

      const savedKg = baselineEmission - emission;
      const saved = savedKg < 0 ? 0 : savedKg; // não retorna negativo como 'economia'
      const percentage = (baselineEmission > 0) ? round((saved / baselineEmission) * 100, 2) : 0;
      return { savedKg: round(saved, 2), percentage };
    },

    // calculateCarbonCredits: converte emissão (kg) para créditos de carbono
    // - emissionKg: valor em kg
    // Divide por CONFIG.CARBON_CREDIT.KG_PER_CREDIT e retorna 4 casas
    calculateCarbonCredits: function (emissionKg) {
      if (typeof emissionKg !== 'number' || Number.isNaN(emissionKg) || emissionKg < 0) {
        throw new Error('emissionKg deve ser um número >= 0');
      }

      const cc = getCarbonCreditConfig();
      const perCredit = cc.KG_PER_CREDIT ?? cc.KG_PER_CREDIT; // fallback
      const credits = emissionKg / perCredit;
      return round(credits, 4);
    },

    // estimateCreditPrice: estima preço mínimo, máximo e médio para uma quantidade de créditos
    // - credits: quantidade de créditos
    // Retorna { min, max, average } com 2 casas
    estimateCreditPrice: function (credits) {
      if (typeof credits !== 'number' || Number.isNaN(credits) || credits < 0) {
        throw new Error('credits deve ser um número >= 0');
      }

      const cc = getCarbonCreditConfig();
      const min = credits * (cc.PRICE_MIN_BRL ?? 50);
      const max = credits * (cc.PRICE_MAX_BRL ?? 150);
      const avg = (min + max) / 2;
      return { min: round(min, 2), max: round(max, 2), average: round(avg, 2) };
    },

    // calculateRouteEmission: retorna um objeto detalhado de emissão para uma rota
    // - origin: string (ex.: 'São Paulo, SP')
    // - destination: string (ex.: 'Fortaleza, CE')
    // - distanceKm: número (km)
    // - transportInput: chave do modo (ex.: 'car') ou label ('Carro')
    // Retorna: { rota: { origem, destino }, distanciaKm, transporte, fatorEmissao, emissaoTotalKg }
    calculateRouteEmission: function (origin, destination, distanceKm, transportInput) {
      if (typeof distanceKm !== 'number' || Number.isNaN(distanceKm) || distanceKm < 0) {
        throw new Error('distanceKm deve ser um número >= 0');
      }

      const factors = getConfigEmissionFactors();

      // Resolve transport mode key: accepts key ('car') or label ('Carro')
      let modeKey = transportInput;
      if (!modeKey) {
        modeKey = (window.APP_CONFIG && window.APP_CONFIG.defaults && window.APP_CONFIG.defaults.transport) || 'car';
      }

      // If the provided input is not a key, try to map by label in CONFIG.TRANSPORT_MODES
      if (!factors[modeKey]) {
        const modesMeta = (window.CONFIG && window.CONFIG.TRANSPORT_MODES) || {};
        const lowerInput = String(transportInput || '').trim().toLowerCase();
        for (const k of Object.keys(modesMeta)) {
          if (k.toLowerCase() === lowerInput) { modeKey = k; break; }
          const label = (modesMeta[k] && modesMeta[k].label) ? modesMeta[k].label.toLowerCase() : '';
          if (label === lowerInput || label.includes(lowerInput) || lowerInput.includes(label)) { modeKey = k; break; }
        }
      }

      const factorG = factors[modeKey];
      if (typeof factorG !== 'number') {
        throw new Error(`Modo de transporte inválido: ${transportInput}`);
      }

      // Converte para kg por km
      const factorKgPerKm = round(factorG / 1000, 3);

      const totalKg = round(distanceKm * factorKgPerKm, 2);

      // Transporte label (legível)
      const transportLabel = (window.CONFIG && window.CONFIG.TRANSPORT_MODES && window.CONFIG.TRANSPORT_MODES[modeKey])
        ? window.CONFIG.TRANSPORT_MODES[modeKey].label
        : modeKey;

      return {
        rota: { origem: origin || '', destino: destination || '' },
        distanciaKm: distanceKm,
        transporte: transportLabel,
        fatorEmissao: factorKgPerKm, // kg CO₂ por km
        emissaoTotalKg: totalKg
      };
    }
  };
  // Exporta apenas o objeto `Calculator` como global
  window.Calculator = Calculator;
})();
