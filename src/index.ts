import { Hono } from "hono";
import { auth } from "./lib/auth";
import { cors } from "hono/cors";
const app = new Hono<{
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null;
	};
}>();

app.use(
	cors({
		origin: "http://localhost:3000", // Must be specific, not "*"
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["POST", "GET", "OPTIONS"],
		exposeHeaders: ["Content-Length"],
		maxAge: 600,
		credentials: true, // Allows cookies
	})
);

// This middleware will run on every request
app.use("*", async (c, next) => {
	const session = await auth.api.getSession({ headers: c.req.raw.headers });

	if (!session) {
		c.set("user", null);
		c.set("session", null);
		return next();
	}

	c.set("user", session.user);
	c.set("session", session.session);
	return next();
});

// better-auth mounting
app.on(["POST", "GET"], "/api/auth/*", (c) => {
	return auth.handler(c.req.raw);
});

// ENTRY POINT
app.get("/", (c) => {
	return c.text("Hello Hono!");
});


export default {
	port: 3001,
	fetch: app.fetch,
};
