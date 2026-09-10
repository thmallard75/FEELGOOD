import React from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'
import { loadMapData } from '@/lib/mapData'
import { initNativeShell } from '@/lib/native'

// Chargement anticipé des données cartographiques locales (alsace_final.json)
loadMapData();
initNativeShell();

ReactDOM.createRoot(document.getElementById('root')).render(
  <App />
)