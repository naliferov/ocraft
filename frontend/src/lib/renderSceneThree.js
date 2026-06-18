// Three.js renderer for `scene3d` nodes — the 3D analog of renderSceneP5.js.
// Builds a Three scene from the node's plain-JSON data and returns a controller
// that Scene3d.vue drives (resize / play-pause / dispose). Imperative by design:
// a scene3d node stores data; this turns it into meshes + a render loop.
//
// Node data (every field optional — defaults keep a minimal node renderable):
//   background: '#0b0b14'
//   camera:  { position:[x,y,z], lookAt:[x,y,z], fov }
//   lights:  [{ type:'ambient'|'directional', color, intensity, position }]
//   objects: [{ geometry:'box'|'sphere'|'torus'|'cone'|'cylinder'|'plane',
//               size:[w,h,d] | radius | tube | height, position:[x,y,z],
//               rotation:[x,y,z], color, spin:[x,y,z] (radians/second) }]
import * as THREE from 'three'

const DEFAULT_LIGHTS = [
  { type: 'ambient', intensity: 0.45 },
  { type: 'directional', position: [5, 10, 7], intensity: 1.1 },
]

const makeGeometry = (spec) => {
  switch (spec.geometry) {
    case 'sphere':
      return new THREE.SphereGeometry(spec.radius ?? 1, 32, 16)
    case 'torus':
      return new THREE.TorusGeometry(spec.radius ?? 1, spec.tube ?? 0.3, 16, 64)
    case 'cone':
      return new THREE.ConeGeometry(spec.radius ?? 1, spec.height ?? 2, 32)
    case 'cylinder':
      return new THREE.CylinderGeometry(spec.radius ?? 1, spec.radius ?? 1, spec.height ?? 2, 32)
    case 'plane': {
      const [planeWidth, planeHeight] = spec.size ?? [2, 2]
      return new THREE.PlaneGeometry(planeWidth, planeHeight)
    }
    case 'box':
    default: {
      const [boxWidth, boxHeight, boxDepth] = spec.size ?? [1, 1, 1]
      return new THREE.BoxGeometry(boxWidth, boxHeight, boxDepth)
    }
  }
}

const addLights = (scene, lights) => {
  for (const light of lights ?? DEFAULT_LIGHTS) {
    const color = new THREE.Color(light.color ?? 0xffffff)
    if (light.type === 'directional') {
      const directional = new THREE.DirectionalLight(color, light.intensity ?? 1)
      directional.position.set(...(light.position ?? [5, 10, 7]))
      scene.add(directional)
    } else {
      scene.add(new THREE.AmbientLight(color, light.intensity ?? 0.5))
    }
  }
}

export function createScene3d(container, node) {
  const width = container.offsetWidth || 640
  const height = container.offsetHeight || 360

  const renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2))
  renderer.setSize(width, height)
  renderer.domElement.style.width = '100%'
  renderer.domElement.style.height = '100%'
  renderer.domElement.style.display = 'block'
  container.appendChild(renderer.domElement)

  const scene = new THREE.Scene()
  scene.background = new THREE.Color(node.background ?? '#0b0b14')

  const cameraSpec = node.camera ?? {}
  const camera = new THREE.PerspectiveCamera(cameraSpec.fov ?? 55, width / height, 0.1, 1000)
  camera.position.set(...(cameraSpec.position ?? [3, 2.5, 5]))
  camera.lookAt(new THREE.Vector3(...(cameraSpec.lookAt ?? [0, 0, 0])))

  addLights(scene, node.lights)

  // Keep the meshes that spin so the loop can rotate them each frame.
  const animated = []
  for (const spec of node.objects ?? []) {
    const material = new THREE.MeshStandardMaterial({
      color: new THREE.Color(spec.color ?? '#4f9dff'),
      metalness: spec.metalness ?? 0.1,
      roughness: spec.roughness ?? 0.6,
    })
    const mesh = new THREE.Mesh(makeGeometry(spec), material)
    mesh.position.set(...(spec.position ?? [0, 0, 0]))
    if (spec.rotation) mesh.rotation.set(...spec.rotation)
    scene.add(mesh)
    animated.push({ mesh, spin: spec.spin ?? [0, 0, 0] })
  }

  let playing = true
  let frameId = null
  let previousTime = null
  const tick = (time) => {
    frameId = requestAnimationFrame(tick)
    const delta = previousTime == null ? 0 : (time - previousTime) / 1000
    previousTime = time
    if (playing) {
      for (const entry of animated) {
        entry.mesh.rotation.x += entry.spin[0] * delta
        entry.mesh.rotation.y += entry.spin[1] * delta
        entry.mesh.rotation.z += entry.spin[2] * delta
      }
    }
    renderer.render(scene, camera)
  }
  frameId = requestAnimationFrame(tick)

  return {
    setPlaying(value) {
      playing = value
      previousTime = null // skip the accumulated delta so motion doesn't jump on resume
    },
    resize() {
      const nextWidth = container.offsetWidth || width
      const nextHeight = container.offsetHeight || height
      renderer.setSize(nextWidth, nextHeight)
      camera.aspect = nextWidth / nextHeight
      camera.updateProjectionMatrix()
    },
    dispose() {
      if (frameId != null) cancelAnimationFrame(frameId)
      for (const entry of animated) {
        entry.mesh.geometry.dispose()
        entry.mesh.material.dispose()
      }
      renderer.dispose()
      renderer.domElement.remove()
    },
  }
}
