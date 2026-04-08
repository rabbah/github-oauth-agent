import { AsyncLocalStorage } from 'async_hooks';

// Propagates the active conversationId through async call chains so tools
// can look up the session without the LLM needing to pass it explicitly.
export const conversationContext = new AsyncLocalStorage<string>();
