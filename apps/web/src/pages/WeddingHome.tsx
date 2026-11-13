import type { MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { Bouquet, CornerSpray, DetailIcon, FloralDivider } from '../components/Botanicals';

const venueImages = [
  { src: 'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1400&q=85', alt: 'Mesa de boda al aire libre entre árboles' },
  { src: 'https://images.unsplash.com/photo-1464366400600-7168b8af9bc3?auto=format&fit=crop&w=1000&q=85', alt: 'Decoración floral de una boda' },
  { src: 'https://images.unsplash.com/photo-1478146896981-b80fe463b330?auto=format&fit=crop&w=1000&q=85', alt: 'Finca de celebración en el campo' },
];

// Con HashRouter un href="#seccion" se interpreta como una ruta, así que el desplazamiento se hace a mano.
const scrollToSection = (id: string) => (event: MouseEvent) => {
  event.preventDefault();
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
};

export function WeddingHome() {
  return <>
    <section className="wedding-hero" id="inicio">
      <div className="hero-card hero-copy">
        <Bouquet className="hero-bouquet" />
        <p className="eyebrow">Nos casamos</p>
        <p className="names">Sara <span>&amp;</span> Guille</p>
        <p className="date">24 · SEPTIEMBRE · 2026</p>
        <a className="button" href="#cuenta-atras" onClick={scrollToSection('cuenta-atras')}>Guardar la fecha</a>
      </div>
    </section>

    <section className="welcome-section" id="historia">
      <CornerSpray className="welcome-spray welcome-spray-left" />
      <CornerSpray className="welcome-spray welcome-spray-right" />
      <div className="section-inner">
        <p className="eyebrow">Nuestra celebración</p>
        <h1>Un sí bajo los olivos.</h1>
        <p className="lead">Después de tantos caminos compartidos, nos hace inmensamente felices celebrar este día rodeados de nuestra gente favorita. Gracias por formar parte de nuestra historia.</p>
        <FloralDivider />
      </div>
    </section>

    <section className="countdown-section" id="cuenta-atras">
      <div className="section-inner">
        <p className="eyebrow">La cuenta atrás</p>
        <h2>Falta muy poquito</h2>
        <Countdown target="2026-09-24T17:00:00+02:00" />
      </div>
    </section>

    <section className="day-section" id="el-dia">
      <div className="section-inner">
        <p className="eyebrow">El gran día</p>
        <h2>Nos vemos en La Finca del Olivar</h2>
        <div className="timeline">
          <article><time>15:30</time><div><h3>Bienvenida</h3><p>Limonada, música y abrazos bajo los olivos.</p></div></article>
          <article><time>17:00</time><div><h3>Ceremonia</h3><p>Nos daremos el «sí, quiero» en el prado.</p></div></article>
          <article><time>18:00</time><div><h3>Banquete</h3><p>Sabores de temporada, brindis y sobremesa.</p></div></article>
          <article><time>21:30</time><div><h3>Fiesta</h3><p>Baile, luces y una noche para recordar.</p></div></article>
        </div>
      </div>
    </section>

    <section className="venue-section" id="finca">
      <div className="venue-copy">
        <p className="eyebrow">La finca</p>
        <h2>Campo, luz y sobremesa.</h2>
        <p className="lead">La Finca del Olivar es nuestro rincón favorito para celebrar: piedra antigua, caminos de grava, olivos centenarios y una cena bajo las guirnaldas.</p>
        <a className="text-link" href="https://maps.google.com/?q=Camino+de+los+Olivos+18+San+Lorenzo" target="_blank" rel="noreferrer">Cómo llegar ↗</a>
      </div>
      <div className="venue-gallery">{venueImages.map((image, index) => <img className={`venue-image image-${index}`} key={image.src} src={image.src} alt={image.alt} loading="lazy" />)}</div>
    </section>

    <section className="details-section" id="detalles">
      <div className="section-inner">
        <p className="eyebrow">Para disfrutar sin prisas</p>
        <h2>Algunos detalles</h2>
        <div className="detail-cards">
          <article><span><DetailIcon name="attire" /></span><h3>Vestimenta</h3><p>Elegancia campestre. Tonos suaves, tejidos naturales y zapatos cómodos para el jardín.</p></article>
          <article><span><DetailIcon name="stay" /></span><h3>Alojamiento</h3><p>Hemos reunido opciones bonitas cerca de la finca para alargar el fin de semana.</p></article>
          <article><span><DetailIcon name="questions" /></span><h3>¿Dudas?</h3><p>Escríbenos a hola@labodadelolivar.es o busca la mesa de bienvenida el gran día.</p></article>
        </div>
      </div>
    </section>

    <section className="gallery-invitation">
      <div className="section-inner">
        <p className="eyebrow">El álbum de la boda</p>
        <h2>Guarda tu recuerdo</h2>
        <p>Comparte fotos, vídeos y las historias que no queremos olvidar.</p>
        <Link className="button" to="/galeria">Ir a la galería</Link>
      </div>
    </section>

    <section className="game-invitation" id="juego">
      <CornerSpray className="game-invitation-spray game-invitation-spray-left" />
      <CornerSpray className="game-invitation-spray game-invitation-spray-right" />
      <div className="section-inner">
        <p className="eyebrow">Una sorpresa para invitados</p>
        <h2>¿Listas para jugar?</h2>
        <p>Hemos escondido pequeñas historias y retos por toda la finca. Escanea los códigos QR, suma puntos y disfruta de la aventura.</p>
        <Link className="button" to="/juego">Ir al juego de la boda</Link>
      </div>
    </section>
  </>;
}

function Countdown({ target }: { target: string }) {
  const difference = Math.max(0, new Date(target).getTime() - Date.now());
  const days = Math.floor(difference / 86400000);
  const hours = Math.floor(difference / 3600000) % 24;
  const minutes = Math.floor(difference / 60000) % 60;
  return <div className="countdown" aria-label={`Faltan ${days} días, ${hours} horas y ${minutes} minutos`}><div><b>{days}</b><span>días</span></div><div><b>{hours}</b><span>horas</span></div><div><b>{minutes}</b><span>minutos</span></div></div>;
}
