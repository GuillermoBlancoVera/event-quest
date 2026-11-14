import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { App } from './App';
import './styles/tokens.css';
import './styles/index.css';
import './styles/lowercase.css';
import './styles/wedding.css';
import './styles/wedding-home.css';
import './pages/Ranking.css';

const basename = import.meta.env.BASE_URL.replace(/\/$/, '');

// Links and QR codes shared before the site dropped the "#" (…/#/juego/reto/3) keep working: rewrite them once on load.
if (window.location.hash.startsWith('#/')) {
  window.history.replaceState(null, '', `${basename}${window.location.hash.slice(1)}`);
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={basename}><App /></BrowserRouter>
  </React.StrictMode>,
);
