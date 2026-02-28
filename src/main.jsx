import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { ThemeProvider } from './ThemeProvider.jsx';
import App from './App.jsx';
import TestPage from './TestPage.jsx';
import GridView from './GridView.jsx';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<GridView />} />
          <Route path="/ambient" element={<App />} />
          <Route path="/test" element={<TestPage />} />
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>
);
