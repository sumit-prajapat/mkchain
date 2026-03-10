import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Analyze from './pages/Analyze'
import Results from './pages/Results'
import History from './pages/History'

export default function App() {
  return (
    <div style={{ minHeight: '100vh', position: 'relative' }}>
      {/* Fixed grid background — pointer-events none so it never blocks clicks */}
      <div className="grid-bg" />
      <Navbar />
      <main style={{ maxWidth: 1200, margin: '0 auto', padding: '0 24px 80px', position: 'relative', zIndex: 1 }}>
        <Routes>
          <Route path="/"            element={<Home />} />
          <Route path="/analyze"     element={<Analyze />} />
          <Route path="/results/:id" element={<Results />} />
          <Route path="/history"     element={<History />} />
        </Routes>
      </main>
    </div>
  )
}
