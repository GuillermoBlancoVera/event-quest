import { Link, Outlet, useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';

const links = [['el-dia', 'El gran día'], ['finca', 'La finca'], ['detalles', 'Detalles']];

export function Layout() {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(() => localStorage.getItem('theme') === 'dark');
  const navigate = useNavigate();

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem('theme', dark ? 'dark' : 'light');
  }, [dark]);

  const goToSection = (id: string) => {
    navigate('/');
    window.setTimeout(() => document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' }), 0);
  };

  return <>
    <header className="site-header">
      <Link className="brand" to="/">La Boda de <i>Sara &amp; Guille</i></Link>
      <button className="menu" aria-expanded={open} aria-label="Abrir navegación" onClick={() => setOpen(!open)}>☰</button>
      <nav className={open ? 'open' : ''}>
        {links.map(([id, label]) => <a key={id} href={`#${id}`} onClick={(event) => { event.preventDefault(); setOpen(false); goToSection(id); }}>{label}</a>)}
        <Link className="game-link" to="/galeria" onClick={() => setOpen(false)}>Galería</Link>
        <Link className="game-link" to="/juego" onClick={() => setOpen(false)}>Jugar</Link>
        <button className="theme" onClick={() => setDark(!dark)} aria-label="Cambiar tema de color">{dark ? '☼' : '◐'}</button>
      </nav>
    </header>
    <main><Outlet /></main>
    <footer><span>Hecho con cariño para un día inolvidable.</span><a href="#detalles" onClick={(event) => { event.preventDefault(); goToSection('detalles'); }}>¿Necesitas ayuda?</a></footer>
  </>;
}
