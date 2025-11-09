import { z } from 'zod';

const metadataSchema = z.record(z.unknown()).optional();

const attachmentsSchema = z
  .array(
    z.object({
      name: z.string().optional(),
      type: z.string().optional(),
      size: z.number().optional(),
      url: z.string().optional(),
    }).passthrough()
  )
  .optional();

export const emailIngestSchema = z
  .object({
    from: z.string().min(1, 'from es requerido'),
    to: z.string().min(1, 'to es requerido'),
    subject: z.string().min(1).optional(),
    body: z.string().min(1, 'body es requerido'),
    date: z
      .string()
      .datetime({ offset: true })
      .optional(),
    attachments: attachmentsSchema,
    metadata: metadataSchema,
    company: z.string().min(1).optional(),
  })
  .strict();

export const slackIngestSchema = z
  .object({
    user: z
      .object({
        id: z.string().optional(),
        name: z.string().min(1).optional(),
        real_name: z.string().min(1).optional(),
        email: z.string().email().optional(),
      })
      .strict()
      .optional(),
    channel: z
      .object({
        id: z.string().optional(),
        name: z.string().min(1, 'channel.name es requerido'),
      })
      .strict(),
    text: z.string().min(1, 'text es requerido'),
    ts: z.string().optional(),
    thread_ts: z.string().optional(),
    attachments: attachmentsSchema,
    metadata: metadataSchema,
    company: z.string().min(1).optional(),
  })
  .strict();

const timestampSchema = z
  .union([z.string().min(1), z.number(), z.date()])
  .optional();

export const whatsappIngestSchema = z
  .object({
    from: z.string().min(1, 'from es requerido'),
    to: z.string().min(1, 'to es requerido'),
    message: z.string().min(1, 'message es requerido'),
    timestamp: timestampSchema,
    media: z.unknown().optional(),
    metadata: metadataSchema,
    company: z.string().min(1).optional(),
    contactName: z.string().min(1).optional(),
    email: z.string().email().optional(),
  })
  .strict();

export function formatZodError(error) {
  return error.errors.map((err) => ({
    path: err.path.join('.'),
    message: err.message,
  }));
}

