import os from 'node:os';
import type { WebSocket } from 'ws';

interface SystemResources {
  cpu: number;
  memoryUsed: number;
  memoryTotal: number;
  networkUpload: number;
  networkDownload: number;
}

interface NetworkStats {
  bytesReceived: number;
  bytesSent: number;
  timestamp: number;
}

const monitorClients = new Map<WebSocket, NodeJS.Timeout>();
let previousNetworkStats: NetworkStats | null = null;

function getNetworkStats(): NetworkStats {
  const interfaces = os.networkInterfaces();
  let bytesReceived = 0;
  let bytesSent = 0;

  for (const iface of Object.values(interfaces)) {
    if (!iface) continue;
    for (const addr of iface) {
      // Skip loopback interfaces
      if (addr.internal) continue;
      // Note: Node.js doesn't expose per-interface bytes directly
      // This is a simplified implementation - real monitoring would need system calls
    }
  }

  return {
    bytesReceived,
    bytesSent,
    timestamp: Date.now(),
  };
}

function getCpuUsage(): Promise<number> {
  return new Promise((resolve) => {
    const startMeasure = process.cpuUsage();
    const startTime = Date.now();

    setTimeout(() => {
      const endMeasure = process.cpuUsage(startMeasure);
      const elapsedTime = Date.now() - startTime;
      const elapsedMicroseconds = elapsedTime * 1000;

      const totalCpuUsage = (endMeasure.user + endMeasure.system) / elapsedMicroseconds;
      const cpuPercent = Math.min(100, totalCpuUsage * 100 * os.cpus().length);

      resolve(cpuPercent);
    }, 100);
  });
}

async function getSystemResources(): Promise<SystemResources> {
  const cpu = await getCpuUsage();
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;

  const currentNetworkStats = getNetworkStats();
  let networkUpload = 0;
  let networkDownload = 0;

  if (previousNetworkStats) {
    const timeDiff = (currentNetworkStats.timestamp - previousNetworkStats.timestamp) / 1000;
    if (timeDiff > 0) {
      networkUpload = (currentNetworkStats.bytesSent - previousNetworkStats.bytesSent) / timeDiff;
      networkDownload = (currentNetworkStats.bytesReceived - previousNetworkStats.bytesReceived) / timeDiff;
    }
  }

  previousNetworkStats = currentNetworkStats;

  return {
    cpu,
    memoryUsed: usedMemory,
    memoryTotal: totalMemory,
    networkUpload: Math.max(0, networkUpload),
    networkDownload: Math.max(0, networkDownload),
  };
}

export function startMonitoring(ws: WebSocket): void {
  const interval = setInterval(async () => {
    if (ws.readyState !== ws.OPEN) {
      stopMonitoring(ws);
      return;
    }

    try {
      const resources = await getSystemResources();
      ws.send(JSON.stringify({
        type: 'resources',
        data: resources,
      }));
    } catch (error) {
      console.error('Failed to get system resources:', error);
    }
  }, 2000);

  monitorClients.set(ws, interval);

  ws.on('close', () => {
    stopMonitoring(ws);
  });
}

export function stopMonitoring(ws: WebSocket): void {
  const interval = monitorClients.get(ws);
  if (interval) {
    clearInterval(interval);
    monitorClients.delete(ws);
  }
}
