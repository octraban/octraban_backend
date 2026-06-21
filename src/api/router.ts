import { Router } from 'express';
import { i18nRouter } from './i18n';
import { transactionRouter } from './transactions';
import { eventRouter } from './events';
import { contractRouter } from './contracts';
import { walletRouter } from './wallets';
import { tokenRouter } from './tokens';
import { authorizationRouter } from './authorizations';
import { renderRouter } from './render';
import { simulateRouter } from './simulate';
import { verifyRouter } from './verify';
import { syncStateRouter } from './sync-state';
import { networkRouter } from './network';
import { tokenMetadataRouter } from './token-metadata';
import { protocolRouter } from './protocol';
import { authRouter } from './auth';
import { authMultisigRouter } from './authMultisig';
import { authProfileRouter } from './authProfile';
import { authSecurityRouter } from './authSecurity';
import { authWebhooksRouter } from './authWebhooks';
import { authOAuth2Router } from './authOAuth2';

export const router = Router();

router.use('/transactions', transactionRouter);
router.use('/events', eventRouter);
router.use('/contracts', contractRouter);
router.use('/wallets', walletRouter);
router.use('/tokens', tokenRouter);
router.use('/authorizations', authorizationRouter);
router.use('/render', renderRouter);
router.use('/simulate', simulateRouter);
router.use('/verify', verifyRouter);
router.use('/sync-state', syncStateRouter);
router.use('/network', networkRouter);
router.use('/token-metadata', tokenMetadataRouter);
router.use('/protocol', protocolRouter);
router.use('/i18n', i18nRouter);

// Auth routes
router.use('/auth', authRouter);
router.use('/auth/multisig', authMultisigRouter);
router.use('/auth', authProfileRouter);
router.use('/auth/security', authSecurityRouter);
router.use('/auth/webhooks', authWebhooksRouter);
router.use('/auth/oauth2', authOAuth2Router);
