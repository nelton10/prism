import { handleAiRequest } from '../lib/ai-handler.mjs';

export default async function handler(req, res) {
  await handleAiRequest(req, res);
}
