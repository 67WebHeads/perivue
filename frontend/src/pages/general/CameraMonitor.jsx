import React, { useEffect, useRef, useState } from 'react'
import {
  MONITOR_CHANNEL,
  MONITOR_TIMEOUT_MS,
  TONE_CLASS,
  trackerMessage,
} from '../../tracking/cameraMonitor'

// Camera monitor window for the clinician's screen. Shows what the eye tracker
// on the (projected) test page sees, plus its controls — so nothing about the
// camera has to appear on the projector. See tracking/cameraMonitor.js.

const EYE_TEXT = {
  OD: { tested: 'right', covered: 'left' },
  OS: { tested: 'left', covered: 'right' },
}

export default function CameraMonitor() {
  const canvasRef = useRef(null)
  const channelRef = useRef(null)
  const [info, setInfo] = useState(null) // { runId, eye, status } from the test page
  // The test page's open-ended button check, mirrored here so the clinician
  // can follow presses and move on from the laptop screen
  const [buttonCheck, setButtonCheck] = useState({ running: false, presses: 0, input: null })
  const [lastSeen, setLastSeen] = useState(0)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    document.title = 'PeriVue — Camera monitor'
    const channel = new BroadcastChannel(MONITOR_CHANNEL)
    channelRef.current = channel
    let drawing = false

    channel.onmessage = async ({ data }) => {
      if (data?.type === 'status') {
        setInfo({ runId: data.runId, eye: data.eye, status: data.status })
        setLastSeen(Date.now())
      } else if (data?.type === 'buttonCheck') {
        setButtonCheck({ running: Boolean(data.running), presses: data.presses || 0, input: data.input })
      } else if (data?.type === 'ended') {
        setInfo(null)
        setLastSeen(0)
        setButtonCheck({ running: false, presses: 0, input: null })
      } else if (data?.type === 'frame' && data.blob && !drawing) {
        setLastSeen(Date.now())
        const canvas = canvasRef.current
        if (!canvas) return
        drawing = true
        try {
          const bitmap = await createImageBitmap(data.blob)
          if (canvas.width !== bitmap.width || canvas.height !== bitmap.height) {
            canvas.width = bitmap.width
            canvas.height = bitmap.height
          }
          canvas.getContext('2d').drawImage(bitmap, 0, 0)
          bitmap.close()
        } catch {
          // A dropped frame — the next one replaces it
        } finally {
          drawing = false
        }
      }
    }

    // Heartbeat — tells the test page someone is watching, so it only spends
    // effort encoding preview frames while this window is open
    const hello = () => channel.postMessage({ type: 'hello' })
    hello()
    const beat = setInterval(() => {
      hello()
      setNow(Date.now())
    }, 1000)

    return () => {
      clearInterval(beat)
      channel.close()
    }
  }, [])

  function send(name, arg) {
    channelRef.current?.postMessage({ type: 'command', name, arg })
  }

  const connected = info && now - lastSeen < MONITOR_TIMEOUT_MS
  const status = connected ? info.status : null
  const running = status?.phase === 'running'
  const msg = trackerMessage(status)
  const eyeText = EYE_TEXT[info?.eye]

  const btn = 'px-3 py-1.5 rounded-lg bg-white/8 border border-white/12 text-white/70 text-xs hover:bg-white/15 hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed'

  return (
    <div className="min-h-dvh bg-[#0b0b16] text-white p-4 flex flex-col gap-3 font-sans">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-base font-medium">Camera monitor</h1>
          <p className="text-xs text-white/40">
            Keep this window on your screen — the patient only sees the test
          </p>
        </div>
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-[11px] font-medium ${
            connected ? 'bg-emerald-500/15 text-emerald-300' : 'bg-white/10 text-white/50'
          }`}
        >
          {connected ? 'Live' : 'Waiting for test'}
        </span>
      </div>

      {/* Above the picture so it is never scrolled out of view */}
      {connected && buttonCheck.running && (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-purple-500/25 bg-purple-500/10 px-3 py-2.5">
          <div className="text-xs">
            <p className="text-purple-100/90 font-medium">
              Button check —{' '}
              {buttonCheck.presses > 0
                ? `${buttonCheck.presses} ${buttonCheck.presses === 1 ? 'press' : 'presses'} received (last: ${buttonCheck.input === 'mouse' ? 'mouse click' : 'key press'})`
                : 'no presses yet'}
            </p>
            <p className="text-purple-100/55 mt-0.5">
              Swap the clicker if presses don&apos;t show up, then click Next
            </p>
          </div>
          <button
            type="button"
            onClick={() => send('buttonCheckNext')}
            disabled={buttonCheck.presses === 0}
            className="shrink-0 px-3 py-1.5 rounded-lg bg-purple-500/25 border border-purple-400/30 text-white text-xs font-medium hover:bg-purple-500/35 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
      )}

      <div className="relative w-full aspect-video rounded-xl overflow-hidden border border-white/10 bg-black">
        <canvas ref={canvasRef} className={`w-full h-full object-contain ${connected ? '' : 'invisible'}`} />
        {!connected && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="text-sm text-white/45 leading-relaxed">
              Start a test in PeriVue with eye tracking on. The camera appears here
              automatically — this window can stay open between patients.
            </p>
          </div>
        )}
      </div>

      {connected && (
        <>
          <p className={`text-sm leading-snug ${TONE_CLASS[msg.tone]}`}>{msg.text}</p>

          {status?.tolerance && (
            <p className="text-xs text-white/50">
              {status.tolerance.measuring
                ? 'Checking how steady the camera reading is — patient keeps looking at the centre…'
                : status.tolerance.effective > status.tolerance.chosen
                  ? `Fixation tolerance widened to ${status.tolerance.effective}° (set to ${status.tolerance.chosen}°) — the camera reading is shaky. Brighter light on the face or a camera closer to the eye helps.`
                  : `Fixation tolerance ${status.tolerance.chosen}°`}
            </p>
          )}
          {status?.tolerance?.coarse && !status.tolerance.measuring && (
            <p className="text-xs text-amber-400/90">
              Too shaky to catch glances at the 10° dots. Check the projection matches the
              viewing distance in Settings, move the camera closer to the patient&apos;s eye,
              then calibrate again.
            </p>
          )}

          {eyeText && (
            <p className="text-xs text-white/50">
              Testing the {eyeText.tested} eye — the patient&apos;s{' '}
              <span className="text-white/80">{eyeText.covered} eye</span> must stay covered.
              The green ring should be on the eye being tested.
            </p>
          )}

          {running && status.offset && (
            <p className="text-white/30 text-[11px] font-mono">
              offset from centre: h={status.offset.h >= 0 ? '+' : ''}{status.offset.h.toFixed(3)}{' '}
              v={status.offset.v >= 0 ? '+' : ''}{status.offset.v.toFixed(3)}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <button type="button" className={btn} disabled={!running}
              onClick={() => send('toggleFlip')}
              title="Use if the green ring is on the wrong eye">
              Flip left/right {status?.flip ? '(on)' : '(off)'}
            </button>
            <button type="button" className={btn} disabled={!running}
              onClick={() => send('relearn')}
              title="Re-learn the patient's centre gaze after they shift or the occluder goes on">
              Re-learn centre
            </button>
          </div>

          {status?.cameras?.length > 1 && (
            <select
              value={status.cameraId || ''}
              onChange={(e) => send('setCamera', e.target.value)}
              className="w-full rounded-lg bg-white/8 border border-white/12 text-white/70 text-xs px-2 py-1.5"
              aria-label="Camera"
            >
              {status.cameras.map((c) => (
                <option key={c.id} value={c.id} className="bg-neutral-900">{c.label}</option>
              ))}
            </select>
          )}

          {info?.runId && (
            <p className="text-[10px] text-white/20 font-mono">run {info.runId.slice(0, 8)}…</p>
          )}
        </>
      )}
    </div>
  )
}
