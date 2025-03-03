import { Hono } from "hono";
import { auth } from "./lib/auth";
import { cors } from "hono/cors";
import { reflections } from "./api/reflections";
import { albums } from "./api/albums";

const app = new Hono<{
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null;
	};
}>();

app.use(
	cors({
		origin: "http://localhost:3000",
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["POST", "GET", "PUT", "DELETE", "PATCH", "OPTIONS"],
		exposeHeaders: ["Content-Length"],
		maxAge: 600,
		credentials: true, // Allows cookies
	})
);

// This middleware will run on every request
app.on(["POST", "GET"], "/api/auth/*", (c) => {
	return auth.handler(c.req.raw);
});

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

// API ROUTES
app.get("/", (c) => {
	return c.text("Hello Hono!");
});

app.route("/api/reflections", reflections);
app.route("/api/albums", albums);

export default {
	port: 3001,
	fetch: app.fetch,
};
