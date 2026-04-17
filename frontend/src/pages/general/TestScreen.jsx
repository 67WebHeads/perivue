import React, { useEffect, useRef, useState, useCallback } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useAuth } from '../../context/AuthContext'
import API_BASE_URL from '../../config/api'

const RINGS = [5, 10, 15, 20, 25, 30, 35]
const SPOKES = [0, 45, 90, 135, 180, 225, 270, 315]
const ANGLE_LABELS = { 0: '0', 45: '45', 90: '90', 135: '135', 180: '180', 225: '225', 270: '270', 315: '315' }

function drawGrid(canvas) {
  const ctx = canvas.getContext('2d')
  const W = canvas.width
  const H = canvas.height
  const cx = W / 2
  const cy = H / 2
  const maxRing = RINGS[RINGS.length - 1]
  const scale = Math.min(W, H) * 0.44 / maxRing

  ctx.clearRect(0, 0, W, H)
  ctx.fillStyle = '#000'
  ctx.fillRect(0, 0, W, H)

  RINGS.forEach(r => {
    const px = r * scale
    ctx.beginPath()
    ctx.arc(cx, cy, px, 0, Math.PI * 2)
    ctx.strokeStyle = 'rgba(255,255,255,0.7)'
    ctx.lineWidth = r === maxRing ? 2 : 1
    ctx.stroke()
    if (r < maxRing) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)'
      ctx.font = `${Math.max(10, scale * 1.1)}px monospace`
      ctx.textAlign = 'center'
      ctx.textBaseline = 'bottom'
      ctx.fillText(String(r), cx, cy - px - 3)
    }
  })

  SPOKES.forEach(angleDeg => {
    const rad = (angleDeg - 90) * (Math.PI / 180)
    const outerPx = maxRing * scale
    ctx.beginPath()
    ctx.moveTo(cx, cy)
    ctx.lineTo(cx + outerPx * Math.cos(rad), cy + outerPx * Math.sin(rad))
    ctx.strokeStyle = 'rgba(255,255,255,0.55)'
    ctx.lineWidth = 0.6
    ctx.stroke()
  })

  const labelR = (maxRing + 4) * scale
  SPOKES.forEach(angleDeg => {
    const rad = (angleDeg - 90) * (Math.PI / 180)
    const lx = cx + labelR * Math.cos(rad)
    const ly = cy + labelR * Math.sin(rad)
    ctx.fillStyle = 'rgba(255,255,255,0.9)'
    ctx.font = `${Math.max(11, scale * 1.3)}px monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(ANGLE_LABELS[angleDeg], lx, ly)
  })

  const crossAngles = Array.from({ length: 16 }, (_, i) => i * (Math.PI / 8))
  const innerR = scale * 0.5
  const outerR = scale * 1.6
  ctx.strokeStyle = 'rgba(255,255,255,1.0)'
  ctx.lineWidth = 1.2
  crossAngles.forEach(a => {
    ctx.beginPath()
    ctx.moveTo(cx + innerR * Math.cos(a), cy + innerR * Math.sin(a))
    ctx.lineTo(cx + outerR * Math.cos(a), cy + outerR * Math.sin(a))
    ctx.stroke()
  })

  ctx.beginPath()
  ctx.arc(cx, cy, 2, 0, Math.PI * 2)
  ctx.fillStyle = 'white'
  ctx.fill()

  return { cx, cy, scale }
}

function drawDot(canvas, meta, xDeg, yDeg, color = 'white', sizeDeg = 0.5) {
  const ctx = canvas.getContext('2d')
  const { cx, cy, scale } = meta
  const px = cx + xDeg * scale
  const py = cy - yDeg * scale
  const radius = Math.max(4, sizeDeg * scale * 2)
  ctx.beginPath()
  ctx.arc(px, py, radius, 0, Math.PI * 2)
  ctx.fillStyle = color
  ctx.fill()
}

export default function TestScreen() {
  const [searchParams] = useSearchParams()
  const runId = searchParams.get('run_id')
  const { authFetch } = useAuth()

  const canvasRef = useRef(null)
  const gridMeta  = useRef({ cx: 0, cy: 0, scale: 1 })

  const [overlay,    setOverlay]    = useState(true)
  const [started,    setStarted]    = useState(false)
  const [paused,     setPaused]     = useState(false)
  const [completed,  setCompleted]  = useState(false)
  const [progress,   setProgress]   = useState({ current: 0, total: 40 })
  const [isFixating, setIsFixating] = useState(true)

  // ── Trial state in refs to avoid stale closures ───────────────────────────
  const trialActiveRef    = useRef(false)
  const trialStartRef     = useRef(null)
  const currentPointRef   = useRef(null)
  const lastPointIndexRef = useRef(-1)   // last index we FINISHED (submitted), not started
  const kineticAnimRef    = useRef(null)
  const kineticPosRef     = useRef(null)
  const responseWindowRef = useRef(null)
  const submittingRef     = useRef(false)

  function resizeCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    canvas.width  = window.innerWidth
    canvas.height = window.innerHeight
    gridMeta.current = drawGrid(canvas)
  }

  useEffect(() => {
    resizeCanvas()
    window.addEventListener('resize', resizeCanvas)
    return () => window.removeEventListener('resize', resizeCanvas)
  }, [])

  // ── Submit result ─────────────────────────────────────────────────────────
  const submitResult = useCallback(async (result, responseTimeMs, boundaryX = null, boundaryY = null) => {
    if (!runId) return
    if (!currentPointRef.current) return
    if (submittingRef.current) return

    const pointId    = currentPointRef.current.id
    const pointIndex = currentPointRef.current.point_index

    submittingRef.current = true
    try {
      await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/submit/`, {
        method: 'POST',
        body: JSON.stringify({
          protocol_point: pointId,
          result,
          response_time_ms: responseTimeMs,
          boundary_x_deg: boundaryX,
          boundary_y_deg: boundaryY,
        }),
      })
      // Mark this index as done AFTER successful submit
      lastPointIndexRef.current = pointIndex
    } catch (err) {
      console.error('Failed to submit result:', err)
    } finally {
      submittingRef.current = false
    }
  }, [runId, authFetch])

  // ── End trial (cleanup only, no submit) ───────────────────────────────────
  const endTrial = useCallback(() => {
    trialActiveRef.current  = false
    currentPointRef.current = null
    kineticPosRef.current   = null

    if (kineticAnimRef.current) {
      cancelAnimationFrame(kineticAnimRef.current)
      kineticAnimRef.current = null
    }
    if (responseWindowRef.current) {
      clearTimeout(responseWindowRef.current)
      responseWindowRef.current = null
    }

    if (canvasRef.current) {
      gridMeta.current = drawGrid(canvasRef.current)
    }
  }, [])

  // ── Static trial ──────────────────────────────────────────────────────────
  const runStaticTrial = useCallback((point, protocol) => {
    const canvas = canvasRef.current
    if (!canvas) return

    trialActiveRef.current  = true
    currentPointRef.current = point
    const sizeDeg = parseFloat(protocol.stimulus_size_deg)
    const color   = protocol.stimulus_color || 'white'
    const delay   = 200 + Math.random() * 400

    setTimeout(() => {
      if (!trialActiveRef.current) return
      drawDot(canvas, gridMeta.current, parseFloat(point.x_deg), parseFloat(point.y_deg), color, sizeDeg)
      trialStartRef.current = performance.now()

      responseWindowRef.current = setTimeout(async () => {
        if (!trialActiveRef.current) return

        trialActiveRef.current = false
        if (canvasRef.current) {
          gridMeta.current = drawGrid(canvasRef.current)
        }

        await submitResult('not_seen', null)
        currentPointRef.current = null
        kineticPosRef.current   = null
      }, 2000)
    }, delay)
  }, [submitResult])

  // ── Kinetic trial ─────────────────────────────────────────────────────────
  const runKineticTrial = useCallback((point, protocol) => {
    const canvas = canvasRef.current
    if (!canvas) return

    trialActiveRef.current  = true
    currentPointRef.current = point
    trialStartRef.current   = performance.now()

    const speedDegPerSec = parseFloat(protocol.kinetic_speed_deg_per_sec)
    const angleDeg       = parseFloat(point.angle_deg)
    const startRadius    = parseFloat(point.start_radius_deg)
    const color          = protocol.stimulus_color || 'white'
    const sizeDeg        = parseFloat(protocol.stimulus_size_deg)
    const angleRad       = angleDeg * (Math.PI / 180)

    let currentRadius = startRadius
    let lastTime      = null

    async function animate(timestamp) {
      if (!trialActiveRef.current) return

      if (!lastTime) lastTime = timestamp
      const dt = (timestamp - lastTime) / 1000
      lastTime = timestamp

      currentRadius -= speedDegPerSec * dt

      const xDeg = currentRadius * Math.cos(angleRad)
      const yDeg = currentRadius * Math.sin(angleRad)

      kineticPosRef.current = { xDeg, yDeg }

      drawGrid(canvas)
      drawDot(canvas, gridMeta.current, xDeg, yDeg, color, sizeDeg)

      if (currentRadius <= 0) {
        trialActiveRef.current = false
        if (canvasRef.current) {
          gridMeta.current = drawGrid(canvasRef.current)
        }
        await submitResult('not_seen', null, null, null)
        currentPointRef.current = null
        kineticPosRef.current   = null
        return
      }

      kineticAnimRef.current = requestAnimationFrame(animate)
    }

    setTimeout(() => {
      if (!trialActiveRef.current) return
      kineticAnimRef.current = requestAnimationFrame(animate)
    }, 300)
  }, [submitResult])

  // ── Patient response (keypress or click) ──────────────────────────────────
  const handleResponse = useCallback(async (e) => {
    if (e.code !== 'Space' && e.code !== 'Enter') return
    if (!trialActiveRef.current) return

    e.preventDefault()
    const responseTime = Math.round(performance.now() - trialStartRef.current)
    const point = currentPointRef.current
    const pos   = kineticPosRef.current

    // Stop animations immediately
    trialActiveRef.current = false
    if (kineticAnimRef.current) {
      cancelAnimationFrame(kineticAnimRef.current)
      kineticAnimRef.current = null
    }
    if (responseWindowRef.current) {
      clearTimeout(responseWindowRef.current)
      responseWindowRef.current = null
    }
    if (canvasRef.current) {
      gridMeta.current = drawGrid(canvasRef.current)
    }

    if (point?.point_type === 'kinetic' && pos) {
      await submitResult(
        'seen',
        responseTime,
        Math.round(pos.xDeg * 100) / 100,
        Math.round(pos.yDeg * 100) / 100,
      )
    } else {
      await submitResult('seen', responseTime)
    }

    currentPointRef.current = null
    kineticPosRef.current   = null
  }, [submitResult])

  useEffect(() => {
    const handleMouseDown = (e) => {
      if (e.button === 0 && !overlay) {
        handleResponse({ code: 'Space', preventDefault: () => {} })
      }
    }
    window.addEventListener('keydown', handleResponse)
    window.addEventListener('mousedown', handleMouseDown)
    return () => {
      window.removeEventListener('keydown', handleResponse)
      window.removeEventListener('mousedown', handleMouseDown)
    }
  }, [handleResponse, overlay])

  // ── Polling loop ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!started || !runId) return

    async function poll() {
      try {
        const res = await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/state/`)
        if (!res.ok) return
        const state = await res.json()

        setIsFixating(state.is_fixating)
        setProgress({
          current: state.current_point_index + 1,
          total:   40,
        })

        if (state.status === 'completed' || state.status === 'aborted') {
          setCompleted(true)
          setStarted(false)
          endTrial()
          return
        }

        if (state.status === 'paused') {
          setPaused(true)
          setOverlay(true)
          endTrial()
          return
        }

        setPaused(false)

        // Start a new trial only when:
        // 1. No trial is currently running
        // 2. We are not mid-submit
        // 3. There IS a point to show
        // 4. The backend's current index is AHEAD of the last one we finished
        const pointIndex = state.current_point_index
        if (
          !trialActiveRef.current &&
          !submittingRef.current &&
          state.current_point &&
          pointIndex > lastPointIndexRef.current
        ) {
          const point    = state.current_point
          const protocol = state.protocol

          if (point.point_type === 'static') {
            runStaticTrial(point, protocol)
          } else if (point.point_type === 'kinetic') {
            runKineticTrial(point, protocol)
          }
        }

      } catch (err) {
        console.error('Poll error:', err)
      }
    }

    poll()
    const interval = setInterval(poll, 1000)
    return () => clearInterval(interval)
  }, [started, runId, authFetch, runStaticTrial, runKineticTrial, endTrial])

  // ── Commands ──────────────────────────────────────────────────────────────
  const sendCommand = useCallback(async (command) => {
    if (!runId) return
    await authFetch(`${API_BASE_URL}/api/visual-tests/runs/${runId}/command/`, {
      method: 'POST',
      body: JSON.stringify({ command }),
    })
  }, [runId, authFetch])

  function handleStart() {
    if (!runId) return
    lastPointIndexRef.current = -1
    setOverlay(false)
    setStarted(true)
  }

  function handleDoubleClick() {
    sendCommand('pause')
    setOverlay(true)
    setPaused(true)
    endTrial()
  }

  // ── Completed screen ──────────────────────────────────────────────────────
  if (completed) {
    return (
      <div className="w-screen h-screen bg-black flex flex-col items-center justify-center gap-6 font-sans">
        <div className="text-center">
          <p className="text-white text-xl font-medium">Test complete</p>
          <p className="text-white/40 text-sm mt-1">All points have been tested</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => window.location.href = `/test/results?run_id=${runId}`}
            className="px-6 py-2.5 rounded-xl text-sm font-medium
              bg-purple-500/20 border border-purple-500/30 text-white
              hover:bg-purple-500/30 transition-all"
          >
            View results →
          </button>
          <button
            onClick={() => window.close()}
            className="px-6 py-2.5 rounded-xl text-sm font-medium
              bg-white/8 border border-white/12 text-white/50
              hover:bg-white/15 hover:text-white transition-all"
          >
            Close
          </button>
        </div>
      </div>
    )
  }

  return (
    <div
      className="relative w-screen h-screen bg-black overflow-hidden cursor-none"
      onDoubleClick={handleDoubleClick}
    >
      <canvas ref={canvasRef} className="absolute inset-0" />

      {/* Progress counter */}
      {started && !overlay && progress.total > 0 && (
        <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20
          px-4 py-1.5 rounded-full
          bg-white/5 border border-white/10
          text-white/30 text-xs font-mono pointer-events-none">
          {progress.current} / {progress.total}
        </div>
      )}

      {/* Fixation warning */}
      {!isFixating && started && !overlay && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20
          px-4 py-2 rounded-lg bg-red-500/20 border border-red-500/30
          text-red-400 text-xs font-medium pointer-events-none">
          Look at the center
        </div>
      )}

      {/* Overlay */}
      {overlay && (
        <div className="absolute inset-0 z-10 flex flex-col pointer-events-none">
          <div className="flex items-center justify-between px-5 py-4 pointer-events-auto">
            <Link
              to="/test"
              onClick={() => sendCommand('abort')}
              className="w-8 h-8 flex items-center justify-center rounded-full
                bg-white/8 border border-white/12 text-white/50
                hover:text-white hover:bg-white/15 transition-all"
            >
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
              </svg>
            </Link>

            {runId && (
              <span className="text-white/15 text-xs font-mono">{runId.slice(0, 8)}…</span>
            )}

            <button className="w-8 h-8 flex items-center justify-center rounded-full
              bg-white/8 border border-white/12 text-white/50
              hover:text-white hover:bg-white/15 transition-all">
              <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round"
                  d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </button>
          </div>

          <div className="flex-1 flex flex-col items-center justify-end pb-10 gap-3 pointer-events-auto">
            {paused && <p className="text-white/40 text-xs">Test paused — {progress.current - 1} / {progress.total} done</p>}
            {!runId && <p className="text-red-400 text-xs mb-2">No run ID — go back and start a session</p>}
            <div className="flex gap-3">
              {paused ? (
                <button
                  onClick={async () => {
                    await sendCommand('resume')
                    setOverlay(false)
                    setPaused(false)
                  }}
                  className="px-8 py-3 rounded-xl text-sm font-medium tracking-wide
                    bg-white/10 border border-white/20 text-white/80
                    hover:bg-white/15 hover:border-white/35 hover:text-white
                    active:scale-95 transition-all"
                >
                  Resume
                </button>
              ) : (
                <button
                  onClick={handleStart}
                  disabled={!runId}
                  className="px-8 py-3 rounded-xl text-sm font-medium tracking-wide
                    bg-white/10 border border-white/20 text-white/80
                    hover:bg-white/15 hover:border-white/35 hover:text-white
                    active:scale-95 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Begin test
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}