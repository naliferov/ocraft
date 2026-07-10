import { createSignal } from 'solid-js'

export default function SolidCounter() {
  const [count, setCount] = createSignal(0)
  return (
    <div class="flex items-center gap-3">
      <button class="btn btn-sm btn-primary" onClick={() => setCount(count() + 1)}>
        solid count {count()}
      </button>
      <span>doubled = {count() * 2}</span>
    </div>
  )
}
