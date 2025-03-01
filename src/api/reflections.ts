import { Hono } from "hono";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod"; // For validation
import { auth } from "../lib/auth";
import { createSlug } from "../hooks/useSlug";

const prisma = new PrismaClient();
const reflections = new Hono<{
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null;
	};
}>();

// Validation schemas
const createReflectionSchema = z.object({
	title: z.string().min(1),
	content: z.string().min(1),
	slug: z.string().min(1).optional(),
	status: z.enum(["DRAFT", "PUBLISHED"]).default("DRAFT"),
	featuredImageId: z.string().optional(),
	tags: z.array(z.string()).optional(),
	publishDate: z.string().optional(),
});

// Middleware to check authentication
const requireAuth = async (c: any, next: any) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	await next();
};

// Create Reflection
reflections.post("/create", requireAuth, async (c) => {
	try {
		const user = c.get("user");
		const body = await c.req.json();
		const validated = createReflectionSchema.parse(body);

		const reflection = await prisma.reflection.create({
			data: {
				id: crypto.randomUUID(),
				...validated,
				publishDate: validated.publishDate,
				slug: validated.slug || createSlug(validated.title),
				authorId: user!.id,
				tags: validated.tags
					? {
							create: validated.tags.map((tagId) => ({
								tag: { connect: { id: tagId } },
							})),
					  }
					: undefined,
			},
			include: {
				tags: { include: { tag: true } },
				featuredImage: true,
			},
		});

		return c.json(reflection, 201);
	} catch (error) {
		return c.json({ error: "Failed to create reflection" }, 400);
	}
});

// Get all Reflections
reflections.get("/get", async (c) => {
	const status = c.req.query("status");
	const authorId = c.req.query("authorId");
	const user = c.get("user");

	// If status is DRAFT, only return user's own drafts
	const where = {
		...(status && { status: status as "DRAFT" | "PUBLISHED" }),
		...(authorId && { authorId }),
		// Only show DRAFT posts to their authors
		...(!user && { status: "PUBLISHED" }),
		...(status === "DRAFT" &&
			(!user || user.id !== authorId) && {
				authorId: "none", // This ensures no drafts are returned for non-owners
			}),
	} satisfies Prisma.ReflectionWhereInput;

	const reflections = await prisma.reflection.findMany({
		where,
		include: {
			tags: { include: { tag: true } },
			featuredImage: true,
			author: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
	});

	return c.json(reflections);
});

// Get single Reflection
reflections.get("/get/:id", async (c) => {
	const id = c.req.param("id");
	const user = c.get("user");

	const reflection = await prisma.reflection.findUnique({
		where: { id },
		include: {
			tags: { include: { tag: true } },
			featuredImage: true,
			author: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
	});

	if (!reflection) {
		return c.json({ error: "Reflection not found" }, 404);
	}

	// Check if user can access this reflection
	if (
		reflection.status === "DRAFT" &&
		(!user || user.id !== reflection.authorId)
	) {
		return c.json({ error: "Not found" }, 404);
	}

	return c.json(reflection);
});

// Update Reflection
reflections.put("/update/:id", requireAuth, async (c) => {
	try {
		const id = c.req.param("id");
		const user = c.get("user");
		const body = await c.req.json();

		// First check if the reflection exists and belongs to the user
		const existing = await prisma.reflection.findUnique({
			where: { id },
			select: { authorId: true },
		});

		if (!existing) {
			return c.json({ error: "Reflection not found" }, 404);
		}

		if (existing.authorId !== user!.id) {
			return c.json({ error: "Unauthorized" }, 403);
		}

		const validated = createReflectionSchema.partial().parse(body);

		const reflection = await prisma.reflection.update({
			where: { id },
			data: {
				...validated,
				tags: validated.tags
					? {
							deleteMany: {},
							create: validated.tags.map((tagId) => ({
								tag: { connect: { id: tagId } },
							})),
					  }
					: undefined,
			},
			include: {
				tags: { include: { tag: true } },
				featuredImage: true,
			},
		});

		return c.json(reflection);
	} catch (error) {
		return c.json({ error: "Failed to update reflection" }, 400);
	}
});

// Delete Reflection
reflections.delete("/delete/:id", requireAuth, async (c) => {
	try {
		const id = c.req.param("id");
		const user = c.get("user");

		// Check if the reflection exists and belongs to the user
		const existing = await prisma.reflection.findUnique({
			where: { id },
			select: { authorId: true },
		});

		if (!existing) {
			return c.json({ error: "Reflection not found" }, 404);
		}

		if (existing.authorId !== user!.id) {
			return c.json({ error: "Unauthorized" }, 403);
		}

		await prisma.reflection.delete({
			where: { id },
		});

		return c.json({ success: true }, 200);
	} catch (error) {
		return c.json({ error: "Failed to delete reflection" }, 400);
	}
});

// Update Publication Status
reflections.patch("/publish/:id", requireAuth, async (c) => {
	try {
		const id = c.req.param("id");
		const user = c.get("user");

		// Check if the reflection exists and belongs to the user
		const existing = await prisma.reflection.findUnique({
			where: { id },
			select: { authorId: true },
		});

		if (!existing) {
			return c.json({ error: "Reflection not found" }, 404);
		}

		if (existing.authorId !== user!.id) {
			return c.json({ error: "Unauthorized" }, 403);
		}

		const reflection = await prisma.reflection.update({
			where: { id },
			data: {
				status: "PUBLISHED",
				publishDate: new Date(),
			},
			include: {
				tags: { include: { tag: true } },
				featuredImage: true,
			},
		});

		return c.json(reflection);
	} catch (error) {
		return c.json({ error: "Failed to publish reflection" }, 400);
	}
});

export { reflections };
