"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
var vitest_1 = require("vitest");
var local_bridge_1 = require("../src/core/local-bridge");
var constants_1 = require("../src/shared/constants");
// Mock the guest logic script import
vitest_1.vi.mock("../src/core/guest-logic.ts?inline-js", function () { return ({
    default: 'window.postMessage({ type: "ACTUAL_BRIDGE_GUEST_LOADED" }, "*")',
}); });
(0, vitest_1.describe)("LocalBridge", function () {
    var bridge;
    var baseUrl = "https://actual.test";
    (0, vitest_1.beforeEach)(function () {
        // Setup DOM environment
        document.head.innerHTML = "";
        bridge = new local_bridge_1.LocalBridge();
        // Mock window.postMessage to intercept bridge messages
        window.postMessage = vitest_1.vi.fn(function (message, targetOrigin) {
            // Manually trigger our test listener with the correct origin
            var event = new MessageEvent('message', {
                data: message,
                origin: targetOrigin,
                source: window
            });
            setTimeout(function () {
                window.dispatchEvent(event);
            }, 0);
        });
    });
    (0, vitest_1.afterEach)(function () {
        bridge.disconnect();
        vitest_1.vi.restoreAllMocks();
    });
    (0, vitest_1.it)("should inject the guest script on connect", function () { return __awaiter(void 0, void 0, void 0, function () {
        var mockMessageEvent, script;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mockMessageEvent = function (data) {
                        var event = new MessageEvent('message', {
                            data: data,
                            origin: baseUrl,
                            source: window
                        });
                        setTimeout(function () {
                            window.dispatchEvent(event);
                        }, 0);
                    };
                    // Simulate the Guest responding to HANDSHAKE_INIT
                    window.addEventListener("message", function (event) {
                        var data = event.data;
                        if (data && data.type === constants_1.HostMessageType.HANDSHAKE_INIT) {
                            // Reply with ACK asynchronously to simulate real behavior
                            mockMessageEvent({
                                source: "actual-bridge-guest",
                                type: constants_1.GuestMessageType.HANDSHAKE_ACK,
                                id: data.id,
                                payload: { success: true }
                            });
                        }
                    });
                    return [4 /*yield*/, bridge.connect({ baseUrl: baseUrl })];
                case 1:
                    _a.sent();
                    script = document.head.querySelector("script");
                    (0, vitest_1.expect)(script).toBeTruthy();
                    (0, vitest_1.expect)(script === null || script === void 0 ? void 0 : script.textContent).toContain('window.postMessage');
                    return [2 /*return*/];
            }
        });
    }); });
    (0, vitest_1.it)("should send RPC requests and handle responses", function () { return __awaiter(void 0, void 0, void 0, function () {
        var mockMessageEvent, txs;
        return __generator(this, function (_a) {
            switch (_a.label) {
                case 0:
                    mockMessageEvent = function (data) {
                        var event = new MessageEvent('message', {
                            data: data,
                            origin: baseUrl,
                            source: window
                        });
                        setTimeout(function () {
                            window.dispatchEvent(event);
                        }, 0);
                    };
                    // Auto-reply to everything
                    window.addEventListener("message", function (event) {
                        var data = event.data;
                        if (!data || data.source !== "actual-bridge-host")
                            return;
                        // Use mockMessageEvent to simulate async message handling with correct origin
                        if (data.type === constants_1.HostMessageType.HANDSHAKE_INIT) {
                            mockMessageEvent({
                                source: "actual-bridge-guest",
                                type: constants_1.GuestMessageType.HANDSHAKE_ACK,
                                id: data.id,
                                payload: { success: true }
                            });
                        }
                        else if (data.type === constants_1.HostMessageType.GET_TRANSACTIONS) {
                            mockMessageEvent({
                                source: "actual-bridge-guest",
                                type: constants_1.GuestMessageType.COMMAND_RESPONSE,
                                id: data.id,
                                payload: { success: true, data: [{ id: "tx-1", amount: 100 }] }
                            });
                        }
                    });
                    return [4 /*yield*/, bridge.connect({ baseUrl: baseUrl })];
                case 1:
                    _a.sent();
                    return [4 /*yield*/, bridge.getTransactions()];
                case 2:
                    txs = _a.sent();
                    (0, vitest_1.expect)(txs).toHaveLength(1);
                    (0, vitest_1.expect)(txs === null || txs === void 0 ? void 0 : txs[0].id).toBe("tx-1");
                    return [2 /*return*/];
            }
        });
    }); });
});
