import { Router } from 'express';
import { authController } from '../controllers/auth.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { requireAuth } from '../middleware/auth';

export const authRoutes = Router();

// Public (Table 58: everything except register/login/refresh requires auth)
authRoutes.post('/register', asyncHandler(authController.register));
authRoutes.post('/login', asyncHandler(authController.login));
authRoutes.post('/refresh', asyncHandler(authController.refresh));

// Authenticated
authRoutes.post('/logout', requireAuth, asyncHandler(authController.logout));
authRoutes.get('/me', requireAuth, asyncHandler(authController.me));
authRoutes.get('/sessions', requireAuth, asyncHandler(authController.sessions));
authRoutes.delete('/sessions/:id', requireAuth, asyncHandler(authController.revokeSession));
