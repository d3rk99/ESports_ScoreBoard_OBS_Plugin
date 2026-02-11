import express from 'express';
import { createServer } from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import OBSWebSocket from 'obs-websocket-js';

type TeamState = {
  name: string;
  score: number;
  logo: string;
  fontColor: string;
  trimColor: string;
};

type ObsConfig = {
  host: string;
  port: number;
  password: string;
  rememberPassword: boolean;
  mappings: {
    team1NameSource: string;
    team2NameSource: string;
    team1ScoreSource: string;
    team2ScoreSource: string;
    team1LogoSource: string;
    team2LogoSource: string;
  };
};

type AppState = {
  team1: TeamState;
  team2: TeamState;
  obs: ObsConfig;
};

type PublicObsStatus = {
  connected: boolean;
  statusText: string;
  lastError: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const publicDir = path.join(rootDir, 'public');
const logosDir = path.join(rootDir, 'assets', 'logos');
const stateFile = path.join(rootDir, 'data', 'state.json');
const serverPort = Number(process.env.PORT || 3000);

const defaultState: AppState = {
  team1: {
    name: 'Team 1',
    score: 0,
    logo: '',
    fontColor: '#ffffff',
    trimColor: '#1e3a8a'
  },
  team2: {
    name: 'Team 2',
    score: 0,
    logo: '',
    fontColor: '#ffffff',
    trimColor: '#7f1d1d'
  },
  obs: {
    host: '127.0.0.1',
    port: 4455,
    password: '',
    rememberPassword: false,
    mappings: {
      team1NameSource: '',
      team2NameSource: '',
      team1ScoreSource: '',
      team2ScoreSource: '',
      team1LogoSource: '',
      team2LogoSource: ''
    }
  }
};

let appState: AppState = structuredClone(defaultState);
let obsStatus: PublicObsStatus = {
  connected: false,
  statusText: 'Disconnected',
  lastError: ''
};

const obs = new OBSWebSocket();
let stateSaveTimer: NodeJS.Timeout | undefined;

function sanitizeHexColor(value: string, fallback: string): string {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
}

function sanitizeLogoName(value: string, fallback: string): string {
  const base = path.basename((value || '').trim());
  if (!base) return '';
  if (!base.toLowerCase().endsWith('.png')) return fallback;
  return base;
}

function sanitizePartialState(input: Partial<AppState>): Partial<AppState> {
  const out: Partial<AppState> = {};

  if (input.team1) {
    out.team1 = {
      ...input.team1,
      score: Math.max(0, Number(input.team1.score ?? appState.team1.score) || 0),
      logo: sanitizeLogoName(input.team1.logo ?? appState.team1.logo, appState.team1.logo),
      fontColor: sanitizeHexColor(input.team1.fontColor ?? appState.team1.fontColor, appState.team1.fontColor),
      trimColor: sanitizeHexColor(input.team1.trimColor ?? appState.team1.trimColor, appState.team1.trimColor)
    };
  }

  if (input.team2) {
    out.team2 = {
      ...input.team2,
      score: Math.max(0, Number(input.team2.score ?? appState.team2.score) || 0),
      logo: sanitizeLogoName(input.team2.logo ?? appState.team2.logo, appState.team2.logo),
      fontColor: sanitizeHexColor(input.team2.fontColor ?? appState.team2.fontColor, appState.team2.fontColor),
      trimColor: sanitizeHexColor(input.team2.trimColor ?? appState.team2.trimColor, appState.team2.trimColor)
    };
  }

  if (input.obs) {
    out.obs = {
      ...input.obs,
      port: Number(input.obs.port ?? appState.obs.port) || appState.obs.port,
      rememberPassword: Boolean(input.obs.rememberPassword ?? appState.obs.rememberPassword),
      mappings: {
        ...appState.obs.mappings,
        ...(input.obs.mappings ?? {})
      }
    };
  }

  return out;
}

function getPublicState(): AppState {
  return {
    ...appState,
    obs: {
      ...appState.obs,
      password: ''
    }
  };
}

function broadcast(type: string, payload: unknown): void {
  const message = JSON.stringify({ type, payload });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

function scheduleStateSave(): void {
  if (stateSaveTimer) {
    clearTimeout(stateSaveTimer);
  }

  stateSaveTimer = setTimeout(async () => {
    const persisted: AppState = {
      ...appState,
      obs: {
        ...appState.obs,
        password: appState.obs.rememberPassword ? appState.obs.password : ''
      }
    };
    await fs.mkdir(path.dirname(stateFile), { recursive: true });
    await fs.writeFile(stateFile, JSON.stringify(persisted, null, 2), 'utf-8');
  }, 120);
}

async function loadStateFromDisk(): Promise<void> {
  try {
    const raw = await fs.readFile(stateFile, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const sanitized = sanitizePartialState(parsed);

    appState = {
      ...structuredClone(defaultState),
      ...sanitized,
      team1: {
        ...defaultState.team1,
        ...(sanitized.team1 ?? {})
      },
      team2: {
        ...defaultState.team2,
        ...(sanitized.team2 ?? {})
      },
      obs: {
        ...defaultState.obs,
        ...(sanitized.obs ?? {}),
        mappings: {
          ...defaultState.obs.mappings,
          ...((parsed.obs?.mappings ?? {}) as ObsConfig['mappings'])
        }
      }
    };
  } catch {
    appState = structuredClone(defaultState);
  }
}

async function getLogoNames(): Promise<string[]> {
  const files = await fs.readdir(logosDir, { withFileTypes: true });
  return files
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith('.png'))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));
}

function logoPathForFile(fileName: string): string {
  return path.resolve(logosDir, fileName);
}

async function setObsText(inputName: string, text: string): Promise<void> {
  if (!inputName.trim()) return;
  await obs.call('SetInputSettings', {
    inputName,
    inputSettings: { text },
    overlay: true
  });
}

async function setObsImage(inputName: string, file: string): Promise<void> {
  if (!inputName.trim()) return;
  await obs.call('SetInputSettings', {
    inputName,
    inputSettings: { file },
    overlay: true
  });
}

async function syncObsSources(): Promise<void> {
  if (!obsStatus.connected) return;

  try {
    await Promise.all([
      setObsText(appState.obs.mappings.team1NameSource, appState.team1.name),
      setObsText(appState.obs.mappings.team2NameSource, appState.team2.name),
      setObsText(appState.obs.mappings.team1ScoreSource, String(appState.team1.score)),
      setObsText(appState.obs.mappings.team2ScoreSource, String(appState.team2.score)),
      setObsImage(appState.obs.mappings.team1LogoSource, logoPathForFile(appState.team1.logo)),
      setObsImage(appState.obs.mappings.team2LogoSource, logoPathForFile(appState.team2.logo))
    ]);

    obsStatus.lastError = '';
    obsStatus.statusText = 'Connected';
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    obsStatus.lastError = `OBS update error (verify mapped source names): ${message}`;
    obsStatus.statusText = 'Connected with source mapping errors';
  }

  broadcast('obs-status', obsStatus);
}

async function connectObs(host: string, port: number, password: string): Promise<void> {
  try {
    const address = `ws://${host}:${port}`;
    await obs.connect(address, password);
    obsStatus = {
      connected: true,
      statusText: `Connected to ${host}:${port}`,
      lastError: ''
    };
    await syncObsSources();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    obsStatus = {
      connected: false,
      statusText: 'Disconnected',
      lastError: `Failed to connect: ${message}`
    };
  }

  broadcast('obs-status', obsStatus);
}

const app = express();
const httpServer = createServer(app);
const wss = new WebSocketServer({ server: httpServer });

obs.on('ConnectionClosed', () => {
  obsStatus = {
    connected: false,
    statusText: 'Disconnected',
    lastError: obsStatus.lastError
  };
  broadcast('obs-status', obsStatus);
});

app.use(express.json());
app.use('/assets', express.static(path.join(rootDir, 'assets')));
app.use(express.static(publicDir));

app.get('/api/logos', async (_req, res) => {
  try {
    const logos = await getLogoNames();
    res.json({ logos });
  } catch (error) {
    res.status(500).json({ logos: [], error: String(error) });
  }
});

app.get('/api/state', (_req, res) => {
  res.json({ state: getPublicState(), obsStatus });
});

app.post('/api/state', async (req, res) => {
  const update = sanitizePartialState(req.body as Partial<AppState>);

  appState = {
    ...appState,
    ...update,
    team1: { ...appState.team1, ...(update.team1 ?? {}) },
    team2: { ...appState.team2, ...(update.team2 ?? {}) },
    obs: {
      ...appState.obs,
      ...(update.obs ?? {}),
      mappings: {
        ...appState.obs.mappings,
        ...(update.obs?.mappings ?? {})
      }
    }
  };

  if (update.obs && typeof req.body.obs?.password === 'string') {
    appState.obs.password = req.body.obs.password;
  }

  const logos = await getLogoNames().catch(() => [] as string[]);
  if (logos.length > 0) {
    if (appState.team1.logo && !logos.includes(appState.team1.logo)) {
      appState.team1.logo = logos[0];
    }
    if (appState.team2.logo && !logos.includes(appState.team2.logo)) {
      appState.team2.logo = logos[0];
    }
  } else {
    appState.team1.logo = '';
    appState.team2.logo = '';
  }

  scheduleStateSave();
  broadcast('state', getPublicState());
  await syncObsSources();
  res.json({ ok: true, state: getPublicState(), obsStatus });
});

app.post('/api/scores/reset', async (_req, res) => {
  appState.team1.score = 0;
  appState.team2.score = 0;
  scheduleStateSave();
  broadcast('state', getPublicState());
  await syncObsSources();
  res.json({ ok: true, state: getPublicState() });
});

app.post('/api/obs/connect', async (req, res) => {
  const host = String(req.body?.host || appState.obs.host || '127.0.0.1');
  const port = Number(req.body?.port || appState.obs.port || 4455);
  const password = String(req.body?.password ?? appState.obs.password ?? '');

  appState.obs.host = host;
  appState.obs.port = port;
  appState.obs.password = password;
  appState.obs.rememberPassword = Boolean(req.body?.rememberPassword ?? appState.obs.rememberPassword);

  scheduleStateSave();
  await connectObs(host, port, password);
  res.json({ ok: obsStatus.connected, obsStatus, state: getPublicState() });
});

app.post('/api/obs/disconnect', async (_req, res) => {
  if (obsStatus.connected) {
    await obs.disconnect();
  }

  obsStatus = {
    connected: false,
    statusText: 'Disconnected',
    lastError: ''
  };

  broadcast('obs-status', obsStatus);
  res.json({ ok: true, obsStatus });
});

app.get('/dock.html', (_req, res) => {
  res.sendFile(path.join(publicDir, 'controller.html'));
});

wss.on('connection', (socket: WebSocket) => {
  socket.send(JSON.stringify({ type: 'state', payload: getPublicState() }));
  socket.send(JSON.stringify({ type: 'obs-status', payload: obsStatus }));
});

async function bootstrap(): Promise<void> {
  await fs.mkdir(logosDir, { recursive: true });
  await loadStateFromDisk();

  const logos = await getLogoNames().catch(() => [] as string[]);
  if (logos.length > 0) {
    if (appState.team1.logo && !logos.includes(appState.team1.logo)) appState.team1.logo = logos[0];
    if (appState.team2.logo && !logos.includes(appState.team2.logo)) appState.team2.logo = logos[0];
  } else {
    appState.team1.logo = '';
    appState.team2.logo = '';
  }

  httpServer.listen(serverPort, () => {
    console.log(`Esports Scoreboard OBS Tool running on http://localhost:${serverPort}`);
    console.log(`Dock URL: http://localhost:${serverPort}/dock.html`);
    console.log(`Team 1 Overlay: http://localhost:${serverPort}/team1.html`);
    console.log(`Team 2 Overlay: http://localhost:${serverPort}/team2.html`);
  });
}

void bootstrap();
