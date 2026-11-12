import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import DataPage from './pages/DataPage';
import HelpPage from './pages/HelpPage';
import HomePage from './pages/HomePage';
import LicensesPage from './pages/LicensesPage';
import PracticePage from './pages/PracticePage';
import ReadPage from './pages/ReadPage';
import { appBasename } from './lib/basename';

export default function App() {
  return (
    <BrowserRouter basename={appBasename(import.meta.env.BASE_URL)}>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/read/:id" element={<ReadPage />} />
          <Route path="/practice/:id" element={<PracticePage />} />
          <Route path="/data" element={<DataPage />} />
          <Route path="/aide" element={<HelpPage />} />
          <Route path="/licences" element={<LicensesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
