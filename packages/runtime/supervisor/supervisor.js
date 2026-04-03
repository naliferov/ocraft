import fs from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { getProcessList, processKill, wait, getTime, log } from './utils.js'
import path from 'path'
import { fileURLToPath } from 'url'


const getServicePid = async (servicePath) => {
  try {
    const pid = await fs.readFile(`${servicePath}/pid`, 'utf8')
    if (pid) return pid.trim()
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
}

const removePidFile = async (servicePath) => {
  await fs.unlink(`${servicePath}/pid`)
}

const isServiceEnabled = async (servicePath) => {
  const conf = JSON.parse(await fs.readFile(`${servicePath}/service.json`, 'utf8'))
  return conf.enabled
}

const isProcessActive = async (pid) => {
  const processList = await getProcessList()
  return processList[pid] ? true : false
}

const startService = async(servicePath) => {
  const logFile = await fs.open(`${servicePath}/service.log`, 'a')

  const child = spawn('node', [`${servicePath}/service.js`], {
    detached: true,
    stdio: ['ignore', logFile.fd, logFile.fd],
  })

  const pid = child.pid

  child.unref()
  await logFile.close()

  return pid
}

const startServiceIfInactive = async (servicePath, pid) => {

  if (pid) {
    let str = `service [${pid}]`

    if (await isProcessActive(pid)) {
      str += ` active`
    } else {
      str += ` not active. start [${servicePath}]`

      const newPid = await startService(servicePath)
      str += ` pid [${newPid}] started`
      await fs.writeFile(`${servicePath}/pid`, String(newPid))
    }

    log(str)
    return
  }

  log(`pid not found. start [${servicePath}]`)
  const newPid = await startService(servicePath)
  log(` pid [${newPid}]`)
  await fs.writeFile(`${servicePath}/pid`, String(newPid))
}

const stopServiceIfActive = async (servicePath, pid) => {
  if (!pid) {
    log(`pid not found`)
    return
  }

  let processIsActive = await isProcessActive(pid)
  if (!processIsActive) {
    log(`proc [${pid}] not active`)
    await removePidFile(servicePath)
    return
  }

  log(`proc [${pid}] active. try to stop it`)
  await processKill(pid)

  processIsActive = await isProcessActive(pid)
  if (!processIsActive) {
    log(`proc [${pid}] stopped`)
    await removePidFile(servicePath)
    log(`remove pid [${pid}]`)
    return
  }
}

const processService = async (servicesPath, service) => {

  const servicePath = `${servicesPath}/${service}`
  const enabled = await isServiceEnabled(servicePath)
  const pid = await getServicePid(servicePath)

  if (enabled) {
    log(`[${service}] enabled`)
    await startServiceIfInactive(servicePath, pid)
  } else {
    log(`[${service}] disabled`)
    await stopServiceIfActive(servicePath, pid)  
  }
}

const processServices = async (servicesPath) => {

  const services = await fs.readdir(servicesPath)
  for (const service of services) {
    await processService(servicesPath, service)
  }
}

export const createSupervisor = () => {

  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const servicesPath = path.join(__dirname, '../services');

  const start = async() => {
    while (true) {
      await processServices(servicesPath)
      await wait(4000)
    }
  }

  return { start }
}