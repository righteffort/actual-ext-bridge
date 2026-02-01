"use strict";
/**
 * Typed exception hierarchy for Bridge operations.
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.BridgeDuplicateError = exports.BridgeContextError = exports.BridgeConnectionError = exports.BridgeError = void 0;
var BridgeError = /** @class */ (function (_super) {
    __extends(BridgeError, _super);
    function BridgeError(message) {
        var _this = _super.call(this, message) || this;
        _this.name = "BridgeError";
        // Maintain prototype chain for instanceof checks
        Object.setPrototypeOf(_this, BridgeError.prototype);
        return _this;
    }
    return BridgeError;
}(Error));
exports.BridgeError = BridgeError;
/**
 * Thrown when the bridge cannot establish a connection to the Actual app.
 */
var BridgeConnectionError = /** @class */ (function (_super) {
    __extends(BridgeConnectionError, _super);
    function BridgeConnectionError(message) {
        if (message === void 0) { message = "Failed to connect to Actual Budget."; }
        var _this = _super.call(this, message) || this;
        _this.name = "BridgeConnectionError";
        Object.setPrototypeOf(_this, BridgeConnectionError.prototype);
        return _this;
    }
    return BridgeConnectionError;
}(BridgeError));
exports.BridgeConnectionError = BridgeConnectionError;
/**
 * Thrown when an operation is attempted in an invalid context
 * (e.g., trying to import without an account selected).
 */
var BridgeContextError = /** @class */ (function (_super) {
    __extends(BridgeContextError, _super);
    function BridgeContextError(message) {
        var _this = _super.call(this, message) || this;
        _this.name = "BridgeContextError";
        Object.setPrototypeOf(_this, BridgeContextError.prototype);
        return _this;
    }
    return BridgeContextError;
}(BridgeError));
exports.BridgeContextError = BridgeContextError;
/**
 * Thrown when client-side deduplication detects a conflict.
 */
var BridgeDuplicateError = /** @class */ (function (_super) {
    __extends(BridgeDuplicateError, _super);
    function BridgeDuplicateError(importedId, message) {
        if (message === void 0) { message = "Duplicate transaction detected."; }
        var _this = _super.call(this, message) || this;
        _this.name = "BridgeDuplicateError";
        _this.importedId = importedId;
        Object.setPrototypeOf(_this, BridgeDuplicateError.prototype);
        return _this;
    }
    return BridgeDuplicateError;
}(BridgeError));
exports.BridgeDuplicateError = BridgeDuplicateError;
