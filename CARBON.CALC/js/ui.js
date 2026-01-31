/* js/ui.js
   Interface wiring for Calculator + UI renderers
   - Handles form submit and populates DOM with rendered HTML
*/
(function () {
  'use strict';

  function $(sel) { return document.querySelector(sel); }

  async function handleFormSubmit(e) {
    e && e.preventDefault && e.preventDefault();

    const distanceInput = $('#distance');
    const distance = parseFloat(distanceInput.value);
    if (Number.isNaN(distance) || distance <= 0) {
      const err = $('#form-error');
      if (err) { err.hidden = false; err.textContent = 'Insira uma distância válida (maior que 0).'; }
      return;
    }

    const transport = document.querySelector('[name=transport]:checked')?.value || (window.APP_CONFIG?.defaults?.transport || 'car');

    // Calcula emissão para o modo selecionado
    const co2Kg = window.Calculator.calculateEmission(distance, transport);

    // Render e atualiza campo de saída principal
    const output = $('#co2-output');
    if (output) output.textContent = `${co2Kg.toFixed(2)} kg CO₂`;

    // Preparar dados para renderers
    const carEmission = window.Calculator.calculateEmission(distance, 'car');
    const savings = window.Calculator.calculateSavings(co2Kg, carEmission);

    const resultsData = {
      origin: $('#origin').value.trim(),
      destination: $('#destination').value.trim(),
      distance: distance,
      emission: co2Kg,
      mode: transport,
      savings
    };

    // Render results cards
    if (window.UI && typeof window.UI.renderResults === 'function') {
      const container = $('#results-cards');
      if (container) container.innerHTML = window.UI.renderResults(resultsData);
    }

    // Update compact display (if present) so the compact calculator shows immediate result
    const compactDisplay = document.getElementById('compact-display');
    if (compactDisplay) compactDisplay.textContent = `${co2Kg.toFixed(2)} kg CO₂`;

    // Render comparison
    const modesArray = window.Calculator.calculateAllModes(distance);
    if (window.UI && typeof window.UI.renderComparison === 'function') {
      const comp = $('#comparison-container');
      if (comp) comp.innerHTML = window.UI.renderComparison(modesArray, transport);
    }

    // Render carbon credits
    const credits = window.Calculator.calculateCarbonCredits(co2Kg);
    const prices = window.Calculator.estimateCreditPrice(credits);
    if (window.UI && typeof window.UI.renderCarbonCredits === 'function') {
      const creditsContainer = $('#credits-container');
      if (creditsContainer) creditsContainer.innerHTML = window.UI.renderCarbonCredits({ credits, price: prices });
    }

    // Atualiza detalhamento na tabela
    const breakdown = $('#result-breakdown');
    if (breakdown) {
      const rows = window.Calculator.calculateAllModes(distance).map(r => `
        <tr>
          <td>${escapeHtml(r.mode)}</td>
          <td>${r.emission.toFixed(2)}</td>
          <td>${r.percentageVsCar.toFixed(2)}%</td>
        </tr>`).join('');
      breakdown.innerHTML = rows;
    }

    // Atualiza meter
    const meter = $('#co2-meter');
    if (meter) {
      const max = Math.max(1, co2Kg * 2);
      meter.max = max;
      meter.value = Math.min(max, co2Kg);
    }

    // Clear any errors
    const err = $('#form-error');
    if (err) { err.hidden = true; err.textContent = ''; }
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }

  // Inicialização
  document.addEventListener('DOMContentLoaded', () => {
    const form = $('#calculator-form');
    if (form) form.addEventListener('submit', handleFormSubmit);

    // Se houver demo auto-run, espere e execute uma vez para popular resultados
    setTimeout(() => {
      if (document.getElementById('demo-auto')?.checked) {
        const run = document.getElementById('demo-run');
        if (run) run.click();
      }
    }, 1200);

    // Compact calculator setup: transport selection, autofill e botão calcular
    function setupCompactUI() {
      const compactOrigin = document.getElementById('compact-origin');
      const compactDestination = document.getElementById('compact-destination');
      const compactDistance = document.getElementById('compact-distance');
      const compactHelp = document.getElementById('compact-distance-help');
      const compactBtns = Array.from(document.querySelectorAll('.compact-transport-btn'));
      const compactCalc = document.getElementById('compact-calc');
      const editBtn = document.getElementById('compact-edit-distance');

      if (!compactOrigin || !compactDestination || !compactDistance || !compactCalc) return;

      function setHelpSuccess(msg) { if (compactHelp) { compactHelp.textContent = msg; compactHelp.style.color = 'var(--color-primary)'; } }
      function setHelpWarn(msg) { if (compactHelp) { compactHelp.textContent = msg; compactHelp.style.color = ''; } }

      function setEditInactive() { if (editBtn) { editBtn.setAttribute('aria-pressed', 'false'); editBtn.classList.remove('compact-edit-button--active'); } }
      function setEditActive() { if (editBtn) { editBtn.setAttribute('aria-pressed', 'true'); editBtn.classList.add('compact-edit-button--active'); } }

      // Transport buttons behavior
      compactBtns.forEach(btn => {
        btn.addEventListener('click', () => {
          compactBtns.forEach(b => b.classList.remove('compact-transport-btn--selected'));
          btn.classList.add('compact-transport-btn--selected');
        });
      });

      // Attempt to autofill distance when origin/destination change
      async function tryAutoFill() {
        const o = compactOrigin.value.trim();
        const d = compactDestination.value.trim();
        if (!o || !d) {
          compactDistance.value = '';
          compactDistance.setAttribute('readonly', '');
          setHelpWarn('Preencha origem e destino para buscar distância automaticamente');
          setEditInactive();
          return;
        }

        let dist = null;
        let approx = false;
        if (window.RoutesDB && typeof window.RoutesDB.findDistance === 'function') {
          dist = window.RoutesDB.findDistance(o, d);
        } else {
          dist = (window.getRouteDistance ? window.getRouteDistance(o, d) : null);
        }

        const compactUseRoad = document.getElementById('compact-use-road')?.checked;
        if (compactUseRoad && !(window.CONFIG && window.CONFIG.ROUTING && window.CONFIG.ROUTING.enabled)) {
          setHelpWarn('Roteamento por estrada não ativado no app (CONFIG.ROUTING.enabled = false)');
        }

        if ((dist == null) && compactUseRoad && window.CONFIG && window.CONFIG.ROUTING && window.CONFIG.ROUTING.enabled && window.RoutesDB && typeof window.RoutesDB.fetchRoadDistance === 'function') {
          // try road distance async
          compactDistance.value = '';
          compactDistance.setAttribute('readonly', '');
          setHelpWarn('Buscando distância por estrada…');
          const road = await window.RoutesDB.fetchRoadDistance(o, d);
          if (road != null) {
            compactDistance.value = road;
            compactDistance.setAttribute('readonly', '');
            setHelpSuccess('Distância por estrada preenchida automaticamente');
            setEditInactive();
            return;
          }
        }

        // fallback: estimate via coords if available
        if (dist == null && typeof window.RoutesDB._findCityCoord === 'function') {
          const c1 = window.RoutesDB._findCityCoord(o);
          const c2 = window.RoutesDB._findCityCoord(d);
          if (c1 && c2) { dist = Math.round(window.RoutesDB._haversineKm(c1.lat, c1.lon, c2.lat, c2.lon)); approx = true; }
        }

        if (dist != null) {
          compactDistance.value = dist;
          compactDistance.setAttribute('readonly', '');
          setHelpSuccess(approx ? 'Distância preenchida automaticamente (estimativa, linha reta)' : 'Distância preenchida automaticamente');
          setEditInactive();
        } else {
          compactDistance.value = '';
          compactDistance.setAttribute('readonly', '');
          setHelpWarn('Distância não encontrada — insira manualmente');
          setEditInactive();
        }
      }

      if (editBtn) {
        editBtn.addEventListener('click', () => {
          const active = editBtn.getAttribute('aria-pressed') === 'true';
          if (active) {
            // disable manual editing and re-attempt autofill
            setEditInactive();
            compactDistance.setAttribute('readonly', '');
            tryAutoFill();
            editBtn.focus();
          } else {
            // enable manual editing
            setEditActive();
            compactDistance.removeAttribute('readonly');
            setHelpWarn('Edite a distância manualmente e pressione Calcular');
            compactDistance.focus();
          }
        });
      }

      compactOrigin.addEventListener('input', tryAutoFill);
      compactDestination.addEventListener('input', tryAutoFill);

      // Calculate action — copy values to main form and trigger calculation
      compactCalc.addEventListener('click', () => {
        const selectedMode = document.querySelector('.compact-transport-btn.compact-transport-btn--selected')?.dataset?.mode || 'car';

        // copy to main form fields so the same rendering pipeline is used
        const mainOrigin = document.getElementById('origin');
        const mainDest = document.getElementById('destination');
        const mainDist = document.getElementById('distance');
        const transportRadio = document.querySelector(`[name=transport][value="${selectedMode}"]`);

        if (mainOrigin) mainOrigin.value = compactOrigin.value;
        if (mainDest) mainDest.value = compactDestination.value;
        if (mainDist) mainDist.value = compactDistance.value;
        if (transportRadio) transportRadio.checked = true;

        // Trigger the same submit handler
        if (typeof window.UI.handleFormSubmit === 'function') {
          window.UI.handleFormSubmit();
        } else {
          // fallback: submit the form
          const form = document.getElementById('calculator-form');
          if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
        }
      });
    }

    // Inicializa compact UI
    setupCompactUI();

    // Expose for manual testing
    window.UI = window.UI || {};
    window.UI.handleFormSubmit = handleFormSubmit;
  });
})();