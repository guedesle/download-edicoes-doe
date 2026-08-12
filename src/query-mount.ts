function mountQueryUi(): void {
  const tabs = document.querySelector<HTMLElement>('.tabs');
  const main = document.querySelector<HTMLElement>('.app-shell');
  if (!tabs || !main || document.querySelector('#queryTabButton')) return;

  tabs.classList.remove('tabs--three');
  tabs.classList.add('tabs--four');

  const button = document.createElement('button');
  button.id = 'queryTabButton';
  button.className = 'tab-button';
  button.type = 'button';
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', 'false');
  button.setAttribute('aria-controls', 'queryPanel');
  button.textContent = 'Consulta';
  tabs.append(button);

  const panel = document.createElement('section');
  panel.id = 'queryPanel';
  panel.className = 'tab-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', 'queryTabButton');
  panel.innerHTML = `
    <header class="panel-header">
      <div>
        <h2>Consulta do acervo</h2>
        <p>Filtre o SQLite local sem alterar os dados de origem.</p>
      </div>
      <span class="status-badge">Somente leitura</span>
    </header>

    <form id="queryForm" class="batch-form query-form">
      <div class="form-grid form-grid--two">
        <label class="form-field">
          <span>Data inicial</span>
          <input id="queryStartDate" type="date" />
        </label>
        <label class="form-field">
          <span>Data final</span>
          <input id="queryEndDate" type="date" />
        </label>
      </div>

      <div class="form-grid form-grid--two">
        <label class="form-field">
          <span>Número da edição</span>
          <input id="queryEditionNumber" type="text" inputmode="numeric" placeholder="Exato" />
        </label>
        <label class="form-field">
          <span>ID EGBANET</span>
          <input id="queryEgbanetId" type="text" inputmode="numeric" placeholder="Exato" />
        </label>
      </div>

      <label class="form-field">
        <span>Tipo de edição</span>
        <select id="queryEditionType"><option value="">Todos</option></select>
      </label>

      <div class="form-grid form-grid--two">
        <label class="form-field">
          <span>Suplemento</span>
          <select id="querySupplement">
            <option value="any">Todos</option>
            <option value="yes">Somente suplementos</option>
            <option value="no">Sem suplemento</option>
            <option value="unknown">Não informado</option>
          </select>
        </label>
        <label class="form-field">
          <span>Arquivos</span>
          <select id="queryAvailability">
            <option value="any">Qualquer disponibilidade</option>
            <option value="normal">Normal disponível</option>
            <option value="signed">Assinado disponível</option>
            <option value="both">Normal + assinado</option>
            <option value="some">Algum arquivo disponível</option>
            <option value="none">Sem arquivos</option>
          </select>
        </label>
      </div>

      <div class="actions query-actions">
        <button id="queryClearButton" class="secondary-button" type="button">Limpar</button>
        <button id="querySubmitButton" class="primary-button" type="submit">Consultar</button>
      </div>
    </form>

    <p id="queryErrorBox" class="error-box" hidden></p>

    <section class="summary-grid query-summary" aria-label="Totais do filtro atual">
      <article class="summary-card"><span class="summary-label">Edições</span><strong id="querySummaryEditions">0</strong></article>
      <article class="summary-card"><span class="summary-label">Páginas</span><strong id="querySummaryPages">0</strong></article>
      <article class="summary-card"><span class="summary-label">Arquivos disponíveis</span><strong id="querySummaryFiles">0</strong></article>
      <article class="summary-card"><span class="summary-label">Volume conhecido</span><strong id="querySummaryBytes">0 MB</strong></article>
    </section>

    <section class="query-results">
      <header class="query-results-header">
        <div><span class="summary-label">Resultado</span><strong id="queryResultCount">0 edição(ões)</strong></div>
        <span id="queryPageLabel" class="status-badge">Página 0 de 0</span>
      </header>
      <div class="query-table-wrap">
        <table class="query-table">
          <thead>
            <tr><th>Data</th><th>Edição</th><th>Tipo</th><th>Págs.</th><th>Normal</th><th>Assinado</th><th>ID</th></tr>
          </thead>
          <tbody id="queryTableBody"><tr><td colspan="7" class="query-empty">Abra a aba para consultar o acervo.</td></tr></tbody>
        </table>
      </div>
      <footer class="query-pagination">
        <button id="queryPrevButton" class="secondary-button" type="button" disabled>Anterior</button>
        <button id="queryNextButton" class="secondary-button" type="button" disabled>Próxima</button>
      </footer>
    </section>

    <p class="helper-text">A consulta usa 25 registros por página. Exportação CSV e Excel entra no próximo incremento da Fase 8.2.</p>
  `;
  main.append(panel);
}

mountQueryUi();
void import('./query-ui');
