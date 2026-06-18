'use client';

import { useState, useEffect, useRef } from 'react';
import { AppIcon } from '@/components/ui/icons';

interface SystemMetrics {
  cpuUsage: number;
  memoryUsage: { total: number; used: number; percentage: number };
  gpuInfo?: { name: string; utilization: number; memoryUsed: number; memoryTotal: number };
}

interface ServiceStatus {
  id: string;
  status: 'online' | 'offline' | 'starting' | 'error';
  pid?: number;
  uptime?: number;
  lastError?: string;
}

export default function LocalServicesTab() {
  const [metrics, setMetrics] = useState<SystemMetrics | null>(null);
  const [services, setServices] = useState<ServiceStatus[]>([]);
  const [selectedServiceId, setSelectedServiceId] = useState<string | null>(null);
  const [logs, setLogs] = useState<string>('');
  const [isLoadingAction, setIsLoadingAction] = useState<Record<string, boolean>>({});
  const logEndRef = useRef<HTMLDivElement>(null);

  const fetchStatus = async () => {
    try {
      const res = await fetch('/api/admin/local-services/status');
      const data = await res.json();
      if (data.success) {
        setMetrics(data.data.metrics);
        setServices(data.data.services);
      }
    } catch (e) {
      console.error('Failed to fetch local services status', e);
    }
  };

  const fetchLogs = async (serviceId: string) => {
    try {
      const res = await fetch(`/api/admin/local-services/logs?serviceId=${serviceId}`);
      const text = await res.text();
      setLogs(text);
    } catch (e) {
      console.error('Failed to fetch logs', e);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (selectedServiceId) {
      fetchLogs(selectedServiceId);
      const logInterval = setInterval(() => fetchLogs(selectedServiceId), 3000);
      return () => clearInterval(logInterval);
    }
  }, [selectedServiceId]);

  useEffect(() => {
    // Auto scroll logs
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  const handleAction = async (serviceId: string, action: 'start' | 'stop') => {
    setIsLoadingAction(prev => ({ ...prev, [serviceId]: true }));
    try {
      const res = await fetch('/api/admin/local-services/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serviceId, action })
      });
      const data = await res.json();
      if (data.success) {
        await fetchStatus();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (e) {
      alert(`Failed to ${action} service.`);
    } finally {
      setIsLoadingAction(prev => ({ ...prev, [serviceId]: false }));
    }
  };

  const getStatusChipClass = (status: string) => {
    switch (status) {
      case 'online': return 'glass-chip glass-chip-success';
      case 'offline': return 'glass-chip glass-chip-neutral';
      case 'starting': return 'glass-chip glass-chip-info animate-pulse';
      case 'error': return 'glass-chip glass-chip-danger';
      default: return 'glass-chip glass-chip-neutral';
    }
  };

  return (
    <div className="space-y-8 animate-fade-in pb-12 w-full">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--glass-text-primary)] mb-2">Local Services</h2>
        <p className="text-sm text-[var(--glass-text-secondary)]">
          Monitor host performance and control local AI API backends.
        </p>
      </div>

      {/* System Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="glass-surface-elevated p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--glass-text-primary)] flex items-center gap-2">
              <AppIcon name="cpu" className="w-4 h-4 text-[var(--glass-text-secondary)]" />
              CPU
            </h3>
            <span className="text-xl font-bold text-[var(--glass-text-primary)]">{metrics?.cpuUsage || 0}%</span>
          </div>
          <div className="w-full bg-[var(--glass-bg-muted)] rounded-full h-1.5 overflow-hidden">
            <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics?.cpuUsage || 0}%`, background: 'var(--glass-accent-from)' }}></div>
          </div>
        </div>

        <div className="glass-surface-elevated p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--glass-text-primary)] flex items-center gap-2">
              <AppIcon name="database" className="w-4 h-4 text-[var(--glass-text-secondary)]" />
              Memory
            </h3>
            <div className="text-right">
              <span className="text-xl font-bold text-[var(--glass-text-primary)]">{metrics?.memoryUsage.percentage || 0}%</span>
              <div className="text-[10px] text-[var(--glass-text-tertiary)]">{metrics?.memoryUsage.used} / {metrics?.memoryUsage.total} GB</div>
            </div>
          </div>
          <div className="w-full bg-[var(--glass-bg-muted)] rounded-full h-1.5 overflow-hidden">
            <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics?.memoryUsage.percentage || 0}%`, background: 'var(--glass-accent-from)' }}></div>
          </div>
        </div>

        <div className="glass-surface-elevated p-6 flex flex-col justify-between">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-[var(--glass-text-primary)] flex items-center gap-2">
              <AppIcon name="server" className="w-4 h-4 text-[var(--glass-text-secondary)]" />
              GPU
            </h3>
            {metrics?.gpuInfo ? (
              <div className="text-right">
                <span className="text-xl font-bold text-[var(--glass-text-primary)]">{metrics.gpuInfo.utilization}%</span>
                <div className="text-[10px] text-[var(--glass-text-tertiary)] truncate w-32" title={metrics.gpuInfo.name}>
                  {metrics.gpuInfo.name}
                </div>
              </div>
            ) : (
              <span className="text-xs text-[var(--glass-text-tertiary)]">N/A</span>
            )}
          </div>
          {metrics?.gpuInfo && (
            <div className="w-full bg-[var(--glass-bg-muted)] rounded-full h-1.5 overflow-hidden">
              <div className="h-1.5 rounded-full transition-all duration-500" style={{ width: `${metrics.gpuInfo.utilization}%`, background: 'var(--glass-accent-from)' }}></div>
            </div>
          )}
        </div>
      </div>

      <div className="glass-divider my-8"></div>

      {/* Services List */}
      <h3 className="text-lg font-bold text-[var(--glass-text-primary)] mb-4">Background APIs</h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {services.map((service) => (
          <div key={service.id} className="glass-surface-elevated p-6 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-6">
                <h4 className="text-base font-bold text-[var(--glass-text-primary)] capitalize">
                  {service.id === 'comfyui' ? 'ComfyUI (Port 8188)' : 'OmniVoice (Port 8000)'}
                </h4>
                <span className={getStatusChipClass(service.status)}>
                  {service.status.toUpperCase()}
                </span>
              </div>
              <div className="space-y-3 mb-8">
                <div className="flex justify-between items-center text-sm">
                  <span className="text-[var(--glass-text-secondary)]">Process ID</span>
                  <span className="font-mono text-[var(--glass-text-primary)]">{service.pid || '—'}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <span className="text-[var(--glass-text-secondary)]">Uptime</span>
                  <span className="font-mono text-[var(--glass-text-primary)]">
                    {service.uptime ? `${Math.floor(service.uptime / 60)}m ${service.uptime % 60}s` : '—'}
                  </span>
                </div>
                {service.lastError && (
                  <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-medium">
                    {service.lastError}
                  </div>
                )}
              </div>
            </div>
            <div className="flex gap-3">
              {service.status === 'online' ? (
                <button
                  onClick={() => handleAction(service.id, 'stop')}
                  disabled={isLoadingAction[service.id]}
                  className="glass-btn-base glass-btn-tone-danger flex-1 h-10 text-sm"
                >
                  <AppIcon name="close" className="w-4 h-4" /> Stop
                </button>
              ) : (
                <button
                  onClick={() => handleAction(service.id, 'start')}
                  disabled={isLoadingAction[service.id] || service.status === 'starting'}
                  className="glass-btn-base glass-btn-tone-success flex-1 h-10 text-sm"
                >
                  <AppIcon name="play" className="w-4 h-4" /> Start
                </button>
              )}
              <button
                onClick={() => setSelectedServiceId(selectedServiceId === service.id ? null : service.id)}
                className={`glass-btn-base h-10 px-4 text-sm ${
                  selectedServiceId === service.id ? 'glass-btn-tone-info' : 'glass-btn-ghost'
                }`}
              >
                <AppIcon name="terminal" className="w-4 h-4" /> Logs
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Terminal View */}
      {selectedServiceId && (
        <div className="mt-8 animate-fade-in">
          <div className="flex items-center justify-between mb-3 px-2">
            <h3 className="text-sm font-bold text-[var(--glass-text-primary)] capitalize flex items-center gap-2">
              <AppIcon name="terminal" className="w-4 h-4" />
              {selectedServiceId} Console
            </h3>
            <button 
              onClick={() => setSelectedServiceId(null)}
              className="glass-icon-btn-sm"
            >
              <AppIcon name="close" className="w-4 h-4" />
            </button>
          </div>
          <div className="glass-surface-soft p-4 h-96 overflow-y-auto app-scrollbar">
            <pre className="font-mono text-[11px] leading-relaxed text-[var(--glass-text-secondary)] whitespace-pre-wrap break-words">{logs || 'Waiting for logs...'}</pre>
            <div ref={logEndRef} />
          </div>
        </div>
      )}
    </div>
  );
}
