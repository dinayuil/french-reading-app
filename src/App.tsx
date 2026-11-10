import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './components/Layout';
import HelpPage from './pages/HelpPage';
import HomePage from './pages/HomePage';
import LicensesPage from './pages/LicensesPage';
import PracticePage from './pages/PracticePage';
import ReadPage from './pages/ReadPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<HomePage />} />
          <Route path="/read/:id" element={<ReadPage />} />
          <Route path="/practice/:id" element={<PracticePage />} />
          <Route path="/aide" element={<HelpPage />} />
          <Route path="/licences" element={<LicensesPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
