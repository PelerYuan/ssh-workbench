import { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Network } from 'lucide-react';
import type { SystemResources } from '../types/systemMonitor';

interface SystemMonitorProps {
  sessionId: string;
}

export function SystemMonitor({ sessionId }: SystemMonitorProps) {
  const [resources, setResources] = useState<SystemResources | null>(null);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const ws = new WebSocket(`${protocol}//${window.location.host}/ws/monitor/${encodeURIComponent(sessionId)}`);

    ws.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(String(event.data));
        if (message.type === 'resources') {
          setResources(message.data);
        }
      } catch {
        // Ignore malformed messages
      }
    });

    return () => {
      ws.close();
    };
  }, [sessionId]);

  if (!resources) {
    return (
      <div className="system-monitor system-monitor--loading">
        <div className="system-monitor__item">
          <Activity size={14} />
          <span>Loading...</span>
        </div>
      </div>
    );
  }

  const formatMemory = (bytes: number): string => {
    const gb = bytes / (1024 ** 3);
    return gb >= 1 ? `${gb.toFixed(1)}GB` : `${(bytes / (1024 ** 2)).toFixed(0)}MB`;
  };

  const formatSpeed = (bytesPerSec: number): string => {
    const mbps = (bytesPerSec * 8) / (1024 ** 2);
    return mbps >= 1 ? `${mbps.toFixed(1)}Mbps` : `${(mbps * 1024).toFixed(0)}Kbps`;
  };

  return (
    <div className="system-monitor">
      <div className="system-monitor__item">
        <Cpu size={14} />
        <span>CPU</span>
        <strong>{resources.cpu.toFixed(1)}%</strong>
      </div>
      <div className="system-monitor__item">
        <HardDrive size={14} />
        <span>Memory</span>
        <strong>{formatMemory(resources.memoryUsed)} / {formatMemory(resources.memoryTotal)}</strong>
      </div>
      <div className="system-monitor__item">
        <Network size={14} />
        <span>Network</span>
        <strong>↑ {formatSpeed(resources.networkUpload)} ↓ {formatSpeed(resources.networkDownload)}</strong>
      </div>
    </div>
  );
}
