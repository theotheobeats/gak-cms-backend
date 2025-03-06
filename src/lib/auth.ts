import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { PrismaClient } from "@prisma/client";
import { openAPI } from "better-auth/plugins";

const prisma = new PrismaClient();
export const auth = betterAuth({
	database: prismaAdapter(prisma, {
		provider: "postgresql",
	}),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [openAPI()],
	trustedOrigins: [
		process.env.FRONTEND_URL,
		process.env.FRONTEND_DASHBOARD_URL,
		"http://localhost:3000",
		"http://localhost:5173"
	].filter(Boolean) as string[],
	cookies: {
		secure: process.env.NODE_ENV === 'production',
		sameSite: "lax"
	}
});
