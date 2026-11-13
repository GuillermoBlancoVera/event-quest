import type { ReactNode } from 'react';
import './Botanicals.css';

/**
 * Ilustraciones botánicas de otoño dibujadas en SVG.
 * Todo es decorativo (aria-hidden) y toma sus colores de la paleta de tokens.css.
 */

type Tone = 'terracotta' | 'rust' | 'mustard' | 'honey' | 'burgundy' | 'sage' | 'moss' | 'blush' | 'cream';

const round = (value: number) => Math.round(value * 100) / 100;

const leafPath = (length: number, width: number) => {
  const l = round(length);
  const w = round(width);
  return `M0 0C${w} ${round(-l * 0.2)} ${round(w * 0.9)} ${round(-l * 0.66)} 0 ${-l}C${round(-w * 0.9)} ${round(-l * 0.66)} ${-w} ${round(-l * 0.2)} 0 0Z`;
};

const petalPath = (length: number, width: number) => {
  const l = round(length);
  const w = round(width);
  return `M0 0C${w} ${round(-l * 0.35)} ${w} ${round(-l * 0.92)} 0 ${-l}C${-w} ${round(-l * 0.92)} ${-w} ${round(-l * 0.35)} 0 0Z`;
};

function Leaf({ x, y, angle, length, tone }: { x: number; y: number; angle: number; length: number; tone: Tone }) {
  return <g transform={`translate(${round(x)} ${round(y)}) rotate(${round(angle)})`}>
    <path className={`bot-fill-${tone}`} d={leafPath(length, length * 0.3)} />
    <path className="bot-vein" d={`M0 ${round(-length * 0.08)}V${round(-length * 0.78)}`} />
  </g>;
}

type SprigProps = {
  x: number;
  y: number;
  /** Grados respecto a la vertical: 0 apunta hacia arriba, 90 hacia la derecha. */
  angle: number;
  length: number;
  bend?: number;
  leaves?: number;
  leafSize?: number;
  tone?: Tone;
  altTone?: Tone;
  berries?: boolean;
};

/** Una rama curva con hojas alternas o con bayas. */
function Sprig({ x, y, angle, length, bend = 0, leaves = 6, leafSize = 20, tone = 'sage', altTone, berries = false }: SprigProps) {
  const point = (t: number) => ({ px: 2 * (1 - t) * t * bend, py: -length * t });
  const tangent = (t: number) => Math.atan2(2 * bend * (1 - 2 * t), length) * 180 / Math.PI;
  const items: ReactNode[] = [];

  for (let index = 0; index < leaves; index += 1) {
    const t = 0.24 + index * (0.7 / Math.max(leaves - 1, 1));
    const { px, py } = point(t);
    const side = index % 2 ? 1 : -1;
    const size = leafSize * (1 - 0.38 * t);
    if (berries) {
      const stemAngle = (tangent(t) + side * 58) * Math.PI / 180;
      const bx = px + Math.sin(stemAngle) * size * 0.75;
      const by = py - Math.cos(stemAngle) * size * 0.75;
      items.push(<g key={index}>
        <path className="bot-stem" d={`M${round(px)} ${round(py)}L${round(bx)} ${round(by)}`} />
        <circle className={`bot-fill-${index % 3 === 2 && altTone ? altTone : tone}`} cx={round(bx)} cy={round(by)} r={round(size * 0.26)} />
      </g>);
    } else {
      items.push(<Leaf key={index} x={px} y={py} angle={tangent(t) + side * 46} length={size} tone={index % 3 === 1 && altTone ? altTone : tone} />);
    }
  }

  const tip = point(1);
  return <g transform={`translate(${x} ${y}) rotate(${angle})`}>
    <path className="bot-stem" d={`M0 0Q${round(bend)} ${round(-length / 2)} 0 ${-length}`} />
    {items}
    {berries
      ? <circle className={`bot-fill-${tone}`} cx={round(tip.px)} cy={round(tip.py)} r={round(leafSize * 0.17)} />
      : <Leaf x={tip.px} y={tip.py + leafSize * 0.1} angle={tangent(1)} length={leafSize * 0.62} tone={tone} />}
  </g>;
}

/** Espiga de trigo: muy de campo. */
function Wheat({ x, y, angle, length, bend = 0 }: { x: number; y: number; angle: number; length: number; bend?: number }) {
  const grains: ReactNode[] = [];
  const count = 5;
  for (let index = 0; index < count; index += 1) {
    const t = 0.56 + index * 0.09;
    const px = 2 * (1 - t) * t * bend;
    const py = -length * t;
    const lean = Math.atan2(2 * bend * (1 - 2 * t), length) * 180 / Math.PI;
    for (const side of [-1, 1]) {
      grains.push(<path key={`${index}${side}`} className="bot-fill-mustard" transform={`translate(${round(px)} ${round(py)}) rotate(${round(lean + side * 26)})`} d={leafPath(length * 0.13, length * 0.032)} />);
    }
  }
  return <g transform={`translate(${x} ${y}) rotate(${angle})`}>
    <path className="bot-stem bot-stem-wheat" d={`M0 0Q${round(bend)} ${round(-length / 2)} 0 ${-length}`} />
    {grains}
    <path className="bot-fill-honey" transform={`translate(0 ${round(-length * 0.97)})`} d={leafPath(length * 0.14, length * 0.034)} />
  </g>;
}

type FlowerProps = { x: number; y: number; r: number; variant?: 'dahlia' | 'cosmos' | 'bud'; outer?: Tone; inner?: Tone; center?: Tone; rotate?: number };

/** Flor vista desde arriba: dalia (tres coronas de pétalos), cosmos (pétalos anchos) o capullo. */
function Flower({ x, y, r, variant = 'dahlia', outer = 'terracotta', inner = 'rust', center = 'burgundy', rotate = 0 }: FlowerProps) {
  const ring = (count: number, length: number, width: number, tone: Tone, offset = 0) => Array.from({ length: count }, (_, index) =>
    <path key={`${tone}${count}${index}`} className={`bot-fill-${tone} bot-petal`} transform={`rotate(${round(offset + index * 360 / count)})`} d={petalPath(length, width)} />);

  return <g transform={`translate(${x} ${y}) rotate(${rotate})`}>
    {variant === 'dahlia' && <>
      {ring(12, r, r * 0.27, outer)}
      {ring(10, r * 0.7, r * 0.22, inner, 18)}
      {ring(8, r * 0.42, r * 0.16, 'honey', 8)}
      <circle className={`bot-fill-${center}`} r={round(r * 0.14)} />
    </>}
    {variant === 'cosmos' && <>
      {ring(7, r, r * 0.42, outer)}
      {ring(7, r * 0.5, r * 0.2, inner, 25)}
      <circle className={`bot-fill-${center}`} r={round(r * 0.24)} />
      {Array.from({ length: 6 }, (_, index) => <circle key={index} className="bot-fill-cream" transform={`rotate(${index * 60})`} cx={0} cy={round(-r * 0.13)} r={round(r * 0.04)} />)}
    </>}
    {variant === 'bud' && <>
      {ring(5, r, r * 0.52, outer)}
      <circle className={`bot-fill-${center}`} r={round(r * 0.3)} />
    </>}
  </g>;
}

type SvgProps = { className?: string };

/** Ramo horizontal: corona la tarjeta de la portada y los paneles del juego. */
export function Bouquet({ className = '' }: SvgProps) {
  return <svg className={`botanical ${className}`} viewBox="-190 -92 380 126" aria-hidden="true" focusable="false">
    <Sprig x={-18} y={8} angle={-82} length={158} bend={-26} leaves={8} leafSize={25} tone="sage" altTone="moss" />
    <Sprig x={18} y={8} angle={82} length={158} bend={26} leaves={8} leafSize={25} tone="sage" altTone="moss" />
    <Sprig x={-12} y={6} angle={-58} length={118} bend={-16} leaves={6} leafSize={22} tone="moss" altTone="sage" />
    <Sprig x={12} y={6} angle={58} length={118} bend={16} leaves={6} leafSize={22} tone="moss" altTone="sage" />
    <Wheat x={-10} y={4} angle={-36} length={104} bend={-12} />
    <Wheat x={10} y={4} angle={36} length={104} bend={12} />
    <Sprig x={-16} y={8} angle={-100} length={104} bend={14} leaves={5} leafSize={19} tone="rust" altTone="mustard" />
    <Sprig x={16} y={8} angle={100} length={104} bend={-14} leaves={5} leafSize={19} tone="rust" altTone="mustard" />
    <Sprig x={-8} y={2} angle={-68} length={92} bend={10} leaves={6} leafSize={15} tone="burgundy" altTone="terracotta" berries />
    <Sprig x={8} y={2} angle={68} length={92} bend={-10} leaves={6} leafSize={15} tone="burgundy" altTone="terracotta" berries />
    <Sprig x={-6} y={0} angle={-14} length={66} bend={-8} leaves={4} leafSize={17} tone="sage" />
    <Sprig x={6} y={0} angle={14} length={66} bend={8} leaves={4} leafSize={17} tone="sage" />
    <Flower x={-88} y={2} r={13} variant="bud" outer="blush" center="mustard" rotate={12} />
    <Flower x={88} y={2} r={13} variant="bud" outer="mustard" center="burgundy" rotate={-20} />
    <Flower x={-52} y={-6} r={24} variant="cosmos" outer="burgundy" inner="terracotta" center="mustard" rotate={8} />
    <Flower x={52} y={-6} r={22} variant="cosmos" outer="blush" inner="rust" center="burgundy" rotate={-14} />
    <Flower x={0} y={-12} r={36} variant="dahlia" />
  </svg>;
}

/** Separador fino: línea, hojitas y una flor en el centro. */
export function FloralDivider({ className = '' }: SvgProps) {
  return <svg className={`botanical floral-divider ${className}`} viewBox="0 0 280 44" aria-hidden="true" focusable="false">
    <path className="bot-rule" d="M4 22H92M188 22H276" />
    <circle className="bot-fill-mustard" cx="4" cy="22" r="2" />
    <circle className="bot-fill-mustard" cx="276" cy="22" r="2" />
    <Sprig x={130} y={22} angle={-90} length={40} bend={-5} leaves={4} leafSize={13} tone="sage" altTone="moss" />
    <Sprig x={150} y={22} angle={90} length={40} bend={5} leaves={4} leafSize={13} tone="sage" altTone="moss" />
    <Flower x={140} y={22} r={13} variant="cosmos" outer="terracotta" inner="rust" center="burgundy" />
  </svg>;
}

/** Ramo que nace de una esquina (abajo a la izquierda). Se voltea con CSS para el resto de esquinas. */
export function CornerSpray({ className = '' }: SvgProps) {
  return <svg className={`botanical corner-spray ${className}`} viewBox="0 0 260 260" aria-hidden="true" focusable="false">
    <Sprig x={18} y={246} angle={14} length={212} bend={-30} leaves={9} leafSize={30} tone="sage" altTone="moss" />
    <Sprig x={22} y={242} angle={72} length={196} bend={28} leaves={8} leafSize={28} tone="moss" altTone="sage" />
    <Wheat x={20} y={244} angle={30} length={190} bend={-18} />
    <Wheat x={20} y={244} angle={56} length={176} bend={16} />
    <Sprig x={20} y={244} angle={43} length={168} bend={8} leaves={7} leafSize={22} tone="rust" altTone="mustard" />
    <Sprig x={24} y={240} angle={86} length={132} bend={-14} leaves={7} leafSize={19} tone="burgundy" altTone="terracotta" berries />
    <Sprig x={16} y={238} angle={0} length={124} bend={12} leaves={7} leafSize={19} tone="burgundy" altTone="terracotta" berries />
    <Flower x={112} y={214} r={21} variant="cosmos" outer="blush" inner="rust" center="burgundy" rotate={18} />
    <Flower x={40} y={152} r={19} variant="cosmos" outer="burgundy" inner="terracotta" center="mustard" />
    <Flower x={62} y={200} r={36} variant="dahlia" rotate={10} />
    <Flower x={104} y={166} r={12} variant="bud" outer="mustard" center="burgundy" />
  </svg>;
}

/** Ramita pequeña para acompañar textos (cabecera del juego, pie de página). */
export function LeafSprig({ className = '', flip = false }: SvgProps & { flip?: boolean }) {
  return <svg className={`botanical leaf-sprig ${className}`} viewBox="0 0 56 24" aria-hidden="true" focusable="false">
    <g transform={flip ? 'translate(56 0) scale(-1 1)' : undefined}>
      <Sprig x={54} y={14} angle={-90} length={50} bend={-7} leaves={6} leafSize={14} tone="sage" altTone="mustard" />
    </g>
  </svg>;
}

/** Flor pequeña que hace de sello junto al nombre de la boda. */
export function BloomMark({ className = '' }: SvgProps) {
  return <svg className={`botanical bloom-mark ${className}`} viewBox="-20 -20 40 40" aria-hidden="true" focusable="false">
    <Flower x={0} y={0} r={18} variant="dahlia" />
  </svg>;
}

const icons = {
  attire: <><path d="M12 7.2a2.2 2.2 0 1 0-2.2-2.2" /><path d="M12 7.2v2l8.3 5.4c1.2.8.7 2.6-.8 2.6H4.5c-1.5 0-2-1.8-.8-2.6L12 9.2" /></>,
  stay: <><path d="M3.5 11.2 12 4l8.5 7.2" /><path d="M5.8 9.6V20h12.4V9.6" /><path d="M10 20v-5.2h4V20" /></>,
  questions: <><path d="M3.5 6.5h17v11h-17z" /><path d="m3.8 7 8.2 6.4L20.2 7" /></>,
};

/** Iconos de línea para las tarjetas de detalles. */
export function DetailIcon({ name }: { name: keyof typeof icons }) {
  return <svg className="detail-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">{icons[name]}</svg>;
}
