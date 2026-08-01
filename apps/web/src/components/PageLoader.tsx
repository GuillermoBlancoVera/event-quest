import './PageLoader.css';

export function PageLoader({ label = 'Cargando' }: { label?: string }) {
  return <div className="page-loader" role="status" aria-label={label}><span /></div>;
}
