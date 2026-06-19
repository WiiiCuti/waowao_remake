import { exec, spawn } from 'child_process';
import os from 'os';
import fs from 'fs/promises';
import path from 'path';

export interface ServiceConfig {
  id: string;
  name: string;
  workDir: string;
  startCommand: string;
  port: number;
}

export interface ServiceStatus {
  id: string;
  status: 'online' | 'offline' | 'starting' | 'error';
  pid?: number;
  uptime?: number;
  lastError?: string;
}

export interface SystemMetrics {
  cpuUsage: number; // percentage
  memoryUsage: {
    total: number; // GB
    used: number; // GB
    percentage: number;
  };
  gpuInfo?: {
    name: string;
    utilization: number; // percentage
    memoryUsed: number; // MB
    memoryTotal: number; // MB
  };
}

const SERVICES: Record<string, ServiceConfig> = {
  comfyui: {
    id: 'comfyui',
    name: 'ComfyUI (SD Backend)',
    workDir: '/run/media/thqui/_data/comfyui',
    startCommand: 'source ~/miniconda3/etc/profile.d/conda.sh && conda activate comfyui && python main.py --enable-manager',
    port: 8188
  },
  omnivoice: {
    id: 'omnivoice',
    name: 'OmniVoice API',
    workDir: '/run/media/thqui/_data/omnivoice-api',
    startCommand: 'source ~/miniconda3/etc/profile.d/conda.sh && conda activate omnivoice && python -m src',
    port: 8000
  }
};

// Store service states in memory for this simple implementation
// In a highly robust environment, we might save PIDs to a file,
// but for this MVP, memory is fine (or checking port bindings).
interface ServiceState {
  pid?: number;
  startTime?: number;
  status: 'online' | 'offline' | 'starting' | 'error';
  lastError?: string;
}

const serviceStates: Record<string, ServiceState> = {
  comfyui: { status: 'offline' },
  omnivoice: { status: 'offline' }
};

// Helper: Exec wrapper that returns a Promise
const execAsync = (command: string): Promise<{ stdout: string, stderr: string }> => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        reject(error);
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
};

export class LocalServicesManager {
  private static logDir = path.join(process.cwd(), '.local-services-logs');

  static async init() {
    try {
      await fs.mkdir(this.logDir, { recursive: true });
    } catch (e) {
      console.error('Failed to create local services log dir:', e);
    }
  }

  static async getSystemMetrics(): Promise<SystemMetrics> {
    // 1. CPU
    const cpus = os.cpus();
    let user = 0, nice = 0, sys = 0, idle = 0, irq = 0;
    for (let cpu of cpus) {
      user += cpu.times.user;
      nice += cpu.times.nice;
      sys += cpu.times.sys;
      idle += cpu.times.idle;
      irq += cpu.times.irq;
    }
    const total = user + nice + sys + idle + irq;
    // Note: this is a simple average since node start, not a rolling metric. 
    // For a more accurate realtime reading, you'd calculate diff over an interval.
    // We will do a basic mock or loadavg here for better UX if os.cpus() isn't enough.
    const loadAvg = os.loadavg()[0]; // 1 min load average
    const cpuUsage = Math.min(100, Math.max(0, (loadAvg / cpus.length) * 100));

    // 2. Memory
    const totalMemBytes = os.totalmem();
    const freeMemBytes = os.freemem();
    const usedMemBytes = totalMemBytes - freeMemBytes;

    const totalMemGb = totalMemBytes / (1024 ** 3);
    const usedMemGb = usedMemBytes / (1024 ** 3);
    const memPercentage = (usedMemBytes / totalMemBytes) * 100;

    // 3. GPU (NVIDIA)
    let gpuInfo = undefined;
    try {
      const { stdout } = await execAsync('nvidia-smi --query-gpu=name,utilization.gpu,memory.used,memory.total --format=csv,noheader,nounits');
      const parts = stdout.trim().split(',');
      if (parts.length >= 4) {
        gpuInfo = {
          name: parts[0].trim(),
          utilization: parseFloat(parts[1].trim()),
          memoryUsed: parseFloat(parts[2].trim()),
          memoryTotal: parseFloat(parts[3].trim())
        };
      }
    } catch (e) {
      // No nvidia-smi available or error
      console.warn('Could not fetch GPU info (nvidia-smi might not be installed)');
    }

    return {
      cpuUsage: Math.round(cpuUsage),
      memoryUsage: {
        total: Math.round(totalMemGb * 10) / 10,
        used: Math.round(usedMemGb * 10) / 10,
        percentage: Math.round(memPercentage)
      },
      gpuInfo
    };
  }

  static async getServiceStatus(serviceId: string): Promise<ServiceStatus> {
    const config = SERVICES[serviceId];
    if (!config) throw new Error(`Unknown service: ${serviceId}`);

    const state = serviceStates[serviceId];

    // Check if the process is actually still alive if we have a PID
    if (state.pid && state.status !== 'offline') {
      try {
        process.kill(state.pid, 0); // Sends signal 0 to check if process exists
      } catch (e) {
        // Process is dead
        state.status = 'offline';
        state.pid = undefined;
        state.startTime = undefined;
      }
    }

    return {
      id: serviceId,
      status: state.status,
      pid: state.pid,
      uptime: state.startTime ? Math.floor((Date.now() - state.startTime) / 1000) : undefined,
      lastError: state.lastError
    };
  }

  static async startService(serviceId: string): Promise<void> {
    await this.init();
    const config = SERVICES[serviceId];
    if (!config) throw new Error(`Unknown service: ${serviceId}`);

    const state = serviceStates[serviceId];
    if (state.status === 'online' || state.status === 'starting') {
      throw new Error(`Service ${serviceId} is already ${state.status}`);
    }

    state.status = 'starting';
    state.lastError = undefined;

    const logFile = path.join(this.logDir, `${serviceId}.log`);
    const out = await fs.open(logFile, 'a');

    try {
      const env = { ...process.env };
      if (config.port) {
        env.PORT = config.port.toString();
      }

      // Using bash to source conda properly before running command
      const subprocess = spawn('bash', ['-c', config.startCommand], {
        cwd: config.workDir,
        detached: true, // Let it run independently
        stdio: ['ignore', out.fd, out.fd], // Redirect stdout and stderr to the log file
        env
      });

      if (subprocess.pid) {
        state.pid = subprocess.pid;
        state.startTime = Date.now();
        state.status = 'online';

        // Unref to allow node process to exit independently if needed
        subprocess.unref(); 

        subprocess.on('error', (err) => {
          state.status = 'error';
          state.lastError = err.message;
        });

        subprocess.on('exit', (code, signal) => {
          state.status = 'offline';
          state.pid = undefined;
          state.startTime = undefined;
          if (code !== 0 && signal !== 'SIGKILL' && signal !== 'SIGTERM') {
            state.lastError = `Exited with code ${code} (signal: ${signal})`;
          }
        });

      } else {
        throw new Error('Failed to spawn process (no PID)');
      }
    } catch (error: any) {
      state.status = 'error';
      state.lastError = error.message;
      throw error;
    } finally {
      // Close the file handle in this context (the spawned process retains the FD)
      await out.close();
    }
  }

  static async stopService(serviceId: string): Promise<void> {
    const config = SERVICES[serviceId];
    if (!config) throw new Error(`Unknown service: ${serviceId}`);

    const state = serviceStates[serviceId];
    if (!state.pid) {
      throw new Error(`Service ${serviceId} is not running`);
    }

    try {
      // If we used detached: true, we kill the process group by passing -pid
      process.kill(-state.pid, 'SIGTERM');
      
      // Wait a bit, then SIGKILL if still alive
      setTimeout(() => {
        try {
          if (state.pid) {
            process.kill(-state.pid, 'SIGKILL');
          }
        } catch (e) {
          // Ignore, probably already dead
        }
      }, 5000);

    } catch (e: any) {
      console.error(`Error killing service ${serviceId}:`, e);
      // Fallback: kill directly by PID
      try {
        process.kill(state.pid, 'SIGTERM');
      } catch (err) {
        // Process might already be dead
      }
    }

    state.status = 'offline';
    state.pid = undefined;
    state.startTime = undefined;
  }

  static async getServiceLogs(serviceId: string, lines: number = 100): Promise<string> {
    const logFile = path.join(this.logDir, `${serviceId}.log`);
    try {
      // Use tail command to efficiently grab last N lines without loading whole file
      const { stdout } = await execAsync(`tail -n ${lines} "${logFile}"`);
      return stdout;
    } catch (error: any) {
      if (error.message && error.message.includes('No such file or directory')) {
        return 'No logs available yet.';
      }
      return `Error reading logs: ${error.message}`;
    }
  }
}
