import { handle } from "@hono/node-server/vercel";
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
		origin: [
			process.env.FRONTEND_URL,
			process.env.FRONTEND_DASHBOARD_URL,
			"http://localhost:3000",
			"http://localhost:5173"
		].filter(Boolean) as string[],
		allowHeaders: ["Content-Type", "Authorization"],
		allowMethods: ["POST", "GET", "PUT", "DELETE", "PATCH", "OPTIONS"],
		exposeHeaders: ["Content-Length", "Set-Cookie"],
		maxAge: 600,
		credentials: true,
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

// Start the server
// const port = 3001;
// console.log(`Server is running on port ${port}`);

export default handle(app);
