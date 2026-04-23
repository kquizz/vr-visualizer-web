/** On-screen debug log — visible even without dev tools / in VR flat overlay */

const el = document.getElementById('debug-log') as HTMLDivElement;
let enabled = false;

export function enableDebug(): void {
  enabled = true;
  el.style.display = 'block';
}

export function dbg(msg: string): void {
  const ts = new Date().toLocaleTimeString('en-US', { hour12: false });
  const line = `[${ts}] ${msg}`;
  console.log(line);
  if (enabled) {
    el.textContent += line + '\n';
    el.scrollTop = el.scrollHeight;
  }
}
