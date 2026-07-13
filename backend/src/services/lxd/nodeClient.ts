import { exec } from 'child_process';
import { promisify } from 'util';
import axios from 'axios';
import { db } from '../../db';
import { CryptoService } from '../cryptoService';

const execAsync = promisify(exec);

export class NodeClient {
  /**
   * Decrypts the apiToken of a node.
   */
  private static async getNodeToken(node: any): Promise<string> {
    if (!node.apiToken || node.apiToken === 'local-token') {
      return '';
    }
    try {
      return CryptoService.decrypt(node.apiToken);
    } catch (_) {
      return node.apiToken;
    }
  }

  /**
   * Checks if a node is local.
   */
  public static isLocal(node: any): boolean {
    return (
      !node ||
      node.hostname === 'localhost' ||
      node.apiUrl?.includes('localhost') ||
      node.apiUrl?.includes('127.0.0.1')
    );
  }

  /**
   * Executes a CLI shell command on a node (local or remote).
   */
  public static async executeCommand(
    nodeId: string | null,
    cmd: string,
    timeoutMs: number = 60000
  ): Promise<{ stdout: string; stderr: string; exitCode: number }> {
    let node: any = null;
    if (nodeId) {
      node = await db.node.findUnique({ where: { id: nodeId } });
    }

    if (!node || this.isLocal(node)) {
      // Local execution
      try {
        const { stdout, stderr } = await execAsync(cmd, { timeout: timeoutMs });
        return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode: 0 };
      } catch (err: any) {
        return {
          stdout: err.stdout?.trim() || '',
          stderr: err.stderr?.trim() || err.message,
          exitCode: err.code || 1,
        };
      }
    } else {
      // Remote execution via CynexD daemon
      const token = await this.getNodeToken(node);
      const res = await axios.post(
        `${node.apiUrl}/api/v1/exec`,
        { command: cmd },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: timeoutMs,
        }
      );
      return res.data; // Expected { stdout, stderr, exitCode }
    }
  }

  /**
   * Dispatches an HTTP/REST request to a node's local LXD Unix Socket or daemon.
   */
  public static async requestLxd(
    nodeId: string | null,
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    data?: any
  ): Promise<any> {
    let node: any = null;
    if (nodeId) {
      node = await db.node.findUnique({ where: { id: nodeId } });
    }

    if (!node || this.isLocal(node)) {
      // Local LXD Unix Socket request
      const { LxdClient } = require('../lxd/lxdClient');
      return LxdClient.request(null, url, method, data);
    } else {
      // Remote LXD request proxied through CynexD daemon
      const token = await this.getNodeToken(node);
      const res = await axios.post(
        `${node.apiUrl}/api/v1/lxd`,
        { url, method, data },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 120000,
        }
      );
      return res.data;
    }
  }
}
