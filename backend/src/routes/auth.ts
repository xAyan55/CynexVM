import { Router, Response } from 'express';
import { db } from '../db';
import { CONFIG } from '../config';
import { authLimiter } from '../middleware/rateLimit';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import speakeasy from 'speakeasy';
import qrcode from 'qrcode';
import crypto from 'crypto';

const router = Router();

// Helpers
const generateAccessToken = (userId: string): string => {
  return jwt.sign({ userId }, CONFIG.JWT_SECRET, { expiresIn: '7d' });
};

const generateRefreshToken = (sessionId: string): string => {
  return jwt.sign({ sessionId }, CONFIG.JWT_REFRESH_SECRET, { expiresIn: '7d' });
};

/**
 * @route   POST /api/v1/auth/register
 * @desc    Registers a new system user
 */
router.post('/register', authLimiter, async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !email || !password) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  try {
    const existing = await db.user.findFirst({
      where: { OR: [{ email }, { username }] }
    });

    if (existing) {
      return res.status(400).json({ error: 'Username or Email is already registered' });
    }

    // Secure Argon2id hashing
    const passwordHash = await argon2.hash(password, {
      memoryCost: 65536,
      timeCost: 3,
      parallelism: 4
    });

    const userRole = await db.role.findUnique({ where: { name: 'User' } });
    if (!userRole) throw new Error('Default User role not found in database');

    const newUser = await db.user.create({
      data: {
        username,
        email,
        passwordHash
      }
    });

    // Link user to role
    await db.userRole.create({
      data: {
        userId: newUser.id,
        roleId: userRole.id
      }
    });

    // Log action
    await db.auditLog.create({
      data: {
        userId: newUser.id,
        username: newUser.username,
        action: 'auth.register',
        ipAddress: req.ip,
        details: `User registered: ${newUser.username}`,
        severity: 'info'
      }
    });

    return res.status(201).json({ message: 'User registered successfully. Please log in.' });
  } catch (err: any) {
    console.error('Registration error:', err);
    return res.status(500).json({ error: 'Internal server error during registration' });
  }
});

/**
 * @route   POST /api/v1/auth/login
 * @desc    Authenticates credentials and handles 2FA challenges
 */
router.post('/login', authLimiter, async (req, res) => {
  const { identifier, password, deviceId } = req.body; // identifier = email or username
  if (!identifier || !password) {
    return res.status(400).json({ error: 'Credentials are required' });
  }

  try {
    const user = await db.user.findFirst({
      where: { OR: [{ email: identifier }, { username: identifier }] },
      include: {
        roles: { include: { role: true } }
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    // Account Lockout check
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return res.status(403).json({ error: `Account is locked. Try again later.` });
    }

    // Password validation
    const passwordMatch = await argon2.verify(user.passwordHash, password);
    if (!passwordMatch) {
      // Track login attempts
      const updatedAttempts = user.loginAttempts + 1;
      const dataToUpdate: any = { loginAttempts: updatedAttempts };
      
      if (updatedAttempts >= 5) {
        dataToUpdate.lockedUntil = new Date(Date.now() + 15 * 60 * 1000); // 15 mins lock
        dataToUpdate.loginAttempts = 0; // reset counter after locking
      }

      await db.user.update({
        where: { id: user.id },
        data: dataToUpdate
      });

      return res.status(401).json({ error: 'Invalid username/email or password' });
    }

    // Reset login attempts
    await db.user.update({
      where: { id: user.id },
      data: { loginAttempts: 0, lockedUntil: null }
    });

    // Check if 2FA is active
    if (user.twoFactorEnabled) {
      // Return a temporary 2FA token
      const tempToken = jwt.sign({ userId: user.id, requires2Fa: true }, CONFIG.JWT_SECRET, { expiresIn: '5m' });
      return res.status(200).json({
        requires2FA: true,
        tempToken,
        message: 'Two-factor authentication required.'
      });
    }

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = await db.session.create({
      data: {
        userId: user.id,
        token: sessionToken,
        refreshToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        deviceId: deviceId || 'unknown',
        expiresAt
      }
    });

    const accessToken = generateAccessToken(user.id);
    const clientRefreshToken = generateRefreshToken(session.id);

    // Set secure cookie
    res.cookie('accessToken', accessToken, { httpOnly: true, secure: CONFIG.NODE_ENV === 'production', sameSite: 'strict' });

    // Log action
    await db.auditLog.create({
      data: {
        userId: user.id,
        username: user.username,
        action: 'auth.login',
        ipAddress: req.ip,
        sessionId: session.id,
        details: `Login successful for ${user.username}`,
        severity: 'info'
      }
    });

    return res.status(200).json({
      accessToken,
      refreshToken: clientRefreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.roles[0]?.role.name || 'User'
      }
    });
  } catch (err: any) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'Internal server error during login' });
  }
});

/**
 * @route   POST /api/v1/auth/2fa/setup
 * @desc    Initiates 2FA setup and returns QR code
 */
router.post('/2fa/setup', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await db.user.findUnique({ where: { id: req.user.id } });
    if (!user) return res.status(404).json({ error: 'User not found' });

    if (user.twoFactorEnabled) {
      return res.status(400).json({ error: '2FA is already enabled' });
    }

    const secret = speakeasy.generateSecret({ name: `CynexVM:${user.email}` });
    
    await db.user.update({
      where: { id: user.id },
      data: { twoFactorSecret: secret.base32 }
    });

    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url || '');

    return res.status(200).json({
      secret: secret.base32,
      qrCode: qrCodeUrl
    });
  } catch (err: any) {
    console.error('2FA Setup error:', err);
    return res.status(500).json({ error: 'Failed to initiate 2FA setup' });
  }
});

/**
 * @route   POST /api/v1/auth/2fa/verify
 * @desc    Verifies TOTP token to activate 2FA
 */
router.post('/2fa/verify', authenticate, async (req: AuthenticatedRequest, res) => {
  const { code } = req.body;
  if (!req.user || !code) return res.status(400).json({ error: '2FA verification code required' });

  try {
    const user = await db.user.findUnique({ where: { id: req.user.id } });
    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ error: '2FA has not been set up' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 1 // 30s drift window
    });

    if (!verified) {
      return res.status(400).json({ error: 'Invalid code verification failed' });
    }

    await db.user.update({
      where: { id: user.id },
      data: { twoFactorEnabled: true }
    });

    // Log action
    await db.auditLog.create({
      data: {
        userId: user.id,
        username: user.username,
        action: 'auth.2fa.enable',
        ipAddress: req.ip,
        details: '2FA enabled successfully',
        severity: 'warning'
      }
    });

    return res.status(200).json({ message: '2FA enabled successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to verify 2FA token' });
  }
});

/**
 * @route   POST /api/v1/auth/2fa/validate-login
 * @desc    Validates 2FA code during login sequence
 */
router.post('/2fa/validate-login', async (req, res) => {
  const { tempToken, code, deviceId } = req.body;
  if (!tempToken || !code) {
    return res.status(400).json({ error: '2FA validation code and tempToken are required' });
  }

  try {
    const decoded = jwt.verify(tempToken, CONFIG.JWT_SECRET) as any;
    if (!decoded.userId || !decoded.requires2Fa) {
      return res.status(400).json({ error: 'Invalid temporary validation token' });
    }

    const user = await db.user.findUnique({
      where: { id: decoded.userId },
      include: { roles: { include: { role: true } } }
    });

    if (!user || !user.twoFactorSecret) {
      return res.status(400).json({ error: 'User does not have 2FA enabled' });
    }

    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: code,
      window: 1
    });

    if (!verified) {
      return res.status(401).json({ error: 'Invalid 2FA code' });
    }

    // Create session
    const sessionToken = crypto.randomBytes(32).toString('hex');
    const refreshToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const session = await db.session.create({
      data: {
        userId: user.id,
        token: sessionToken,
        refreshToken,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        deviceId: deviceId || 'unknown',
        expiresAt
      }
    });

    const accessToken = generateAccessToken(user.id);
    const clientRefreshToken = generateRefreshToken(session.id);

    res.cookie('accessToken', accessToken, { httpOnly: true, secure: CONFIG.NODE_ENV === 'production', sameSite: 'strict' });

    // Log action
    await db.auditLog.create({
      data: {
        userId: user.id,
        username: user.username,
        action: 'auth.login.2fa',
        ipAddress: req.ip,
        sessionId: session.id,
        details: 'Login successful via 2FA verification',
        severity: 'info'
      }
    });

    return res.status(200).json({
      accessToken,
      refreshToken: clientRefreshToken,
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        role: user.roles[0]?.role.name || 'User'
      }
    });
  } catch (err: any) {
    return res.status(401).json({ error: 'Verification failed or token expired' });
  }
});

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Rotates session access and refresh tokens (rotates on request)
 */
router.post('/refresh-token', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ error: 'Refresh token is required' });
  }

  try {
    const decoded = jwt.verify(refreshToken, CONFIG.JWT_REFRESH_SECRET) as any;
    const session = await db.session.findUnique({
      where: { id: decoded.sessionId }
    });

    if (!session || session.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Invalid or expired session' });
    }

    // Rotate refresh token
    const newSessionToken = crypto.randomBytes(32).toString('hex');
    const newRefreshToken = crypto.randomBytes(32).toString('hex');
    const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    const updatedSession = await db.session.update({
      where: { id: session.id },
      data: {
        token: newSessionToken,
        refreshToken: newRefreshToken,
        expiresAt: newExpiresAt,
        ipAddress: req.ip
      }
    });

    const newAccessToken = generateAccessToken(session.userId);
    const clientRefreshToken = generateRefreshToken(updatedSession.id);

    res.cookie('accessToken', newAccessToken, { httpOnly: true, secure: CONFIG.NODE_ENV === 'production', sameSite: 'strict' });

    return res.status(200).json({
      accessToken: newAccessToken,
      refreshToken: clientRefreshToken
    });
  } catch (err: any) {
    return res.status(401).json({ error: 'Invalid or expired session refresh token' });
  }
});

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Invalidates current session
 */
router.post('/logout', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const token = req.cookies?.accessToken || req.headers.authorization?.split(' ')[1];
    
    if (token) {
      await db.session.deleteMany({ where: { token } });
    }

    res.clearCookie('accessToken');
    return res.status(200).json({ message: 'Logged out successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to logout' });
  }
});

/**
 * @route   POST /api/v1/auth/logout-all
 * @desc    Invalidates all user sessions
 */
router.post('/logout-all', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await db.session.deleteMany({
      where: { userId: req.user.id }
    });

    res.clearCookie('accessToken');
    return res.status(200).json({ message: 'All active sessions invalidated.' });
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to invalidate sessions.' });
  }
});

/**
 * @route   GET /api/v1/auth/me
 * @desc    Returns current authenticated profile
 */
router.get('/me', authenticate, async (req: AuthenticatedRequest, res) => {
  if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const user = await db.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        username: true,
        email: true,
        twoFactorEnabled: true,
        roles: { include: { role: true } }
      }
    });

    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.status(200).json({
      user: {
        id: user.id,
        username: user.username,
        email: user.email,
        twoFactorEnabled: user.twoFactorEnabled,
        role: user.roles[0]?.role.name || 'User',
        permissions: req.user.permissions
      }
    });
  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * @route   GET /api/v1/auth/users
 * @desc    Get list of all users
 */
router.get('/users', authenticate, async (req, res) => {
  try {
    const users = await db.user.findMany({
      select: {
        id: true,
        username: true,
        email: true
      }
    });
    return res.status(200).json(users);
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to fetch users' });
  }
});

export default router;
