"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vercel_1 = require("@hono/node-server/vercel");
const hono_1 = require("hono");
const auth_1 = require("./lib/auth");
const cors_1 = require("hono/cors");
const reflections_1 = require("./api/reflections");
const albums_1 = require("./api/albums");
const app = new hono_1.Hono();
app.use((0, cors_1.cors)({
    origin: ["http://localhost:3000", "http://localhost:5173"],
    allowHeaders: ["Content-Type", "Authorization"],
    allowMethods: ["POST", "GET", "PUT", "DELETE", "PATCH", "OPTIONS"],
    exposeHeaders: ["Content-Length"],
    maxAge: 600,
    credentials: true, // Allows cookies
}));
// This middleware will run on every request
app.on(["POST", "GET"], "/api/auth/*", (c) => {
    return auth_1.auth.handler(c.req.raw);
});
app.use("*", async (c, next) => {
    const session = await auth_1.auth.api.getSession({ headers: c.req.raw.headers });
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
app.route("/api/reflections", reflections_1.reflections);
app.route("/api/albums", albums_1.albums);
// Start the server
// const port = 3001;
// console.log(`Server is running on port ${port}`);
exports.default = (0, vercel_1.handle)(app);
