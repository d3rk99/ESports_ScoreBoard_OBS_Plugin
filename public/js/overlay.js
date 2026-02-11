const root = document.querySelector('.overlay');
const side = root.dataset.team;
const logoEl = document.getElementById('team-logo');
const nameEl = document.getElementById('team-name');
const scoreEl = document.getElementById('team-score');

function apply(state) {
  const team = state[side];
  if (team.logo) {
    logoEl.src = `/assets/logos/${team.logo}`;
    logoEl.style.display = '';
  } else {
    logoEl.removeAttribute('src');
    logoEl.style.display = 'none';
  }
  nameEl.textContent = team.name;
  scoreEl.textContent = String(team.score);

  nameEl.style.color = team.fontColor;
  nameEl.style.webkitTextStrokeColor = team.trimColor;
  nameEl.style.textShadow = `-1px -1px 0 ${team.trimColor}, 1px -1px 0 ${team.trimColor}, -1px 1px 0 ${team.trimColor}, 1px 1px 0 ${team.trimColor}`;
}

async function loadInitial() {
  const response = await fetch('/api/state');
  const data = await response.json();
  apply(data.state);
}

function connectLiveChannel() {
  const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}`);

  socket.addEventListener('close', () => {
    setTimeout(connectLiveChannel, 1000);
  });

  socket.addEventListener('message', (event) => {
    const msg = JSON.parse(event.data);
    if (msg.type === 'state') {
      apply(msg.payload);
    }
  });
}

void loadInitial();
connectLiveChannel();
