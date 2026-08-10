import { Routes, Route } from 'react-router-dom'
import HomePage from './pages/HomePage'
import TripPage from './pages/TripPage'
import PWAInstallPrompt from './components/PWAInstallPrompt'

export default function App() {
  return (
    <>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/t/:slug" element={<TripPage />} />
        <Route path="*" element={<HomePage />} />
      </Routes>
      <PWAInstallPrompt />
    </>
  )
}