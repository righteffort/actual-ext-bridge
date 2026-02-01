"use strict";
/**
 * Constants shared between the Guest (Main World) and Host (Isolated World).
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.HostMessageType = exports.GuestMessageType = exports.SOURCE_HOST = exports.SOURCE_GUEST = exports.TARGET_ORIGIN_VAR = void 0;
exports.TARGET_ORIGIN_VAR = "__ACTUAL_BRIDGE_TARGET_ORIGIN__";
exports.SOURCE_GUEST = "actual-bridge-guest";
exports.SOURCE_HOST = "actual-bridge-host";
var GuestMessageType;
(function (GuestMessageType) {
    GuestMessageType["HANDSHAKE_ACK"] = "HANDSHAKE_ACK";
    GuestMessageType["STATE_UPDATE"] = "STATE_UPDATE";
    GuestMessageType["COMMAND_RESPONSE"] = "COMMAND_RESPONSE";
})(GuestMessageType || (exports.GuestMessageType = GuestMessageType = {}));
var HostMessageType;
(function (HostMessageType) {
    HostMessageType["HANDSHAKE_INIT"] = "HANDSHAKE_INIT";
    HostMessageType["GET_TRANSACTIONS"] = "GET_TRANSACTIONS";
    HostMessageType["GET_ACCOUNTS"] = "GET_ACCOUNTS";
    HostMessageType["SAVE_TRANSACTION"] = "SAVE_TRANSACTION";
    HostMessageType["CREATE_TRANSACTION"] = "CREATE_TRANSACTION";
})(HostMessageType || (exports.HostMessageType = HostMessageType = {}));
