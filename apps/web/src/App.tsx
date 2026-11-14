import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GameLayout } from './components/GameLayout';
import { Layout } from './components/Layout';
import { useSession } from './lib/session';
import { Admin } from './pages/Admin';
import { Challenge } from './pages/Challenge';
import { CommunityChallenge } from './pages/CommunityChallenge';
import { CommunityScan } from './pages/CommunityScan';
import { Affiliation } from './pages/Affiliation';
import { GameAccess } from './pages/GameAccess';
import { NotFound } from './pages/NotFound';
import { PlayerProfile } from './pages/PlayerProfile';
import { PlayerChallenges } from './pages/PlayerChallenges';
import { PorLaCara } from './pages/PorLaCara';
import { Ranking } from './pages/Ranking';
import { Stats } from './pages/Stats';
import { WeddingHome } from './pages/WeddingHome';
import { MediaGallery } from './pages/MediaGallery';

/** Every game page needs a signed-in player; anyone else is sent to the login and brought back afterwards. */
function PlayerArea() {
  const session = useSession();
  const location = useLocation();
  if (!session?.userId) return <Navigate to="/juego" replace state={{ returnTo: `${location.pathname}${location.search}` }} />;
  return <GameLayout />;
}

export function App() {
  return <ErrorBoundary><Routes>
    <Route element={<Layout/>}><Route path="/" element={<WeddingHome/>}/><Route path="/galeria" element={<MediaGallery/>}/><Route path="/admin" element={<Admin/>}/></Route>
    <Route path="/juego" element={<GameAccess/>}/>
    <Route element={<PlayerArea/>}>
      <Route path="/juego/perfil" element={<PlayerProfile/>}/>
      <Route path="/juego/retos" element={<PlayerChallenges/>}/>
      <Route path="/juego/clasificacion" element={<Ranking/>}/>
      <Route path="/juego/afiliacion/:id" element={<Affiliation/>}/>
      <Route path="/juego/estadisticas" element={<Stats/>}/>
      <Route path="/juego/reto/:id" element={<Challenge/>}/>
      <Route path="/juego/por-la-cara/:id" element={<PorLaCara/>}/>
      <Route path="/juego/comunidades" element={<CommunityChallenge/>}/>
      <Route path="/juego/encuentro/:id" element={<CommunityScan/>}/>
    </Route>
    <Route path="*" element={<NotFound/>}/>
  </Routes></ErrorBoundary>;
}
