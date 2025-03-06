"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authClient = void 0;
const react_1 = require("better-auth/react");
exports.authClient = (0, react_1.createAuthClient)({
    baseURL: "http://localhost:3001", // the base url of your auth server
});
