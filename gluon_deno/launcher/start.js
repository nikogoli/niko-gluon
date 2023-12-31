import { spawn } from 'https://deno.land/std@0.170.0/node/child_process.ts';
import { cyan } from "https://deno.land/std@0.200.0/fmt/colors.ts";

import ConnectCDP from '../lib/cdp.js';
import InjectInto from './inject.js';

const log = (...args) => console.log(`[${cyan('Gluon')}]`, ...args);

const portRange = [ 10000, 60000 ];

export default async (
  browserPath,
  args,
  transport,
  extra,
  onWebSocketClose
) => {
  const port = transport === 'websocket' ? (Math.floor(Math.random() * (portRange[1] - portRange[0] + 1)) + portRange[0]) : null;

  const proc = spawn(browserPath, [
    transport === 'stdio' ? `--remote-debugging-pipe` : `--remote-debugging-port=${port}`,
    ...args
  ].filter(x => x), {
    detached: false,
    stdio: ['ignore', 'pipe', 'pipe', 'pipe', 'pipe']
  });

  log(`connecting to CDP over ${transport === 'stdio' ? 'stdio pipe' : `websocket (${port})`}...`);

  let CDP;
  switch (transport) {
    case 'websocket':
      CDP = await ConnectCDP({ port }, onWebSocketClose);
      break;

    case 'stdio':
      const { 3: pipeWrite, 4: pipeRead } = proc.stdio;
      CDP = await ConnectCDP({ pipe: { pipeWrite, pipeRead } }, onWebSocketClose);
      break;
  }

  return await InjectInto(CDP, proc, transport === 'stdio' ? 'browser' : 'target', extra);
};