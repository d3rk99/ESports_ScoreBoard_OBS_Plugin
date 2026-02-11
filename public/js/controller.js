const ui = {
  team1: {
    name: document.getElementById('team1-name'),
    logo: document.getElementById('team1-logo'),
    score: document.getElementById('team1-score'),
    fontColor: document.getElementById('team1-fontColor'),
    trimColor: document.getElementById('team1-trimColor')
  },
  team2: {
    name: document.getElementById('team2-name'),
    logo: document.getElementById('team2-logo'),
    score: document.getElementById('team2-score'),
    fontColor: document.getElementById('team2-fontColor'),
    trimColor: document.getElementById('team2-trimColor')
  },
  obs: {
    host: document.getElementById('obs-host'),
    port: document.getElementById('obs-port'),
    password: document.getElementById('obs-password'),
    rememberPassword: document.getElementById('obs-remember-password'),
    connect: document.getElementById('obs-connect'),
    disconnect: document.getElementById('obs-disconnect'),
    status: document.getElementById('obs-status'),
    error: document.getElementById('error-status'),
    mapTeam1Name: document.getElementById('map-team1-name'),
    mapTeam2Name: document.getElementById('map-team2-name'),
    mapTeam1Score: document.getElementById('map-team1-score'),
    mapTeam2Score: document.getElementById('map-team2-score'),
    mapTeam1Logo: document.getElementById('map-team1-logo'),
    mapTeam2Logo: document.getElementById('map-team2-logo')
  },
  resetScores: document.getElementById('reset-scores')
};

/** @type {any} */
let currentState = null;

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });

  let payload;
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }

  if (!response.ok) {
    const message = payload?.error || payload?.message || `Request failed: ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function ensureSelectValue(select, value) {
  const hasOption = Array.from(select.options).some((option) => option.value === value);
  select.value = hasOption ? value : '';
}

function renderState(state) {
  currentState = state;
  ui.team1.name.value = state.team1.name;
  ensureSelectValue(ui.team1.logo, state.team1.logo);
  ui.team1.score.textContent = String(state.team1.score);
  ui.team1.fontColor.value = state.team1.fontColor;
  ui.team1.trimColor.value = state.team1.trimColor;

  ui.team2.name.value = state.team2.name;
  ensureSelectValue(ui.team2.logo, state.team2.logo);
  ui.team2.score.textContent = String(state.team2.score);
  ui.team2.fontColor.value = state.team2.fontColor;
  ui.team2.trimColor.value = state.team2.trimColor;

  ui.obs.host.value = state.obs.host;
  ui.obs.port.value = String(state.obs.port);
  ui.obs.rememberPassword.checked = state.obs.rememberPassword;

  ui.obs.mapTeam1Name.value = state.obs.mappings.team1NameSource;
  ui.obs.mapTeam2Name.value = state.obs.mappings.team2NameSource;
  ui.obs.mapTeam1Score.value = state.obs.mappings.team1ScoreSource;
  ui.obs.mapTeam2Score.value = state.obs.mappings.team2ScoreSource;
  ui.obs.mapTeam1Logo.value = state.obs.mappings.team1LogoSource;
  ui.obs.mapTeam2Logo.value = state.obs.mappings.team2LogoSource;
}

function renderObsStatus(status) {
  ui.obs.status.textContent = status.statusText;
  ui.obs.error.textContent = status.lastError || '';
}

async function patchState(patch) {
  try {
    const payload = await requestJson('/api/state', {
      method: 'POST',
      body: JSON.stringify(patch)
    });
    renderState(payload.state);
    renderObsStatus(payload.obsStatus);
  } catch (error) {
    ui.obs.error.textContent = error instanceof Error ? error.message : String(error);
  }
}

async function loadLogos() {
  const { logos } = await requestJson('/api/logos');

  for (const select of [ui.team1.logo, ui.team2.logo]) {
    select.innerHTML = '';

    const noneOption = document.createElement('option');
    noneOption.value = '';
    noneOption.textContent = 'None';
    select.appendChild(noneOption);

    for (const logo of logos) {
      const option = document.createElement('option');
      option.value = logo;
      option.textContent = logo;
      select.appendChild(option);
    }
  }
}

function bindEvents() {
  ui.team1.name.addEventListener('input', () => patchState({ team1: { name: ui.team1.name.value } }));
  ui.team2.name.addEventListener('input', () => patchState({ team2: { name: ui.team2.name.value } }));

  ui.team1.logo.addEventListener('change', () => patchState({ team1: { logo: ui.team1.logo.value } }));
  ui.team2.logo.addEventListener('change', () => patchState({ team2: { logo: ui.team2.logo.value } }));

  ui.team1.fontColor.addEventListener('input', () => patchState({ team1: { fontColor: ui.team1.fontColor.value } }));
  ui.team1.trimColor.addEventListener('input', () => patchState({ team1: { trimColor: ui.team1.trimColor.value } }));
  ui.team2.fontColor.addEventListener('input', () => patchState({ team2: { fontColor: ui.team2.fontColor.value } }));
  ui.team2.trimColor.addEventListener('input', () => patchState({ team2: { trimColor: ui.team2.trimColor.value } }));

  document.querySelectorAll('button[data-score]').forEach((button) => {
    button.addEventListener('click', async () => {
      const side = button.getAttribute('data-score');
      const delta = Number(button.getAttribute('data-delta'));
      const next = Math.max(0, currentState[side].score + delta);
      await patchState({ [side]: { score: next } });
    });
  });

  ui.resetScores.addEventListener('click', async () => {
    const response = await requestJson('/api/scores/reset', { method: 'POST' });
    renderState(response.state);
  });

  const submitObsSettings = () =>
    patchState({
      obs: {
        host: ui.obs.host.value,
        port: Number(ui.obs.port.value),
        rememberPassword: ui.obs.rememberPassword.checked,
        mappings: {
          team1NameSource: ui.obs.mapTeam1Name.value,
          team2NameSource: ui.obs.mapTeam2Name.value,
          team1ScoreSource: ui.obs.mapTeam1Score.value,
          team2ScoreSource: ui.obs.mapTeam2Score.value,
          team1LogoSource: ui.obs.mapTeam1Logo.value,
          team2LogoSource: ui.obs.mapTeam2Logo.value
        }
      }
    });

  [
    ui.obs.host,
    ui.obs.port,
    ui.obs.rememberPassword,
    ui.obs.mapTeam1Name,
    ui.obs.mapTeam2Name,
    ui.obs.mapTeam1Score,
    ui.obs.mapTeam2Score,
    ui.obs.mapTeam1Logo,
    ui.obs.mapTeam2Logo
  ].forEach((el) => {
    el.addEventListener('change', submitObsSettings);
  });

  ui.obs.connect.addEventListener('click', async () => {
    const payload = await requestJson('/api/obs/connect', {
      method: 'POST',
      body: JSON.stringify({
        host: ui.obs.host.value,
        port: Number(ui.obs.port.value),
        password: ui.obs.password.value,
        rememberPassword: ui.obs.rememberPassword.checked
      })
    });
    renderState(payload.state);
    renderObsStatus(payload.obsStatus);
  });

  ui.obs.disconnect.addEventListener('click', async () => {
    const payload = await requestJson('/api/obs/disconnect', { method: 'POST' });
    renderObsStatus(payload.obsStatus);
  });
}

function connectLiveChannel() {
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);

  socket.addEventListener('close', () => {
    setTimeout(connectLiveChannel, 1000);
  });

  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'state') {
      renderState(msg.payload);
    }
    if (msg.type === 'obs-status') {
      renderObsStatus(msg.payload);
    }
  });
}

async function main() {
  await loadLogos();
  const initial = await requestJson('/api/state');
  renderState(initial.state);
  renderObsStatus(initial.obsStatus);
  bindEvents();
  connectLiveChannel();
}

void main();
