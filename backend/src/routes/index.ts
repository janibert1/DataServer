import { Router } from 'express';
import { authRouter } from './auth';
import { filesRouter } from './files';
import { foldersRouter } from './folders';
import { invitationsRouter } from './invitations';
import { sharedRouter } from './shared';
import { notificationsRouter } from './notifications';
import { adminRouter } from './admin';
import { accountRouter } from './account';

export const router = Router();

router.use('/auth', authRouter);
router.use('/files', filesRouter);
router.use('/folders', foldersRouter);
router.use('/invitations', invitationsRouter);
router.use('/shared', sharedRouter);
router.use('/notifications', notificationsRouter);
router.use('/admin', adminRouter);
router.use('/account', accountRouter);
