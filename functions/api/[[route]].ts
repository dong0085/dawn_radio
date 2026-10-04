import { handleApi, type Env } from '../../server/router.ts'

// Cloudflare Pages Function: every /api/* request.
export const onRequest = (context: { request: Request; env: Env }) => handleApi(context.request, context.env)
