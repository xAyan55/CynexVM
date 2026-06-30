import { LxdClient } from './lxdClient';

export class LxdFileService {
  /**
   * Reads raw file contents directly from a container filesystem via LXD REST API
   */
  public static async readFile(nodeId: string | null, vmid: number, filePath: string): Promise<string> {
    const containerName = `cynex-${vmid}`;
    // LXD REST API: GET /1.0/instances/{name}/files?path={filePath}
    const res = await LxdClient.request(
      nodeId,
      `/1.0/instances/${containerName}/files?path=${encodeURIComponent(filePath)}`,
      'GET'
    );
    // LXD returns file contents directly as body string or buffer
    return typeof res === 'object' ? JSON.stringify(res) : String(res);
  }

  /**
   * Writes string or binary data directly into a file in the container filesystem via LXD REST API
   */
  public static async writeFile(nodeId: string | null, vmid: number, filePath: string, content: string | Buffer): Promise<void> {
    const containerName = `cynex-${vmid}`;
    // LXD REST API: POST /1.0/instances/{name}/files?path={filePath}
    await LxdClient.request(
      nodeId,
      `/1.0/instances/${containerName}/files?path=${encodeURIComponent(filePath)}`,
      'POST',
      content
    );
  }

  /**
   * Deletes a file or directory from the container filesystem via LXD REST API
   */
  public static async deleteFile(nodeId: string | null, vmid: number, filePath: string): Promise<void> {
    const containerName = `cynex-${vmid}`;
    // LXD REST API: DELETE /1.0/instances/{name}/files?path={filePath}
    await LxdClient.request(
      nodeId,
      `/1.0/instances/${containerName}/files?path=${encodeURIComponent(filePath)}`,
      'DELETE'
    );
  }

  /**
   * Helper to list directory contents (uses lxc exec command inside container to list)
   */
  public static async listDirectory(nodeId: string | null, vmid: number, dirPath: string): Promise<any[]> {
    const containerName = `cynex-${vmid}`;
    const tempFile = `/tmp/cynex-ls-${Date.now()}.txt`;
    try {
      // 1. Run ls command and redirect output to a temp file inside the container
      await LxdClient.request(
        nodeId,
        `/1.0/instances/${containerName}/exec`,
        'POST',
        {
          command: ['sh', '-c', `ls -la --time-style=long-iso "${dirPath}" > ${tempFile}`],
          environment: {},
          'wait-for-variables': true,
          record: false
        }
      );

      // 2. Read the temp file content
      const output = await this.readFile(nodeId, vmid, tempFile);

      // 3. Clean up the temp file
      await this.deleteFile(nodeId, vmid, tempFile).catch(() => {});

      // 4. Parse output
      return this.parseLsOutput(output);
    } catch (err: any) {
      console.error(`[LxdFileService.listDirectory] Error:`, err.message);
      return [];
    }
  }

  private static parseLsOutput(stdout: string): any[] {
    if (!stdout) return [];
    const lines = stdout.split('\n');
    const items: any[] = [];

    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 8) continue;
      const permissions = parts[0];
      if (permissions.startsWith('total')) continue;
      const owner = parts[2];
      const group = parts[3];
      const sizeBytes = parseInt(parts[4], 10);
      const date = parts[5];
      const time = parts[6];
      const name = parts.slice(7).join(' ');

      if (name === '.' || name === '..') continue;

      items.push({
        name,
        isDirectory: permissions.startsWith('d'),
        size: sizeBytes,
        owner,
        group,
        permissions,
        updatedAt: `${date} ${time}`
      });
    }
    return items;
  }
}
