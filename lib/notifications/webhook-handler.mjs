import { WebhookVerifier } from './webhook-verifier.mjs';
import { resolveOpaqueTag } from './routing-tags.mjs';

/**
 * Extracts routing tags from Resend webhook payload.
 * Resend payload tags can be an array [{ name, value }] or an object.
 */
export function extractWebhookTags(body) {
  const result = {};
  if (!body || typeof body !== 'object') return result;

  const rawTags = body.data?.tags;
  if (Array.isArray(rawTags)) {
    for (const t of rawTags) {
      if (t && t.name && t.value) {
        result[t.name] = String(t.value);
      }
    }
  } else if (rawTags && typeof rawTags === 'object') {
    for (const [k, v] of Object.entries(rawTags)) {
      result[k] = String(v);
    }
  }

  return result;
}

/**
 * Processes incoming Resend webhooks with strict tenant routing and provider correlation.
 * Never searches sequentially across all tenant databases.
 */
export async function processResendWebhook({
  rawBody,
  headers,
  getTenantDb, // (tenantId) => NotificationDatabase | Promise<NotificationDatabase>
  verifier = null,
  secret = null,
  logger = console
}) {
  const activeVerifier = verifier || new WebhookVerifier({ secret });

  // 1. Cryptographic and temporal verification (Raw Body, Svix headers)
  let verifyResult;
  try {
    verifyResult = activeVerifier.verify({ payload: rawBody, headers });
  } catch (err) {
    logger.warn?.(`[WebhookHandler] Falha de verificação criptográfica: ${err.message}`);
    return {
      status: 400,
      ok: false,
      error: 'Assinatura ou timestamp do webhook inválido.'
    };
  }

  // 2. Parse verified payload
  let parsed;
  try {
    parsed = JSON.parse(rawBody);
  } catch {
    return { status: 400, ok: false, error: 'JSON inválido no corpo do webhook.' };
  }

  const eventType = parsed.type; // e.g. 'email.delivered', 'email.bounced', 'email.suppressed'
  const emailId = parsed.data?.email_id || parsed.data?.id;

  // 3. Extract and validate routing tags
  const tags = extractWebhookTags(parsed);
  const rawTenantTag = tags.atrium_tenant;
  const rawOutboxTag = tags.atrium_outbox;

  if (!rawTenantTag || !rawOutboxTag) {
    logger.warn?.(`[WebhookHandler] Webhook ignorado: tags de roteamento ausentes (email_id: ${emailId || 'unknown'})`);
    return {
      status: 422,
      ok: false,
      ignored: true,
      reason: 'ROUTING_TAGS_MISSING'
    };
  }

  const routingSecret = secret || activeVerifier.secret || process.env.RESEND_WEBHOOK_SECRET || '';
  const tenantId = resolveOpaqueTag(rawTenantTag, routingSecret);
  const outboxId = resolveOpaqueTag(rawOutboxTag, routingSecret);

  if (!tenantId) {
    logger.warn?.(`[WebhookHandler] Webhook ignorado: atrium_tenant adulterado ou inválido`);
    return {
      status: 403,
      ok: false,
      ignored: true,
      reason: 'INVALID_TENANT_TAG'
    };
  }

  if (!outboxId) {
    logger.warn?.(`[WebhookHandler] Webhook ignorado: atrium_outbox adulterado ou inválido`);
    return {
      status: 403,
      ok: false,
      ignored: true,
      reason: 'INVALID_OUTBOX_TAG'
    };
  }

  // 4. Resolve strictly the target tenant database
  let tenantDb;
  try {
    tenantDb = typeof getTenantDb === 'function' ? await getTenantDb(tenantId) : null;
  } catch (err) {
    logger.error?.(`[WebhookHandler] Falha ao abrir banco do tenant ${tenantId}: ${err.message}`);
    return {
      status: 503,
      ok: false,
      error: 'Banco de dados do tenant temporariamente indisponível.'
    };
  }

  if (!tenantDb) {
    logger.warn?.(`[WebhookHandler] Tenant ${tenantId} não encontrado no sistema.`);
    return {
      status: 404,
      ok: false,
      ignored: true,
      reason: 'TENANT_NOT_FOUND'
    };
  }

  // 5. Verify outbox record exists in target tenant
  const outboxItem = tenantDb.getOutboxItemById(outboxId);
  if (!outboxItem) {
    logger.warn?.(`[WebhookHandler] Outbox item ${outboxId} não localizado no tenant ${tenantId}.`);
    return {
      status: 404,
      ok: false,
      ignored: true,
      reason: 'OUTBOX_NOT_FOUND'
    };
  }

  // 6. Provider correlation: check that email_id matches the delivery for this outbox
  const delivery = tenantDb.db.prepare(`
    SELECT * FROM notification_deliveries
    WHERE outbox_id = ?
  `).get(outboxId);

  if (delivery && delivery.provider_message_id && emailId) {
    if (delivery.provider_message_id !== emailId) {
      logger.warn?.(`[WebhookHandler] Correlação inválida: provider_message_id esperado (${delivery.provider_message_id}) difere de email_id recebido (${emailId})`);
      return {
        status: 409,
        ok: false,
        ignored: true,
        reason: 'PROVIDER_MESSAGE_ID_MISMATCH'
      };
    }
  }

  // 7. Record webhook event with retention discipline (svix-id deduplication)
  const recordResult = tenantDb.recordWebhookEvent({
    eventId: verifyResult.svixId,
    eventType,
    payload: parsed
  });

  if (!recordResult.isNew) {
    // Replay prevented by unique svix-id constraint
    return {
      status: 200,
      ok: true,
      duplicate: true,
      message: 'Evento de webhook já processado anteriormente.'
    };
  }

  // 8. Update delivery state & suppression
  const statusMap = {
    'email.sent': 'SENT',
    'email.delivered': 'DELIVERED',
    'email.delivery_delayed': 'DELAYED',
    'email.bounced': 'BOUNCED',
    'email.complained': 'COMPLAINED',
    'email.failed': 'FAILED',
    'email.suppressed': 'SUPPRESSED'
  };

  const deliveryStatus = statusMap[eventType];
  if (deliveryStatus && (emailId || delivery?.provider_message_id)) {
    const targetMsgId = emailId || delivery?.provider_message_id;
    tenantDb.updateDeliveryFromWebhook({
      providerMessageId: targetMsgId,
      status: deliveryStatus,
      timestamp: parsed.created_at || new Date().toISOString(),
      error: parsed.data?.bounce?.message || parsed.data?.error || null,
      bounce: parsed.data?.bounce || null
    });
  }

  return {
    status: 200,
    ok: true,
    processed: true,
    tenantId,
    outboxId,
    eventType
  };
}
