import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HelpPage from './pages/HelpPage';
import HomePage from './pages/HomePage';
import LicensesPage from './pages/LicensesPage';
import PracticePage from './pages/PracticePage';
import ReadPage from './pages/ReadPage';
import SettingsPage from './pages/SettingsPage';
import StatsPage from './pages/StatsPage';
import VocabularyPage from './pages/VocabularyPage';
import { appBasename } from './lib/basename';

export default function App() {
  return (
    <BrowserRouter basename={appBasename(import.meta.env.BASE_URL)}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/read/:id" element={<ReadPage />} />
          <Route path="/practice/:id" element={<PracticePage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/data" element={<Navigate to="/stats" replace />} />
          <Route path="/mots" element={<VocabularyPage />} />
          <Route path="/aide" element={<HelpPage />} />
          <Route path="/licences" element={<LicensesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
