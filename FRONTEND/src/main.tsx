import { createRoot } from 'react-dom/client';
import { RouterProvider } from '@tanstack/react-router';
import { getRouter } from './router';
import './styles.css';

document.addEventListener('contextmenu', event => {
  event.preventDefault();
}, { capture: true });

document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  const osKeyPressed = typeof event.getModifierState === 'function' && event.getModifierState('OS');

  // Evita que o WebView abra a tela de impressao por atalho.
  if (key === 'p' && (event.ctrlKey || event.metaKey || osKeyPressed)) {
    event.preventDefault();
    event.stopPropagation();
  }
}, { capture: true });

const router = getRouter();

createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />,
);
