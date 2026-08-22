import React from 'react';
import ReactDOM from 'react-dom/client';
import { HashRouter } from 'react-router-dom';
import { App } from './App';
import './styles/tokens.css';
import './styles/index.css';
import './styles/lowercase.css';
import './styles/wedding.css';
import './styles/wedding-home.css';
import './styles/game.css';
import './pages/Ranking.css';
import './styles/theme.css';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <HashRouter><App /></HashRouter>
  </React.StrictMode>,
);
