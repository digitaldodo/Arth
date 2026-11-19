import type { FastifyInstance, FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../../config/index.js';
import {
  isDocumentId,
  validateCreateDocumentFieldInput,
  validateCreateDocumentInput,
  validateUpdateDocumentFieldInput,
} from './documents.validation.js';
import { SupabaseDocumentsService, type IDocumentsService } from './documents.service.js';

export interface DocumentsRoutesOptions {
  config: AppConfig;
  service?: IDocumentsService;
}

export const documentsRoutes: FastifyPluginAsync<DocumentsRoutesOptions> = async (app: FastifyInstance, options) => {
  const service = options.service || new SupabaseDocumentsService(options.config);
  const fail = (reply: FastifyReply, request: FastifyRequest, error: unknown) => {
    request.log.error({ failure: error instanceof Error ? error.name : 'unknown' }, 'Financial document request failed');
    const message = error instanceof Error && error.message === 'DATABASE_NOT_CONFIGURED'
      ? 'Document services are not configured.'
      : 'The financial document request could not be completed. Try again.';
    return reply.code(500).send({ error: message });
  };

  app.get('/api/v1/financial/documents', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    try { return reply.send({ documents: await service.listDocuments(request.user.userId, request.token) }); }
    catch (error) { return fail(reply, request, error); }
  });

  app.post('/api/v1/financial/documents', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const input = validateCreateDocumentInput(request.body);
    if (!input) return reply.code(400).send({ error: 'Invalid document metadata.' });
    try { return reply.code(201).send({ document: await service.createDocument(request.user.userId, input, request.token) }); }
    catch (error) { return fail(reply, request, error); }
  });

  app.delete('/api/v1/financial/documents/:id', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    if (!isDocumentId(id)) return reply.code(400).send({ error: 'Invalid document identifier.' });
    try {
      const deleted = await service.deleteDocument(request.user.userId, id, request.token);
      return deleted ? reply.send({ success: true, id }) : reply.code(404).send({ error: 'Document not found.' });
    } catch (error) { return fail(reply, request, error); }
  });

  app.get('/api/v1/financial/documents/:id/fields', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    if (!isDocumentId(id)) return reply.code(400).send({ error: 'Invalid document identifier.' });
    try { return reply.send({ fields: await service.listFields(request.user.userId, id, request.token) }); }
    catch (error) { return fail(reply, request, error); }
  });

  app.post('/api/v1/financial/documents/:id/fields', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const { id } = request.params as { id: string };
    const input = validateCreateDocumentFieldInput(request.body);
    if (!isDocumentId(id) || !input) return reply.code(400).send({ error: 'Invalid extracted field.' });
    try { return reply.code(201).send({ field: await service.createField(request.user.userId, id, input, request.token) }); }
    catch (error) { return fail(reply, request, error); }
  });

  app.patch('/api/v1/financial/documents/:documentId/fields/:fieldId', { preHandler: [app.verifyAuth] }, async (request, reply) => {
    if (!request.user) return reply.code(401).send({ error: 'Unauthorized' });
    const { documentId, fieldId } = request.params as { documentId: string; fieldId: string };
    const input = validateUpdateDocumentFieldInput(request.body);
    if (!isDocumentId(documentId) || !isDocumentId(fieldId) || !input) return reply.code(400).send({ error: 'Invalid field review update.' });
    try {
      const field = await service.updateField(request.user.userId, documentId, fieldId, input, request.token);
      return field ? reply.send({ field }) : reply.code(404).send({ error: 'Extracted field not found.' });
    } catch (error) { return fail(reply, request, error); }
  });
};
