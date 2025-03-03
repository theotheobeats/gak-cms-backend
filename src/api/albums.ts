import { Hono } from "hono";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { auth } from "../lib/auth";

const prisma = new PrismaClient();
const albums = new Hono<{
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null;
	};
}>();

// Validation schemas
const createAlbumSchema = z.object({
	name: z.string().min(1, "Album name is required"),
	description: z.string().optional(),
	date: z.string(), // Will be converted to Date
	images: z.array(
		z.object({
			file: z.any(), // Will be handled as File in frontend
			alt: z.string().optional(),
			caption: z.string().optional(),
		})
	),
});

const updateAlbumSchema = createAlbumSchema.partial();

// Middleware to check authentication
const requireAuth = async (c: any, next: any) => {
	const user = c.get("user");
	if (!user) {
		return c.json({ error: "Unauthorized" }, 401);
	}
	await next();
};

/**
 * Create Album with Images
 * POST /api/albums/create
 * Requires authentication
 *
 * Request body:
 * {
 *   name: string,
 *   description?: string,
 *   date: string (YYYY-MM-DD),
 *   images: Array<{
 *     file: File,
 *     alt?: string,
 *     caption?: string
 *   }>
 * }
 */
albums.post("/create", requireAuth, async (c) => {
	try {
		const user = c.get("user");
		const body = await c.req.json();
		const validated = createAlbumSchema.parse(body);

		// 1. Create album first
		const album = await prisma.album.create({
			data: {
				id: crypto.randomUUID(),
				name: validated.name,
				description: validated.description,
				date: new Date(validated.date),
				uploadedById: user!.id,
			},
		});

		// 2. Upload images to Supabase Storage and create Image records
		const imagePromises = validated.images.map(async (imageData) => {
			// Upload to Supabase
			const fileName = `${album.id}/${crypto.randomUUID()}`;
			const { data: fileData, error } = await supabase.storage
				.from("albums")
				.upload(fileName, imageData.file);

			if (error) throw error;

			// Get public URL
			const {
				data: { publicUrl },
			} = supabase.storage.from("albums").getPublicUrl(fileName);

			// Create image record in database
			return prisma.image.create({
				data: {
					id: crypto.randomUUID(),
					url: publicUrl,
					alt: imageData.alt,
					caption: imageData.caption,
					albumId: album.id,
					userId: user!.id,
				},
			});
		});

		const images = await Promise.all(imagePromises);

		return c.json({ ...album, images }, 201);
	} catch (error) {
		console.error("Album creation error:", error);
		return c.json({ error: "Failed to create album" }, 400);
	}
});

/**
 * Get All Albums
 * GET /api/albums
 * Optional query params: limit, offset
 */
albums.get("/", async (c) => {
	const limit = Number(c.req.query("limit")) || 10;
	const offset = Number(c.req.query("offset")) || 0;

	const albums = await prisma.album.findMany({
		take: limit,
		skip: offset,
		include: {
			images: true,
			uploadedBy: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
		orderBy: {
			date: "desc",
		},
	});

	return c.json(albums);
});

/**
 * Get Single Album
 * GET /api/albums/:id
 */
albums.get("/:id", async (c) => {
	const id = c.req.param("id");

	const album = await prisma.album.findUnique({
		where: { id },
		include: {
			images: true,
			uploadedBy: {
				select: {
					id: true,
					name: true,
					image: true,
				},
			},
		},
	});

	if (!album) {
		return c.json({ error: "Album not found" }, 404);
	}

	return c.json(album);
});

/**
 * Update Album
 * PUT /api/albums/:id
 * Requires authentication
 */
albums.put("/:id", requireAuth, async (c) => {
	try {
		const id = c.req.param("id");
		const user = c.get("user");
		const body = await c.req.json();

		// Check ownership
		const existing = await prisma.album.findUnique({
			where: { id },
			select: { uploadedById: true },
		});

		if (!existing) {
			return c.json({ error: "Album not found" }, 404);
		}

		if (existing.uploadedById !== user!.id) {
			return c.json({ error: "Unauthorized" }, 403);
		}

		const validated = updateAlbumSchema.parse(body);

		const album = await prisma.album.update({
			where: { id },
			data: {
				...validated,
				date: validated.date ? new Date(validated.date) : undefined,
			},
			include: {
				images: true,
			},
		});

		return c.json(album);
	} catch (error) {
		console.error("Update error:", error);
		return c.json({ error: "Failed to update album" }, 400);
	}
});

/**
 * Delete Album
 * DELETE /api/albums/:id
 * Requires authentication
 */
albums.delete("/:id", requireAuth, async (c) => {
	try {
		const id = c.req.param("id");
		const user = c.get("user");

		// Check ownership
		const existing = await prisma.album.findUnique({
			where: { id },
			include: { images: true },
		});

		if (!existing) {
			return c.json({ error: "Album not found" }, 404);
		}

		if (existing.uploadedById !== user!.id) {
			return c.json({ error: "Unauthorized" }, 403);
		}

		// Delete images from Supabase Storage
		for (const image of existing.images) {
			const fileName = image.url.split("/").pop(); // Get filename from URL
			if (fileName) {
				await supabase.storage.from("albums").remove([`${id}/${fileName}`]);
			}
		}

		// Delete album (will cascade delete images from database)
		await prisma.album.delete({
			where: { id },
		});

		return c.json({ success: true });
	} catch (error) {
		console.error("Delete error:", error);
		return c.json({ error: "Failed to delete album" }, 400);
	}
});

export { albums };
