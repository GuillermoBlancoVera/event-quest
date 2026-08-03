import { Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GameLayout } from './components/GameLayout';
import { Layout } from './components/Layout';
import { Challenge } from './pages/Challenge';
import { CommunityChallenge } from './pages/CommunityChallenge';
import { CommunityScan } from './pages/CommunityScan';
import { Affiliation } from './pages/Affiliation';
import { GameAccess } from './pages/GameAccess';
import { NotFound } from './pages/NotFound';
import { PlayerProfile } from './pages/PlayerProfile';
import { PlayerChallenges } from './pages/PlayerChallenges';
import { Ranking } from './pages/Ranking';
import { Stats } from './pages/Stats';
import { WeddingHome } from './pages/WeddingHome';

export function App() {
  return <ErrorBoundary><Routes>
    <Route element={<Layout/>}><Route path="/" element={<WeddingHome/>}/></Route>
    <Route path="/juego" element={<GameAccess/>}/>
    <Route element={<GameLayout/>}>
      <Route path="/juego/perfil" element={<PlayerProfile/>}/>
      <Route path="/juego/retos" element={<PlayerChallenges/>}/>
      <Route path="/juego/clasificacion" element={<Ranking/>}/>
      <Route path="/juego/afiliacion/:id" element={<Affiliation/>}/>
      <Route path="/juego/estadisticas" element={<Stats/>}/>
      <Route path="/juego/reto/:id" element={<Challenge/>}/>
      <Route path="/juego/comunidades" element={<CommunityChallenge/>}/>
      <Route path="/juego/encuentro/:id" element={<CommunityScan/>}/>
    </Route>
    <Route path="*" element={<NotFound/>}/>
  </Routes></ErrorBoundary>;
}
