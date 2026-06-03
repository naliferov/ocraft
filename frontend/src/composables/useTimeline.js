import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import * as Tone from 'tone'

// Owns the Tone.js audio engine for a node's tracks: transport, per-track synth
// voices, the step loop, and the playhead. Knows nothing about layout or the canvas.
export function useTimeline(getNode) {
  const node = computed(() => getNode())

  const transport = Tone.getTransport()
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

  const initTransport = () => {
    transport.bpm.value = bpm.value
    transport.loop = true
    transport.loopEnd = `${bars.value}m`
  }

  // One synth "voice" per track, playing its note. No sample files needed.
  let voices = {}
  let loop = null
  let step = 0

  const makeVoice = (track) => {
    const note = track.props?.note ?? 'C4'
    const filter = new Tone.Filter({
      type: 'lowpass', 
      frequency: 3000, 
      Q: 30
    }).toDestination()

    const synth = new Tone.Synth().connect(filter) // synth -> filter -> speakers
    return { nodes: [synth, filter], trigger: (t) => synth.triggerAttackRelease(note, '16n', t) }
  }

  const buildVoices = () => {
    disposeVoices()
    for (const t of tracks.value) voices[t.name] = makeVoice(t)
  }

  const disposeVoices = () => {
    for (const v of Object.values(voices)) v.nodes.forEach((n) => n.dispose())
    voices = {}
  }

  const initLoop = () => {
    loop = new Tone.Loop((time) => {
      const s = step % totalSteps.value
      for (const t of tracks.value) {
        if (Array.isArray(t.events) && t.events.includes(s)) voices[t.name]?.trigger(time)
      }
      step++
    }, '16n').start(0)
  }

  const tickPlayhead = () => {
    if (isPlaying.value) {
      // Read the real audio clock (context.currentTime) and map it to the transport
      // position playing *right now*, rather than transport.progress, which tracks the
      // scheduling clock that runs ahead by the lookahead. getTicksAtTime accounts for
      // lookahead, tempo, and loop wrap.
      const beats = transport.getTicksAtTime(Tone.getContext().currentTime) / transport.PPQ
      const loop = loopBeats.value
      playheadProgress.value = loop ? (beats % loop) / loop : 0
    } else {
      playheadProgress.value = transport.progress
    }
    requestAnimationFrameId = requestAnimationFrame(tickPlayhead)
  }

  const play = async () => {
    await Tone.start()
    transport.start()
    isPlaying.value = true
  }

  const pause = () => {
    transport.pause()
    isPlaying.value = false
  }

  const stop = () => {
    transport.stop()
    isPlaying.value = false
    playheadProgress.value = 0
    step = 0
  }

  const toggleStep = (track, s) => {
    if (!Array.isArray(track.events)) track.events = []
    const idx = track.events.indexOf(s)
    if (idx === -1) track.events.push(s)
    else track.events.splice(idx, 1)
  }

  onMounted(() => {
    initTransport()
    buildVoices()
    initLoop()
    tickPlayhead()
  })

  onBeforeUnmount(() => {
    transport.stop()
    cancelAnimationFrame(requestAnimationFrameId)
    loop?.dispose()
    disposeVoices()
  })

  return {
    isPlaying, playheadProgress,
    bpm, bars, beatsPerBar, stepsPerBeat, totalSteps, tracks,
    play, pause, stop, toggleStep,
  }
}
