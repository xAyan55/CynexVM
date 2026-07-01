import { Server } from 'socket.io';

export class SocketService {
  private static io: Server | null = null;

  public static setIo(io: Server) {
    this.io = io;
  }

  public static getIo(): Server | null {
    return this.io;
  }

  public static emitToUser(userId: string, event: string, data: any) {
    if (this.io) {
      this.io.to(`user:${userId}`).emit(event, data);
    }
  }

  public static emitToAll(event: string, data: any) {
    if (this.io) {
      this.io.emit(event, data);
    }
  }
}
