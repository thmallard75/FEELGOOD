import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { loadMapData } from '@/lib/mapData'

// Chargement anticipé des données cartographiques locales (alsace_final.json)
loadMapData();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)