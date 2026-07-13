import axios, { AxiosInstance } from 'axios';
import { db } from '../../db';

export class LxdClient {
  private static getSocketPath(): string {
    const fs = require('fs');
    if (fs.existsSync('/var/snap/lxd/common/lxd/unix.socket')) {
      return '/var/snap/lxd/common/lxd/unix.socket';
    }
    if (fs.existsSync('/var/lib/lxd/unix.socket')) {
      return '/var/lib/lxd/unix.socket';
    }
    return '/var/snap/lxd/common/lxd/unix.socket'; // default fallback
  }

  /**
   * Dispatches a REST API call to local or remote LXD node
   */
  public static async request(
    nodeId: string | null,
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    data?: any
  ): Promise<any> {
    // If no nodeId is provided, default to local node
    if (!nodeId) {
      return this.localRequest(url, method, data);
    }

    try {
      const node = await db.node.findUnique({ where: { id: nodeId } });
      if (!node) {
        throw new Error(`Node not found: ${nodeId}`);
      }

      // Check if node is local
      if (node.hostname === 'localhost' || node.apiUrl?.includes('localhost') || node.apiUrl?.includes('127.0.0.1')) {
        return this.localRequest(url, method, data);
      }

      // Remote Node Daemon connection
      const client = axios.create({
        baseURL: node.apiUrl || undefined,
        headers: {
          'Authorization': `Bearer ${node.apiToken || ''}`,
          'Content-Type': 'application/json'
        },
        timeout: 25000
      });

      // Map native LXD paths to remote daemon API proxy pathways
      const isContainerRequest = url.match(/^\/1\.0\/instances\/cynex-(\d+)/);
      if (isContainerRequest) {
        const vmid = isContainerRequest[1];
        if (url.endsWith('/state')) {
          if (method === 'GET') {
            const res = await client.get(`/api/v1/containers/${vmid}/status`);
            return res.data;
          } else if (method === 'PUT') {
            const action = data?.action; // "start" | "stop" | "restart" | "freeze" | "unfreeze"
            const queryAction = action === 'restart' ? 'reboot' : action;
            const res = await client.post(`/api/v1/containers/${vmid}/${queryAction}`);
            return res.data;
          }
        } else if (method === 'DELETE') {
          const res = await client.delete(`/api/v1/containers/${vmid}`);
          return res.data;
        }
      }

      console.warn(`[LxdClient] Remote API request fallback for ${method} ${url}`);
      return null;
    } catch (err: any) {
      console.error(`[LxdClient Error] Failed request to node ${nodeId} (${method} ${url}):`, err.message);
      throw new Error(err.response?.data?.error || err.message || 'LXD request failed');
    }
  }

  /**
   * Queries local LXD Unix Socket directly
   */
  private static async localRequest(
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
    data?: any
  ): Promise<any> {
    try {
      const client = axios.create({
        socketPath: this.getSocketPath(),
        baseURL: 'http://localhost',
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 120000
      });

      const res = await client.request({
        url,
        method,
        data
      });

      const body = res.data;
      if (body.type === 'sync' && body.status === 'Success') {
        return body.metadata;
      } else if (body.type === 'async') {
        const opId = body.metadata.id;
        return this.waitForOperation(opId);
      }
      return body.metadata || body;
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || err.message;
      console.error(`[LxdClient Local Error] Socket request failed (${method} ${url}):`, errorMsg);
      throw new Error(errorMsg);
    }
  }

  /**
   * Polls local operation status until completed
   */
  private static async waitForOperation(opId: string): Promise<any> {
    const client = axios.create({
      socketPath: this.getSocketPath(),
      baseURL: 'http://localhost'
    });

    for (let i = 0; i < 300; i++) {
      try {
        const res = await client.get(`/1.0/operations/${opId}`);
        const op = res.data.metadata;
        if (op.status === 'Success') {
          return op.resources || op;
        } else if (op.status === 'Failure') {
          throw new Error(op.err || 'Operation failed');
        }
        await new Promise(r => setTimeout(r, 1000));
      } catch (err: any) {
        throw new Error(err.message);
      }
    }
    throw new Error(`Timeout waiting for LXD operation: ${opId}`);
  }
}
