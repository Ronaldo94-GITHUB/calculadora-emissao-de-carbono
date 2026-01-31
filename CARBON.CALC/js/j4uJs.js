/* js/j4uJs.js
   Global `UI` utilities and renderers (j4uJs)

   Exports/merges into window.UI. Provides:
   - Utility methods: formatNumber, formatCurrency, showElement, hideElement, scrollToElement
   - Rendering methods: renderResults, renderComparison, renderCarbonCredits
   - Loading helpers: showLoading, hideLoading

   HTML conventions used by renderers:
   - Results card: <div class="results__card results__card--route"> ... </div>
     - BEM used for internal elements: .results__card__title, .results__card__value
   - Comparison items: <div class="comparison__item [--selected]"> ... </div>
   - Carbon credits grid: two cards inside a container with class="credits__grid"
*/
(function () {
  'use strict';

  // Utility: escape HTML
  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, (s) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }

  // --- Utility methods ---
  function formatNumber(number, decimals = 2) {
    // Uses pt-BR formatting and ensures decimals
    if (typeof number !== 'number' || Number.isNaN(number)) return '—';
    return number.toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  function formatCurrency(value) {
    if (typeof value !== 'number' || Number.isNaN(value)) return '—';
    return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  function showElement(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.remove('hidden');
  }

  function hideElement(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.add('hidden');
  }

  function scrollToElement(elementId) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  // --- Rendering methods ---
  function renderResults(data = {}) {
    // data: { origin, destination, distance, emission, mode, savings }
    // Uses CONFIG.TRANSPORT_MODES for metadata (icon, label, color)
    const modes = (window.CONFIG && window.CONFIG.TRANSPORT_MODES) || {};
    const modeMeta = modes[data.mode] || { label: data.mode || '—', icon: '', color: '#10b981' };

    const origin = escapeHtml(data.origin || '—');
    const destination = escapeHtml(data.destination || '—');
    const distance = typeof data.distance === 'number' ? formatNumber(data.distance, 2) + ' km' : '—';
    const emissionVal = typeof data.emission === 'number' ? data.emission : null;
    const emission = emissionVal != null ? formatNumber(emissionVal, 2) + ' kg' : '—';

    // derive credits & price inline when we have an emission value
    let creditsHtml = '';
    if (emissionVal != null && window.Calculator) {
      try {
        const credits = window.Calculator.calculateCarbonCredits(emissionVal);
        const price = window.Calculator.estimateCreditPrice(credits);
        creditsHtml = `
          <div class="results__card results__card--credits-inline">
            <div class="results__card__title">Créditos necessários</div>
            <div class="results__card__value">${formatNumber(credits, 4)} créditos • ${formatCurrency(price.average)}</div>
            <div class="results__card__help">Faixa: ${formatCurrency(price.min)} — ${formatCurrency(price.max)}</div>
          </div>
        `;
      } catch (err) {
        // ignore if Calculator not fully available
      }
    }

    const savingsHtml = (data.mode !== 'car' && data.savings && data.savings.savedKg > 0)
      ? `<div class="results__card results__card--savings">
           <div class="results__card__title">Economia</div>
           <div class="results__card__value">${formatNumber(data.savings.savedKg, 2)} kg (${formatNumber(data.savings.percentage, 2)}%)</div>
         </div>`
      : '';

    // Build HTML for cards
    const html = `
      <div class="results__card results__card--route">
        <div class="results__card__title">Rota</div>
        <div class="results__card__value">${origin} → ${destination}</div>
      </div>

      <div class="results__card results__card--distance">
        <div class="results__card__title">Distância</div>
        <div class="results__card__value">${distance}</div>
      </div>

      <div class="results__card results__card--emission">
        <div class="results__card__title">Emissão (CO₂)</div>
        <div class="results__card__value">🌿 ${emission}</div>
      </div>

      ${creditsHtml}

      <div class="results__card results__card--transport" style="border-left: 4px solid ${modeMeta.color}">
        <div class="results__card__title">Transporte</div>
        <div class="results__card__value">${modeMeta.icon} ${escapeHtml(modeMeta.label)}</div>
      </div>

      ${savingsHtml}
    `;

    return html;
  }

  function renderComparison(modesArray = [], selectedMode = '') {
    // modesArray: [{mode, emission, percentageVsCar}, ...]
    if (!Array.isArray(modesArray) || modesArray.length === 0) return '';

    const maxEmission = Math.max(...modesArray.map(m => m.emission || 0), 1);
    const modesMeta = (window.CONFIG && window.CONFIG.TRANSPORT_MODES) || {};

    const itemsHtml = modesArray.map(m => {
      const meta = modesMeta[m.mode] || { label: m.mode, icon: '', color: '#10b981' };
      const isSelected = m.mode === selectedMode;
      const percentOfMax = (m.emission / maxEmission) * 100;

      // Color-code
      let barColor = '#10b981'; // green
      if (percentOfMax > 100) barColor = '#ef4444';
      else if (percentOfMax > 75) barColor = '#f97316'; // orange
      else if (percentOfMax > 25) barColor = '#f59e0b'; // yellow

      return `
        <div class="comparison__item ${isSelected ? 'comparison__item--selected' : ''}" data-mode="${escapeHtml(m.mode)}">
          <div class="comparison__header">
            <div class="comparison__icon">${meta.icon}</div>
            <div class="comparison__meta">
              <div class="comparison__label">${escapeHtml(meta.label)}</div>
              <div class="comparison__stats">${formatNumber(m.emission, 2)} kg • ${formatNumber(m.percentageVsCar, 2)}%</div>
            </div>
            ${isSelected ? '<div class="comparison__badge">Seleccionado</div>' : ''}
          </div>

          <div class="comparison__bar" style="background: #e6e9ef; border-radius: .5rem; height: .75rem; overflow: hidden; margin-top: .75rem;">
            <div class="comparison__bar__fill" style="width: ${Math.min(200, percentOfMax)}%; background: ${barColor}; height: 100%;"></div>
          </div>
        </div>
      `;
    }).join('');

    const tip = `<div class="comparison__tip">Dica: escolha meios de transporte com menor emissão para reduzir sua pegada de carbono.</div>`;

    return `<div class="comparison__list">${itemsHtml}</div>${tip}`;
  }

  function renderCarbonCredits(creditsData = {}) {
    // creditsData: { credits, price: { min, max, average } }
    const credits = typeof creditsData.credits === 'number' ? creditsData.credits : 0;
    const price = creditsData.price || { min: 0, max: 0, average: 0 };

    const html = `
      <div class="credits__grid">
        <div class="results__card results__card--credits">
          <div class="results__card__title">Créditos Necessários</div>
          <div class="results__card__value" style="font-size:1.5rem; font-weight:700;">${formatNumber(credits, 4)}</div>
          <div class="results__card__help">1 crédito = ${((window.CONFIG && window.CONFIG.CARBON_CREDIT) ? window.CONFIG.CARBON_CREDIT.KG_PER_CREDIT : 1000)} kg CO₂</div>
        </div>

        <div class="results__card results__card--credit-price">
          <div class="results__card__title">Preço estimado (média)</div>
          <div class="results__card__value">${formatCurrency(price.average)}</div>
          <div class="results__card__help">Faixa: ${formatCurrency(price.min)} — ${formatCurrency(price.max)}</div>
        </div>
      </div>

      <div class="credits__info">Créditos de carbono ajudam a financiar projetos que removem ou evitam emissões. Esta é uma estimativa para fins educativos.</div>

      <div class="credits__actions"><button class="button" id="btn-compensate">Compensar Emissões</button></div>
    `;

    return html;
  }

  // Render a summary grid for a list of routes with emissions per mode and credits
  function renderRoutesSummary(routes = []) {
    if (!Array.isArray(routes) || routes.length === 0) return '';
    const modesMeta = (window.CONFIG && window.CONFIG.TRANSPORT_MODES) || {};

    const cardsHtml = routes.map(r => {
      const modeRows = (r.byMode || []).map(m => {
        const meta = modesMeta[m.mode] || { label: m.mode, icon: '', color: '#10b981' };
        const isCar = m.mode === 'car';
        const percentVsCar = (r.carEmission && r.carEmission > 0) ? ((m.emission / r.carEmission) * 100) : 0;
        return `
          <div style="display:flex;justify-content:space-between;align-items:center;padding:.25rem 0;border-top:1px solid rgba(15,23,32,0.03);">
            <div style="display:flex;align-items:center;gap:.5rem">${meta.icon} <strong>${escapeHtml(meta.label)}</strong></div>
            <div style="text-align:right">${formatNumber(m.emission, 2)} kg${isCar ? ' (base)' : ` • ${formatNumber(percentVsCar,1)}%`}</div>
          </div>`;
      }).join('');

      return `
        <div class="results__card">
          <div class="results__card__title">${escapeHtml(r.origin)} → ${escapeHtml(r.destination)}</div>
          <div class="results__card__value">${formatNumber(r.distance,2)} km</div>
          <div style="margin-top:.5rem"><strong>Emissão (carro):</strong> ${formatNumber(r.carEmission,2)} kg</div>
          <div style="margin-top:.5rem">${modeRows}</div>
          <div style="margin-top:.5rem;color:#6b7280">Créditos: ${formatNumber(r.credits,3)} • Preço média ${formatCurrency(r.price.average)}</div>
          <div class="credits__actions" style="margin-top:.5rem;">
            <button class="button btn-compensate-route" data-origin="${escapeHtml(r.origin)}" data-destination="${escapeHtml(r.destination)}" data-distance="${r.distance}" data-emission="${r.carEmission}" data-credits="${r.credits}" data-price="${r.price.average}">Compensar</button>
          </div>
        </div>
      `;
    }).join('\n');

    return `<div class="results-cards">${cardsHtml}</div>`;
  }

  function renderRoutesSummaryList(routes) {
    const el = document.getElementById('routes-summary-list');
    if (!el) return '';
    el.innerHTML = renderRoutesSummary(routes);
    return el.innerHTML;
  }

  // --- Loading helpers ---
  const SPINNER_HTML = '<span class="spinner" aria-hidden="true"></span> Calculando...';

  function showLoading(buttonElement) {
    if (!buttonElement) return;
    // Save original text
    if (!buttonElement.dataset.originalText) buttonElement.dataset.originalText = buttonElement.innerHTML;
    buttonElement.disabled = true;
    buttonElement.innerHTML = SPINNER_HTML;
  }

  function hideLoading(buttonElement) {
    if (!buttonElement) return;
    buttonElement.disabled = false;
    if (buttonElement.dataset.originalText) {
      buttonElement.innerHTML = buttonElement.dataset.originalText;
      delete buttonElement.dataset.originalText;
    }
  }

  // Merge into existing window.UI or create new
  window.UI = Object.assign(window.UI || {}, {
    formatNumber,
    formatCurrency,
    showElement,
    hideElement,
    scrollToElement,
    renderResults,
    renderComparison,
    renderCarbonCredits,
    showLoading,
    hideLoading
  });

})();