import React from 'react'
import CloseIcon from '@mui/icons-material/Close'

const COLOR_BLIND_MODES = [
  { value: 'none', label: 'None' },
  { value: 'protanopia', label: 'Protanopia' },
  { value: 'deuteranopia', label: 'Deuteranopia' },
  { value: 'tritanopia', label: 'Tritanopia' },
]

function SettingRow({ label, children, column }) {
  return (
    <div
      className={`py-3 border-b border-white/10 last:border-0 ${
        column ? 'flex flex-col gap-3' : 'flex items-center justify-between'
      }`}
    >
      <span className="text-sm text-gray-300">{label}</span>
      <div className={column ? 'flex flex-col gap-2' : 'flex items-center gap-2 w-1/2'}>
        {children}
      </div>
    </div>
  )
}

function TestSettings({ settings, onChange, onClose }) {
  const set = (key) => (value) => onChange({ ...settings, [key]: value })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-gray-900 border border-white/15 rounded-2xl p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Test Settings</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-white hover:cursor-pointer transition-colors"
          >
            <CloseIcon fontSize="small" />
          </button>
        </div>

        {/* Settings */}
        <div className="flex flex-col">
          {/* Brightness */}
          <SettingRow label={`Brightness — ${settings.brightness}%`}>
            <input
              type="range"
              min={10}
              max={100}
              value={settings.brightness}
              onChange={(e) => set('brightness')(Number(e.target.value))}
              className="w-full accent-purple-500 hover:cursor-pointer"
            />
          </SettingRow>

          {/* Size */}
          <SettingRow label={`Stimulus size — ${settings.size}%`}>
            <input
              type="range"
              min={10}
              max={200}
              value={settings.size}
              onChange={(e) => set('size')(Number(e.target.value))}
              className="w-full accent-purple-500 hover:cursor-pointer"
            />
          </SettingRow>

          {/* Color blind mode */}
          <SettingRow label="Color blind mode" column>
            {COLOR_BLIND_MODES.map(({ value, label }) => (
              <label
                key={value}
                className="flex items-center gap-3 hover:cursor-pointer group"
              >
                <input
                  type="radio"
                  name="colorBlindMode"
                  value={value}
                  checked={settings.colorBlindMode === value}
                  onChange={() => set('colorBlindMode')(value)}
                  className="accent-purple-500 w-4 h-4 hover:cursor-pointer"
                />
                <span className="text-sm text-gray-300 group-hover:text-white transition-colors">
                  {label}
                </span>
              </label>
            ))}
          </SettingRow>
        </div>
      </div>
    </div>
  )
}

export const DEFAULT_SETTINGS = {
  brightness: 100,
  size: 100,
  colorBlindMode: 'none',
}

export default TestSettings
