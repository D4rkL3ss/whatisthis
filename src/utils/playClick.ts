import pageFlipSrc from '../assets/pageflip.mp3'

let ctx: AudioContext | null = null
let pageFlipBuffer: AudioBuffer | null = null

function getCtx(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

async function loadPageFlipBuffer() {
  if (pageFlipBuffer) return pageFlipBuffer
  const ac = getCtx()
  const response = await fetch(pageFlipSrc)
  const arrayBuffer = await response.arrayBuffer()
  pageFlipBuffer = await ac.decodeAudioData(arrayBuffer)
  return pageFlipBuffer
}

export function playPageFlip() {
  try {
    const ac = getCtx()
    loadPageFlipBuffer().then(buffer => {
      const source = ac.createBufferSource()
      source.buffer = buffer
      const gain = ac.createGain()
      gain.gain.value = 0.5
      source.connect(gain)
      gain.connect(ac.destination)
      source.start()
    })
  } catch {
    // Silently ignore if AudioContext is unavailable
  }
}

function makeDistortionCurve(amount: number): Float32Array<ArrayBuffer> {
  const samples = 256
  const curve = new Float32Array(samples)
  for (let i = 0; i < samples; i++) {
    const x = (i * 2) / samples - 1
    curve[i] = ((Math.PI + amount) * x) / (Math.PI + amount * Math.abs(x))
  }
  return curve
}

export function playClick() {
  try {
    const ac = getCtx()
    const t = ac.currentTime
    const duration = 0.1

    // Single sawtooth with mild detune
    const osc1 = ac.createOscillator()
    const osc2 = ac.createOscillator()
    osc1.type = 'sawtooth'
    osc2.type = 'sawtooth'

    osc1.frequency.setValueAtTime(160, t)
    osc1.frequency.exponentialRampToValueAtTime(80, t + duration)
    osc2.frequency.setValueAtTime(164, t)
    osc2.frequency.exponentialRampToValueAtTime(83, t + duration)

    // Light distortion
    const distortion = ac.createWaveShaper()
    distortion.curve = makeDistortionCurve(40)
    distortion.oversample = '2x'

    // Low-pass — damp the harshness quickly
    const filter = ac.createBiquadFilter()
    filter.type = 'lowpass'
    filter.frequency.setValueAtTime(900, t)
    filter.frequency.exponentialRampToValueAtTime(250, t + duration)
    filter.Q.value = 2

    // Quiet gain envelope
    const gain = ac.createGain()
    gain.gain.setValueAtTime(0.09, t)
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration)

    osc1.connect(distortion)
    osc2.connect(distortion)
    distortion.connect(filter)
    filter.connect(gain)
    gain.connect(ac.destination)

    osc1.start(t); osc1.stop(t + duration)
    osc2.start(t); osc2.stop(t + duration)
  } catch {
    // Silently ignore if AudioContext is unavailable
  }
}
