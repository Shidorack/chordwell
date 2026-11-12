// Drives a separate headless Edge (own temp profile; never touches the normal browser).
// node tools/cdp.mjs steps.json [width height]
// steps: [{ "js": "await ..." }, { "wait": 500 }, { "shot": "out.png" }]  (server must run: python serve.py --no-browser)
import { spawn } from 'node:child_process';
import { writeFileSync, readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const [stepsFile, w = '390', h = '844'] = process.argv.slice(2);
const steps = JSON.parse(readFileSync(stepsFile, 'utf8'));
const EDGE = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
const port = 9300 + Math.floor(Math.random() * 500);
const prof = mkdtempSync(join(tmpdir(), 'chordwell-cdp-'));
const proc = spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${prof}`, '--no-first-run',
  '--autoplay-policy=no-user-gesture-required', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', `--window-size=${w},${h}`, 'about:blank'], { stdio: 'ignore' });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const kill = () => { try { proc.kill(); } catch {} };
setTimeout(() => { console.log('TIMEOUT'); kill(); process.exit(2); }, 170000);

let ws;
for (let i = 0; i < 40; i++) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    const page = list.find(t => t.type === 'page');
    if (page) { ws = new WebSocket(page.webSocketDebuggerUrl); break; }
  } catch {}
  await sleep(250);
}
await new Promise(r => ws.addEventListener('open', r));
let id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise(res => { const i = ++id; pending.set(i, res); ws.send(JSON.stringify({ id: i, method, params })); });
ws.addEventListener('message', ev => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m.result || m); pending.delete(m.id); }
  if (m.method === 'Runtime.consoleAPICalled') console.log('console.' + m.params.type + ':', m.params.args.map(a => a.value ?? a.description).join(' '));
  if (m.method === 'Runtime.exceptionThrown') console.log('EXCEPTION:', m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
});
await send('Runtime.enable'); await send('Page.enable');
await send('Emulation.setDeviceMetricsOverride', { width: +w, height: +h, deviceScaleFactor: 2, mobile: +w < 600 });
await send('Page.navigate', { url: 'http://localhost:8010/' });
await sleep(1500);
for (const st of steps) {
  if (st.wait) await sleep(st.wait);
  if (st.js) {
    const r = await send('Runtime.evaluate', { expression: `(async () => { ${st.js} })()`, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) console.log('JS ERROR:', r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    else if (r.result?.value !== undefined) console.log('=>', JSON.stringify(r.result.value));
  }
  if (st.shot) {
    const r = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: !!st.full });
    writeFileSync(st.shot, Buffer.from(r.data, 'base64'));
    console.log('shot', st.shot);
  }
}
ws.close(); kill();
process.exit(0);
