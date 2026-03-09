import React from 'react'
import { Routes, Route } from 'react-router-dom'
import Navbar from './components/Navbar'
import Home from './pages/Home'
import Analyze from './pages/Analyze'
import Results from './pages/Results'
import History from './pages/History'

export default function App() {
  return (
    <div className="min-h-screen grid-bg">
      <Navbar />
      <main className="max-w-7xl mx-auto px-4 py-8">
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
