/**
 * Typed exception hierarchy for Bridge operations.
 */

export class BridgeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BridgeError";
    // Maintain prototype chain for instanceof checks
    Object.setPrototypeOf(this, BridgeError.prototype);
  }
}

/**
 * Thrown when the bridge cannot establish a connection to the Actual app.
 */
export class BridgeConnectionError extends BridgeError {
  constructor(message: string = "Failed to connect to Actual Budget.") {
    super(message);
    this.name = "BridgeConnectionError";
    Object.setPrototypeOf(this, BridgeConnectionError.prototype);
  }
}

/**
 * Thrown when an operation is attempted in an invalid context
 * (e.g., trying to import without an account selected).
 */
export class BridgeContextError extends BridgeError {
  constructor(message: string) {
    super(message);
    this.name = "BridgeContextError";
    Object.setPrototypeOf(this, BridgeContextError.prototype);
  }
}

/**
 * Thrown when client-side deduplication detects a conflict.
 */
export class BridgeDuplicateError extends BridgeError {
  public readonly importedId: string;

  constructor(
    importedId: string,
    message: string = "Duplicate transaction detected.",
  ) {
    super(message);
    this.name = "BridgeDuplicateError";
    this.importedId = importedId;
    Object.setPrototypeOf(this, BridgeDuplicateError.prototype);
  }
}
