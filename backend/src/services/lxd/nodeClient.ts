import { LxdClient } from './lxdClient';

export class NodeClient {
  static isLocal(node: any): boolean {
    return !node || node.hostname === 'localhost' || node.apiUrl?.includes('localhost') || node.apiUrl?.includes('127.0.0.1');
  }

  static async executeCommand(nodeId: string | null, cmd: string, timeoutMs = 60000): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);
    try {
      const { stdout, stderr } = await execAsync(cmd, { timeout: timeoutMs });
      return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
    } catch (err: any) {
      return { stdout: err.stdout?.trim() || '', stderr: err.stderr?.trim() || err.message, exitCode: err.code || 1 };
    }
  }

  static async requestLxd(nodeId: string | null, url: string, method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE', data?: any): Promise<any> {
    return LxdClient.request(null, url, method, data);
  }
}
