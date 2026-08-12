import './analytics.css';

function mountAnalyticsUi(): void {
  const tabs = document.querySelector<HTMLElement>('.tabs');
  const main = document.querySelector<HTMLElement>('.app-shell');
  if (!tabs || !main || document.querySelector('#analyticsTabButton')) return;

  tabs.classList.remove('tabs--three', 'tabs--four');
  tabs.classList.add('tabs--five');

  const button = document.createElement('button');
  button.id = 'analyticsTabButton';
  button.className = 'tab-button';
  button.type = 'button';
  button.setAttribute('role', 'tab');
  button.setAttribute('aria-selected', 'false');
  button.setAttribute('aria-controls', 'analyticsPanel');
  button.textContent = 'Analytics';
  tabs.append(button);

  const panel = document.createElement('section');
  panel.id = 'analyticsPanel';
  panel.className = 'tab-panel';
  panel.hidden = true;
  panel.setAttribute('role', 'tabpanel');
  panel.setAttribute('aria-labelledby', 'analyticsTabButton');
  panel.innerHTML = `
    <header class="panel-header">
      <div>
        <h2>Analytics do acervo</h2>
        <p>Abra o dashboard completo em uma aba do Chrome.</p>
      </div>
      <span class="status-badge">SQLite local</span>
    </header>
    <section class="analytics-launch">
      <div class="analytics-offline-note">Funciona sem conexão com o EGBANET e sem sessão autenticada.</div>
      <h3>Dashboard gráfico</h3>
      <p>Séries temporais de páginas e tipos, barras, distribuições, boxplots, curva normal de referência, regressão linear e qualidade dos dados.</p>
      <button id="analyticsOpenDashboard" class="primary-button" type="button">Abrir Analytics em nova aba</button>
    </section>
  `;
  main.append(panel);

  const otherTabs = Array.from(document.querySelectorAll<HTMLButtonElement>('.tab-button')).filter((tab) => tab !== button);
  const otherPanels = Array.from(document.querySelectorAll<HTMLElement>('.tab-panel')).filter((item) => item !== panel);

  button.addEventListener('click', () => {
    for (const item of otherPanels) item.hidden = true;
    for (const tab of otherTabs) {
      tab.classList.remove('is-active');
      tab.setAttribute('aria-selected', 'false');
    }
    panel.hidden = false;
    button.classList.add('is-active');
    button.setAttribute('aria-selected', 'true');
  });

  for (const tab of otherTabs) {
    tab.addEventListener('click', () => {
      panel.hidden = true;
      button.classList.remove('is-active');
      button.setAttribute('aria-selected', 'false');
    });
  }

  panel.querySelector<HTMLButtonElement>('#analyticsOpenDashboard')!.addEventListener('click', () => {
    window.open(chrome.runtime.getURL('analytics.html'), '_blank', 'noopener');
  });
}

mountAnalyticsUi();
