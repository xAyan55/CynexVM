import { Router } from 'express';
import { db } from '../db';
import { authenticate, requirePermission, AuthenticatedRequest } from '../middleware/auth';
import { lxcProvider } from '../services/lxd/lxcProvider';

const router = Router({ mergeParams: true });

// Middleware to authorize container access
async function verifyContainerOwner(req: any, res: any, next: any) {
  const { id } = req.params;
  try {
    const instance = await db.instance.findUnique({
      where: { id },
      include: { node: true }
    });

    if (!instance) return res.status(404).json({ error: 'Instance not found' });

    // Ownership validation check
    if (req.user?.role !== 'Admin' && instance.userId !== req.user?.id) {
      return res.status(403).json({ error: 'Forbidden: You do not own this instance' });
    }

    req.instanceMetadata = instance;
    next();
  } catch (err: any) {
    return res.status(500).json({ error: 'Failed to negotiate container security context' });
  }
}

/**
 * @route   GET /api/v1/instances/:id/files/list
 * @desc    Lists directory items inside container/VM filesystem
 */
router.get('/list', authenticate, requirePermission('instance.files'), verifyContainerOwner, async (req: any, res) => {
  const dirPath = (req.query.path as string) || '/root';
  const instance = req.instanceMetadata;
  try {
    const provider = lxcProvider;
    const list = await provider.files(instance.node, instance, 'list', dirPath);
    return res.status(200).json(list);
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to list directory contents' });
  }
});

/**
 * @route   GET /api/v1/instances/:id/files/read
 * @desc    Reads file content directly from container/VM
 */
router.get('/read', authenticate, requirePermission('instance.files'), verifyContainerOwner, async (req: any, res) => {
  const filePath = req.query.path as string;
  const instance = req.instanceMetadata;
  if (!filePath) return res.status(400).json({ error: 'Path is required' });

  try {
    const provider = lxcProvider;
    const data = await provider.files(instance.node, instance, 'read', filePath);
    return res.status(200).json({ content: data });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to read file content' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/files/write
 * @desc    Writes string content into container/VM file
 */
router.post('/write', authenticate, requirePermission('instance.files'), verifyContainerOwner, async (req: any, res) => {
  const { path: filePath, content } = req.body;
  const instance = req.instanceMetadata;
  if (!filePath || content === undefined) {
    return res.status(400).json({ error: 'Path and content parameters are required' });
  }

  try {
    const provider = lxcProvider;
    await provider.files(instance.node, instance, 'write', filePath, { content });
    return res.status(200).json({ success: true, message: 'File written successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to save file' });
  }
});

/**
 * @route   DELETE /api/v1/instances/:id/files/delete
 * @desc    Deletes file or directory from container/VM
 */
router.delete('/delete', authenticate, requirePermission('instance.files'), verifyContainerOwner, async (req: any, res) => {
  const { path: filePath } = req.body;
  const instance = req.instanceMetadata;
  if (!filePath) return res.status(400).json({ error: 'Path is required' });

  try {
    const provider = lxcProvider;
    await provider.files(instance.node, instance, 'delete', filePath);
    return res.status(200).json({ success: true, message: 'File deleted successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to delete file' });
  }
});

/**
 * @route   POST /api/v1/instances/:id/files/upload
 * @desc    Uploads a binary/text file directly using base64 payload
 */
router.post('/upload', authenticate, requirePermission('instance.files'), verifyContainerOwner, async (req: any, res) => {
  const { path: filePath, base64Content } = req.body;
  const instance = req.instanceMetadata;
  if (!filePath || base64Content === undefined) {
    return res.status(400).json({ error: 'Path and base64Content are required' });
  }

  try {
    const buffer = Buffer.from(base64Content, 'base64');
    const provider = lxcProvider;
    await provider.files(instance.node, instance, 'write', filePath, { content: buffer });
    return res.status(200).json({ success: true, message: 'File uploaded successfully' });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || 'Failed to upload file' });
  }
});

export default router;
