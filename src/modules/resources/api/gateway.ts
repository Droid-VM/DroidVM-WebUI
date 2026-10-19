import type { components } from '../../../generated/api'
export type ResourceKind = 'disk' | 'diskDetail' | 'network' | 'audio' | 'usb' | 'cpu' | 'host'
export type DiskDetail = components['schemas']['DiskDetail']
export type DiskBaseline = components['schemas']['DiskCatalog']
type BlitObservation = components['schemas']['HostDeviceCatalog']['systemBlit']
export interface HostDevices {
  readonly devices: Readonly<components['schemas']['HostDeviceCatalog']['devices']>
  readonly systemBlit: Readonly<Omit<BlitObservation, 'missingExtensions'>> & {
    readonly missingExtensions:
      | readonly NonNullable<BlitObservation['missingExtensions']>[number][]
      | null
  }
}
export type HostCpuCore = components['schemas']['HostCpuCore']
export type UsbDevice = components['schemas']['UsbDevice']
export type UsbVmTarget = components['schemas']['UsbVmTarget']
export interface UsbCatalog {
  items: UsbDevice[]
  targets: UsbVmTarget[]
}
export type AudioDevice = components['schemas']['AudioDevice']
export type DiskResource = components['schemas']['DiskResource']
export type NetworkResource = Readonly<
  Omit<components['schemas']['NetworkResource'], 'vlans'> & {
    vlans?: readonly components['schemas']['NetworkVlanResource'][]
  }
>
export interface ResourceGateway {
  supported(kind: ResourceKind): boolean
  disks(signal: AbortSignal): Promise<DiskResource[]>
  diskBaseline(signal: AbortSignal): Promise<DiskBaseline>
  diskDetail(id: string, signal: AbortSignal): Promise<DiskDetail>
  networks(signal: AbortSignal): Promise<NetworkResource[]>
  audio(signal: AbortSignal): Promise<AudioDevice[]>
  usb(signal: AbortSignal): Promise<UsbCatalog>
  cpus(signal: AbortSignal): Promise<HostCpuCore[]>
  hostDevices(signal: AbortSignal): Promise<HostDevices>
}
