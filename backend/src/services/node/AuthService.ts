import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { CONFIG } from '../../config';
import { db } from '../../db';

export class NodeAuthService {
  static async generateToken(nodeId: string, name = 'primary'): Promise<{ token: string; raw: string }> {
    const raw = crypto.randomBytes(48).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const jti = crypto.randomUUID();

    await db.nodeToken.create({
      data: { nodeId, name, tokenHash: hash }
    });

    const token = jwt.sign(
      { sub: nodeId, jti, type: 'node' },
      CONFIG.JWT_SECRET,
      { expiresIn: '365d' }
    );

    return { token, raw };
  }

  static async validateConnection(token: string): Promise<{ nodeId: string } | null> {
    try {
      const decoded = jwt.verify(token, CONFIG.JWT_SECRET) as any;
      if (decoded.type !== 'node') return null;

      const nodeToken = await db.nodeToken.findFirst({
        where: { nodeId: decoded.sub, revoked: false },
        include: { node: true }
      });
      if (!nodeToken) return null;

      await db.nodeToken.update({
        where: { id: nodeToken.id },
        data: { lastUsed: new Date() }
      });

      return { nodeId: decoded.sub };
    } catch {
      return null;
    }
  }

  static async revokeToken(nodeId: string, name?: string): Promise<void> {
    const where: any = { nodeId };
    if (name) where.name = name;
    await db.nodeToken.updateMany({ where, data: { revoked: true } });
  }

  static async revokeAllTokens(nodeId: string): Promise<void> {
    await db.nodeToken.updateMany({
      where: { nodeId, revoked: false },
      data: { revoked: true }
    });
  }
}
