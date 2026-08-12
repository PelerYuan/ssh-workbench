export interface SystemResources {
  cpu: number;
  memoryUsed: number;
  memoryTotal: number;
  networkUpload: number;
  networkDownload: number;
}

export interface SystemMonitorMessage {
  type: 'resources';
  data: SystemResources;
}
