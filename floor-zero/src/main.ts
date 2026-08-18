import './styles/main.css';
import { Game } from './core/Game';
import { t } from './data/localization';

function hasWebGL(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return !!(
      window.WebGLRenderingContext &&
      (canvas.getContext('webgl2') || canvas.getContext('webgl'))
    );
  } catch {
    return false;
  }
}

function fatal(title: string, body: string): void {
  const container = document.getElementById('app') ?? document.body;
  container.innerHTML = '';
  const panel = document.createElement('div');
  panel.className = 'overlay error';
  const heading = document.createElement('h2');
  heading.textContent = title;
  const message = document.createElement('p');
  message.textContent = body;
  const reload = document.createElement('button');
  reload.className = 'btn';
  reload.textContent = t('error.reload');
  reload.addEventListener('click', () => window.location.reload());
  panel.appendChild(heading);
  panel.appendChild(message);
  panel.appendChild(reload);
  container.appendChild(panel);
}

function start(): void {
  const container = document.getElementById('app');
  if (!container) {
    fatal(t('error.title'), t('error.body'));
    return;
  }

  const boot = document.getElementById('boot');
  boot?.remove();

  if (!hasWebGL()) {
    fatal(t('error.title'), t('error.webgl'));
    return;
  }

  try {
    const game = new Game(container);
    (window as unknown as { __floorZero?: Game }).__floorZero = game;
    void game.boot().catch((error: unknown) => {
      console.error(error);
      fatal(t('error.title'), t('error.body'));
    });
  } catch (error) {
    console.error(error);
    fatal(t('error.title'), t('error.body'));
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', start, { once: true });
} else {
  start();
}
