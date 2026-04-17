import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

export const log = (msg, addTime = false) => {
  const str = addTime ? `${getTime()} ${msg}` : msg
  console.log(str)
}

export const getTime = () => {
  const pad = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}

export const getProcessList = () => {
  const { promise, resolve, reject } = Promise.withResolvers()

  const parseLine = (line) => {
    const parts = line.trim().split(/\s+/);
    return {
      user: parts[0],
      pid: Number(parts[1]),
      command: parts.slice(10).join(' '),
    };
  }

  const procs = {}
  let output = ''
  
  const child = spawn('ps', ['aux'])
  child.stdout.on('data', (data) => {
    output += data.toString()
  })
  child.on('close', (code) => {
    const lines = output.trim().split('\n')
    lines.shift()

    for (const line of lines) {
      const proc = parseLine(line)
      procs[proc.pid] = proc
    }
    resolve(procs)
  })

  return promise
}

export const processKill = (pid) => {

  const { promise, resolve, reject } = Promise.withResolvers()

  const child = spawn('kill', [pid])
  child.on('close', (code) => {
    if (code === 0) {
      resolve()
    } else {
      reject(new Error(`Process ${pid} killed with code ${code}`))
    }
  })
  return promise
}

export const wait = (ms) => new Promise(resolve => setTimeout(resolve, ms))

export const getDirname = (metaUrl) => {
  return path.dirname(fileURLToPath(metaUrl))
}