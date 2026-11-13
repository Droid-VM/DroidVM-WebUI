import { shallowRef } from 'vue'
import type { Vm } from '../api/gateway'

export interface VmRates {
  cpuPercent: number
  memoryPercent: number | null
  readBytesPerSecond: number
  writeBytesPerSecond: number
}
interface Sample {
  cpu: bigint
  read: bigint
  write: bigint
  at: bigint
}
// The daemon reports cumulative /proc counters; rates come from consecutive list reads.
const samples = new Map<string, Sample>()
export const vmRates = shallowRef(new Map<string, VmRates>())
export function observeVmUsage(items: readonly Vm[]) {
  const next = new Map(vmRates.value)
  for (const vm of items) {
    const usage = vm.usage
    if (!usage) {
      samples.delete(vm.id)
      next.delete(vm.id)
      continue
    }
    const current: Sample = {
      cpu: BigInt(usage.cpuTimeMs),
      read: BigInt(usage.readBytes),
      write: BigInt(usage.writeBytes),
      at: BigInt(usage.sampledAtMs),
    }
    const previous = samples.get(vm.id)
    samples.set(vm.id, current)
    const elapsed = previous ? Number(current.at - previous.at) : 0
    if (!previous || elapsed <= 0 || current.cpu < previous.cpu) continue
    const seconds = elapsed / 1000
    const cpus = Math.max(1, vm.cpuCount ?? 1)
    next.set(vm.id, {
      cpuPercent: Math.min(100, (Number(current.cpu - previous.cpu) / elapsed / cpus) * 100),
      memoryPercent: vm.memoryMiB
        ? Math.min(100, (Number(BigInt(usage.rssBytes)) / (vm.memoryMiB * 1048576)) * 100)
        : null,
      readBytesPerSecond: Math.max(0, Number(current.read - previous.read) / seconds),
      writeBytesPerSecond: Math.max(0, Number(current.write - previous.write) / seconds),
    })
  }
  vmRates.value = next
}
