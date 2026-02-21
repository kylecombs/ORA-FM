import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import App from './App.jsx';
import TestPage from './TestPage.jsx';
import SenseEffects from './SenseEffects.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/test" element={<TestPage />} />
        <Route path="/sense" element={<SenseEffects />} />
      </Routes>
    </BrowserRouter>
  </StrictMode>
);
