import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { CONFIG } from '../config';
import { db } from '../db';
import crypto from 'crypto';

export interface AuthenticatedRequest extends Request {
  user?: {
    id: string;
    username: string;
    email: string;
    role: string;
    permissions: string[];
  };
  apiKey?: {
    id: string;
    name: string;
    scopes: string[];
  };
}

/**
 * Validates active JWT user sessions or API Keys.
 */
export async function authenticate(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  try {
    // 1. Check API Key first
    const apiKeyHeader = req.headers['x-api-key'] || req.query.api_key;
    if (apiKeyHeader && typeof apiKeyHeader === 'string') {
      const hash = crypto.createHash('sha256').update(apiKeyHeader).digest('hex');
      const apiKeyRecord = await db.apiKey.findUnique({
        where: { keyHash: hash },
        include: {
          user: {
            include: {
              roles: {
                include: {
                  role: {
                    include: {
                      permissions: {
                        include: { permission: true }
                      }
                    }
                  }
                }
              }
            }
          },
          scopes: {
            include: { scope: true }
          }
        }
      });

      if (!apiKeyRecord) {
        return res.status(401).json({ error: 'Invalid API Key' });
      }

      if (apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < new Date()) {
        return res.status(401).json({ error: 'API Key has expired' });
      }

      const user = apiKeyRecord.user;
      const permissions = user.roles.flatMap(ur => 
        ur.role.permissions.map(rp => rp.permission.name)
      );

      req.user = {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.roles[0]?.role.name || 'User',
        permissions
      };

      req.apiKey = {
        id: apiKeyRecord.id,
        name: apiKeyRecord.name,
        scopes: apiKeyRecord.scopes.map(s => s.scope.name)
      };

      return next();
    }

    // 2. Validate JWT access tokens
    let token = '';
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.split(' ')[1];
    } else if (req.cookies?.accessToken) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      return res.status(401).json({ error: 'Authentication token is required' });
    }

    const decoded = jwt.verify(token, CONFIG.JWT_SECRET) as any;
    if (!decoded || !decoded.userId) {
      return res.status(401).json({ error: 'Invalid authentication token payload' });
    }
    
    // Check user and permissions directly from decoded token
    const user = await db.user.findUnique({
      where: { id: decoded.userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true }
                }
              }
            }
          }
        }
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'User associated with token not found' });
    }

    const permissions = user.roles.flatMap(ur => 
      ur.role.permissions.map(rp => rp.permission.name)
    );

    req.user = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.roles[0]?.role.name || 'User',
      permissions
    };

    next();
  } catch (err: any) {
    return res.status(401).json({ error: 'Invalid or expired authentication token' });
  }
}

/**
 * Enforces specific permission checks.
 */
export function requirePermission(permissionName: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    const hasPermission = req.user.permissions.includes(permissionName) || req.user.role === 'Admin';
    if (!hasPermission) {
      return res.status(403).json({ error: `Forbidden: Missing permission [${permissionName}]` });
    }

    next();
  };
}

/**
 * Enforces role checks.
 */
export function requireRole(roleName: string) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== roleName && req.user.role !== 'Admin') {
      return res.status(403).json({ error: `Forbidden: Requires role [${roleName}]` });
    }

    next();
  };
}
