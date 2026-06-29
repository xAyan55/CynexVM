import { Client } from 'ssh2';
import { Socket } from 'socket.io';

export interface SshCredentials {
  host: string;
  port?: number;
  username: string;
  password?: string;
  privateKey?: string;
}

export class SshService {
  /**
   * Spawns an interactive SSH terminal shell session and pipes it to a Socket.IO client.
   */
  public static handleTerminalSocket(socket: Socket, creds: SshCredentials): void {
    const conn = new Client();
    
    conn.on('ready', () => {
      socket.emit('terminal.log', '\r\n*** SSH CONNECTION ESTABLISHED ***\r\n');
      
      conn.shell({ term: 'xterm-256color', cols: 80, rows: 24 }, (err, stream) => {
        if (err) {
          socket.emit('terminal.log', `\r\n*** SSH SHELL ERROR: ${err.message} ***\r\n`);
          return conn.end();
        }

        // Pipe stream out to WebSocket client
        stream.on('data', (data: Buffer) => {
          socket.emit('terminal.data', data.toString('utf-8'));
        });

        stream.on('close', () => {
          socket.emit('terminal.log', '\r\n*** SSH SHELL CLOSED ***\r\n');
          conn.end();
        });

        // Receive input from WebSocket and pipe to SSH stdin
        socket.on('terminal.input', (data: string) => {
          stream.write(data);
        });

        // Handle resize events
        socket.on('terminal.resize', (size: { cols: number; rows: number }) => {
          stream.setWindow(size.rows, size.cols, 0, 0);
        });

        socket.on('disconnect', () => {
          stream.end();
          conn.end();
        });
      });
    });

    conn.on('error', (err) => {
      socket.emit('terminal.log', `\r\n*** SSH ERROR: ${err.message} ***\r\n`);
      socket.disconnect();
    });

    conn.on('close', () => {
      socket.emit('terminal.log', '\r\n*** CONNECTION CLOSED ***\r\n');
    });

    // Initiate connection
    conn.connect({
      host: creds.host,
      port: creds.port || 22,
      username: creds.username,
      password: creds.password,
      privateKey: creds.privateKey,
      readyTimeout: 10000,
    });
  }

  /**
   * Runs an SFTP operation over SSH.
   */
  public static executeSftp<T>(creds: SshCredentials, operation: (sftp: any) => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const conn = new Client();
      
      conn.on('ready', () => {
        conn.sftp((err, sftp) => {
          if (err) {
            conn.end();
            return reject(err);
          }
          
          operation(sftp)
            .then((result) => {
              conn.end();
              resolve(result);
            })
            .catch((opErr) => {
              conn.end();
              reject(opErr);
            });
        });
      });

      conn.on('error', (err) => {
        reject(err);
      });

      conn.connect({
        host: creds.host,
        port: creds.port || 22,
        username: creds.username,
        password: creds.password,
        privateKey: creds.privateKey,
        readyTimeout: 10000,
      });
    });
  }

  /**
   * Lists folder contents using SFTP.
   */
  public static async listDirectory(creds: SshCredentials, dirPath: string): Promise<any[]> {
    return this.executeSftp(creds, (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.readdir(dirPath, (err: any, list: any[]) => {
          if (err) return reject(err);
          // Map file listing details
          const items = list.map((item) => ({
            name: item.filename,
            size: item.attrs.size,
            uid: item.attrs.uid,
            gid: item.attrs.gid,
            permissions: item.attrs.permissions,
            isDirectory: (item.attrs.mode & 0o170000) === 0o040000,
            isSymbolicLink: (item.attrs.mode & 0o170000) === 0o120000,
            mtime: item.attrs.mtime * 1000,
          }));
          resolve(items);
        });
      });
    });
  }

  /**
   * Reads file content into string.
   */
  public static async readFile(creds: SshCredentials, filePath: string): Promise<string> {
    return this.executeSftp(creds, (sftp) => {
      return new Promise((resolve, reject) => {
        const stream = sftp.createReadStream(filePath, { encoding: 'utf8' });
        let data = '';
        stream.on('data', (chunk: string) => { data += chunk; });
        stream.on('end', () => resolve(data));
        stream.on('error', (err: any) => reject(err));
      });
    });
  }

  /**
   * Writes string data into file.
   */
  public static async writeFile(creds: SshCredentials, filePath: string, content: string): Promise<void> {
    return this.executeSftp(creds, (sftp) => {
      return new Promise((resolve, reject) => {
        const stream = sftp.createWriteStream(filePath, { encoding: 'utf8' });
        stream.on('finish', () => resolve());
        stream.on('error', (err: any) => reject(err));
        stream.write(content);
        stream.end();
      });
    });
  }

  /**
   * Deletes a file.
   */
  public static async deleteFile(creds: SshCredentials, filePath: string): Promise<void> {
    return this.executeSftp(creds, (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.unlink(filePath, (err: any) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }

  /**
   * Deletes a directory.
   */
  public static async deleteDirectory(creds: SshCredentials, dirPath: string): Promise<void> {
    return this.executeSftp(creds, (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.rmdir(dirPath, (err: any) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }

  /**
   * Modifies file permissions (chmod).
   */
  public static async chmod(creds: SshCredentials, path: string, mode: number): Promise<void> {
    return this.executeSftp(creds, (sftp) => {
      return new Promise((resolve, reject) => {
        sftp.chmod(path, mode, (err: any) => {
          if (err) return reject(err);
          resolve();
        });
      });
    });
  }
}
