import { ref, computed, onBeforeUnmount } from 'vue'

// Tone is heavy and starts an AudioContext as soon as it's used, so it's imported
// lazily on the first play() (dynamic import) — not at module load. Opening a scene
// that never plays shouldn't pull in Tone, print its banner, or touch audio at all.
let Tone = null

// Owns the Tone.js audio engine for a node's tracks: transport, per-track synth
// voices, the step loop, and the playhead. Knows nothing about layout or the canvas.
//
// The whole engine is created lazily on the first play() — never at setup/mount.
// Touching Tone (getTransport, creating synths, etc.) starts an AudioContext, and
// browsers forbid that before a user gesture. So opening a scene must NOT init audio;
// only the play button (a real gesture) does, which is also where Tone.start() belongs.
export function useTimeline(getNode) {
  const node = computed(() => getNode())

  const isPlaying = ref(false)
  const playheadProgress = ref(0)
  let requestAnimationFrameId = null

  const stepsPerBeat = 4 // 1/16 grid: 4 sixteenth-note cells per quarter-note beat

  const bpm = computed(() => node.value?.tempo?.bpm ?? 120)
  const bars = computed(() => node.value?.structure?.bars ?? 4)
  const beatsPerBar = computed(() => node.value?.tempo?.beatsPerBar ?? 4)
  const loopBeats = computed(() => bars.value * beatsPerBar.value) // loop length in beats (for the playhead)
  const totalSteps = computed(() => loopBeats.value * stepsPerBeat) // grid cells (16th notes)
  const tracks = computed(() => node.value?.tracks ?? [])

  // --- audio engine (all of this is null until the first play) ---------------
  let transport = null
  let voices = {}
  let loop = null
  let step = 0

  // One synth "voice" per track, playing its note. No sample files needed.
  const makeVoice = (track) => {
    const note = track.props?.note ?? 'C4'
    const filter = new Tone.Filter({
      type: 'lowpass',
      frequency: 3000,
      Q: 30,
    }).toDestination()

    const synth = new Tone.Synth().connect(filter) // synth -> filter -> speakers
    return {
      nodes: [synth, filter],
      trigger: (time) => synth.triggerAttackRelease(note, '16n', time),
    }
  }

  const buildVoices = () => {
    disposeVoices()
    for (const track of tracks.value) {
      voices[track.name] = makeVoice(track)
    }
  }

  const disposeVoices = () => {
    for (const voice of Object.values(voices)) {
      voice.nodes.forEach((audioNode) => audioNode.dispose())
    }
    voices = {}
  }

  // Build the transport + voices + loop on demand. Idempotent: only the first
  // play creates them (and thus the AudioContext); later plays reuse them.
  const ensureEngine = async () => {
    if (transport) {
      return
    }
    Tone = await import('tone') // load the library on demand (first play only)
    transport = Tone.getTransport()
    transport.bpm.value = bpm.value
    transport.loop = true
    transport.loopEnd = `${bars.value}m`
    buildVoices()
    loop = new Tone.Loop((time) => {
      const currentStep = step % totalSteps.value
      for (const track of tracks.value) {
        if (Array.isArray(track.events) && track.events.includes(currentStep)) {
          voices[track.name]?.trigger(time)
        }
      }
      step++
    }, '16n').start(0)
  }

  const tickPlayhead = () => {
    if (!transport) {
      return
    } // engine not started yet — nothing to track
    if (isPlaying.value) {
      // Read the real audio clock (context.currentTime) and map it to the transport
      // position playing *right now*, rather than transport.progress, which tracks the
      // scheduling clock that runs ahead by the lookahead. getTicksAtTime accounts for
      // lookahead, tempo, and loop wrap.
      const beats = transport.getTicksAtTime(Tone.getContext().currentTime) / transport.PPQ
      const loopLength = loopBeats.value
      playheadProgress.value = loopLength ? (beats % loopLength) / loopLength : 0
    } else {
      playheadProgress.value = transport.progress
    }
    requestAnimationFrameId = requestAnimationFrame(tickPlayhead)
  }

  const play = async () => {
    await ensureEngine() // lazily import Tone + build the engine on the first play
    await Tone.start() // resumes/creates the AudioContext — valid here: play is a user gesture
    transport.start()
    isPlaying.value = true
    if (requestAnimationFrameId == null) {
      tickPlayhead()
    }
  }

  const pause = () => {
    transport?.pause()
    isPlaying.value = false
  }

  const stop = () => {
    transport?.stop()
    isPlaying.value = false
    playheadProgress.value = 0
    step = 0
  }

  const toggleStep = (track, stepIndex) => {
    if (!Array.isArray(track.events)) {
      track.events = []
    }
    const idx = track.events.indexOf(stepIndex)
    if (idx === -1) {
      track.events.push(stepIndex)
    } else {
      track.events.splice(idx, 1)
    }
  }

  onBeforeUnmount(() => {
    transport?.stop()
    if (requestAnimationFrameId != null) {
      cancelAnimationFrame(requestAnimationFrameId)
    }
    loop?.dispose()
    disposeVoices()
  })

  return {
    isPlaying,
    playheadProgress,
    bpm,
    bars,
    beatsPerBar,
    stepsPerBeat,
    totalSteps,
    tracks,
    play,
    pause,
    stop,
    toggleStep,
  }
}
