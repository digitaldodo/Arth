import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import type { AuthIdentityResponse } from '@arth/contracts';

/**
 * Registers protected authentication endpoints.
 */
export const authRoutes: FastifyPluginAsync = async (app: FastifyInstance): Promise<void> => {
  const verifyAuth = (app as unknown as { verifyAuth: (req: unknown, rep: unknown) => Promise<void> }).verifyAuth;

  app.get<{ Reply: AuthIdentityResponse }>(
    '/api/v1/auth/me',
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const user = request.user;

      if (!user) {
        return reply.status(401).send({
          userId: '',
          email: null,
          role: '',
          exp: 0,
        });
      }

      const identity: AuthIdentityResponse = {
        userId: user.userId,
        email: user.email,
        role: user.role,
        exp: user.exp,
      };

      return reply.status(200).send(identity);
    }
  );
};
