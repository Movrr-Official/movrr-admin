import type { FulfilmentType } from "@/features/fulfilment/domain/Fulfilment";
import type { FulfilmentHandler } from "@/features/fulfilment/application/contracts/FulfilmentHandler";

export type HandlerRegistry = {
  register: (type: FulfilmentType, handler: FulfilmentHandler) => void;
  resolve: (type: FulfilmentType) => FulfilmentHandler;
  freeze: () => void;
  isFrozen: () => boolean;
};

/**
 * Immutable after freeze(). Always resolves a handler (composition registers all types).
 */
export function createHandlerRegistry(): HandlerRegistry {
  const handlers = new Map<FulfilmentType, FulfilmentHandler>();
  let frozen = false;

  return {
    register(type, handler) {
      if (frozen) {
        throw new Error("HandlerRegistry is frozen; further register() is rejected");
      }
      handlers.set(type, handler);
    },

    resolve(type) {
      const handler = handlers.get(type);
      if (!handler) {
        throw new Error(
          `No fulfilment handler registered for type "${type}". Register all types before freeze().`,
        );
      }
      return handler;
    },

    freeze() {
      frozen = true;
    },

    isFrozen() {
      return frozen;
    },
  };
}
