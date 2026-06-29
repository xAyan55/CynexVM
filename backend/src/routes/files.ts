import { Router } from 'express';
import { db } from '../db';
import { authenticate, requirePermission } from '../middleware/auth';
import { SshService } from '../services/sshService';

const router = Router({ mergeParams: true });

// Middleware to extract SSH credentials
async function getSshCreds(req: any, res: any, next: any) {
  const { id } = req.params;
  try {
    const instance = await db.instance.findUnique({
      where: { id },
      include: { node: true }
    });

    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    // In a real setup, we use the container IP, username, and password configured in setting or body
    // If not passed in body or headers, we default to host settings.
    const host = req.query.host || req.body.host || instance.ipAddress;
    const username = req.query.username || req.body.username || 'root';
    const password = req.query.password || req.body.password || instance.password;

    if (!host) {
      return res.status(400).json({ error: 'Container IP address is required for SSH/SFTP connections. Please configure the networking tab.' });
    }

    req.sshCreds = {
      host,
      username,
      password,
      port: 22
    };

    next();
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to negotiate SSH connection context' });
  }
}

/**
 * @route   GET /api/v1/instances/:id/files/list
 * @desc    Lists directory items inside container
 */
router.get('/list', authenticate, requirePermission('instance.files'), getSshCreds, async (req: any, res) => {
  const dirPath = (req.query.path as string) || '/root';
  try {
    const list = await SshService.listDirectory(req.sshCreds, dirPath);
    return res.status(200).json(list);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to list directory contents' });
  }
});

/**
 * @route   GET /api/v1/instances/:id/files/read
 * @desc    Reads file content
 */
router.get('/read', authenticate, requirePermission('instance.files'), getSshCreds, async (req: any, res) => {
  const filePath = req.query.path as string;
  if (!filePath) return res.status(400).json({ error: 'Path is required' });

  try {
    const data = await SshService.readFile(req.sshCreds, filePath);
    return res.status(200).json({ content: data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to read file content' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/files/write
 * @desc    Writes string content into container file
 */
router.post('/write', authenticate, requirePermission('instance.files'), getSshCreds, async (req: any, res) => {
  const { path: filePath, content } = req.body;
  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'Path and content parameters are required' });
  }

  try {
    await SshService.writeFile(req.sshCreds, filePath, content);
    return res.status(200).json({ success: true, message: 'File written successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to save file' });
  }
});

/**
 * @route   DELETE /api/v1/instances/:id/files/delete
 * @desc    Deletes file or directory
 */
router.delete('/delete', authenticate, requirePermission('instance.files'), getSshCreds, async (req: any, res) => {
  const { path: filePath, isDirectory } = req.body;
  if (!filePath) return res.status(400).json({ error: 'Path is required' });

  try {
    if (isDirectory) {
      await SshService.deleteDirectory(req.sshCreds, filePath);
    } else {
      await SshService.deleteFile(req.sshCreds, filePath);
    }
    return res.status(200).json({ success: true, message: 'Deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Deletion failed' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/files/chmod
 * @desc    Chmods file permissions
 */
router.post('/chmod', authenticate, requirePermission('instance.files'), getSshCreds, async (req: any, res) => {
  const { path: filePath, mode } = req.body;
  if (!filePath || !mode) return res.status(400).json({ error: 'Path and octal mode are required' });

  try {
    // Parse octal string e.g. "0755" or number 755
    const numericMode = typeof mode === 'string' ? parseInt(mode, 8) : mode;
    await SshService.chmod(req.sshCreds, filePath, numericMode);
    return res.status(200).json({ success: true, message: 'Permissions updated successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to update permissions' });
  }
});

export default router;
