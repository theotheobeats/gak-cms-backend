"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.auth = void 0;
const better_auth_1 = require("better-auth");
const prisma_1 = require("better-auth/adapters/prisma");
const client_1 = require("@prisma/client");
const plugins_1 = require("better-auth/plugins");
const prisma = new client_1.PrismaClient();
exports.auth = (0, better_auth_1.betterAuth)({
    database: (0, prisma_1.prismaAdapter)(prisma, {
        provider: "postgresql",
    }),
    emailAndPassword: {
        enabled: true,
    },
    plugins: [(0, plugins_1.openAPI)()],
    trustedOrigins: ["http://localhost:3000"],
});
