import React, { useState } from 'react'
import SettingsIcon from '@mui/icons-material/Settings'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import { Link } from 'react-router-dom'
import tangentScreen from "../../assets/tangent_screen_1.png"
import TestSettings, { DEFAULT_SETTINGS } from './TestSettings'

function TestOverlay({ toggleOverlay, setToggleOverlay, onOpenSettings }) {
  const handleStartTestClick = () => {
    setToggleOverlay(false)
  }

  return (
    <>
      {toggleOverlay && (
        <div className="flex flex-col bg-transparent min-h-dvh absolute w-full p-4 z-50 pointer-events-auto">
          <div className="flex justify-between items-center pointer-events-auto">
            <Link to="/test-menu">
              <ArrowBackIcon className="hover:text-gray-300 hover:cursor-pointer active:scale-95" />
            </Link>

            <SettingsIcon
              className="hover:text-gray-300 hover:cursor-pointer active:scale-95"
              onClick={onOpenSettings}
            />

            <button
              type="button"
              onClick={handleStartTestClick}
              className="w-fit absolute bottom-10 left-1/2 -translate-x-1/2 px-4 py-3 rounded-xl text-sm font-medium transition-all bg-purple-500 border border-purple-700 text-white hover:bg-purple-700 hover:border-purple-500/50 hover:cursor-pointer"
            >
              Start Test
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function TestScreen() {
  const [toggleOverlay, setToggleOverlay] = useState(true)
  const [showSettings, setShowSettings] = useState(false)
  const [settings, setSettings] = useState(DEFAULT_SETTINGS)

  const handleDoubleClick = () => {
    setToggleOverlay(true)
  }

  return (
    <div
      className="relative min-h-dvh bg-black flex items-center justify-center"
      onDoubleClick={handleDoubleClick}
    >
      {/* Background image isolated so brightness filter doesn't bleed into overlay */}
      <div
        className="absolute inset-0 bg-center bg-contain bg-no-repeat"
        style={{
          backgroundImage: `url(${tangentScreen})`,
          filter: `brightness(${settings.brightness / 100})`,
        }}
      />
      <TestOverlay
        toggleOverlay={toggleOverlay}
        setToggleOverlay={setToggleOverlay}
        onOpenSettings={() => setShowSettings(true)}
      />

      {showSettings && (
        <TestSettings
          settings={settings}
          onChange={setSettings}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  )
}

export default TestScreen