import { Hono } from "hono";
import { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { auth } from "../lib/auth";
import { storageHelpers } from "../lib/supabase";

const prisma = new PrismaClient();
const albums = new Hono<{
	Variables: {
		user: typeof auth.$Infer.Session.user | null;
		session: typeof auth.$Infer.Session.session | null;
	};
}>();

// Validation schemas
interface AlbumData {
	name: string;
	description?: string;
	date: string;
	images: Array<{
		id: string;
		alt?: string;
		caption?: string;
		width?: number;
		height?: number;
		size?: number;
	}>;
}

const createAlbumSchema = z.object({
	name: z.string().min(1, "Album name is required"),
	description: z.string().optional(),
	date: z.string(),
	images: z.array(
		z.object({
			id: z.string(),
			alt: z.string().optional(),
			caption: z.string().optional(),
			width: z.number().optional(),
			height: z.number().optional(),
			size: z.number().optional(),
		})
	),
});

// Separate schema for updates that doesn't include images
const updateAlbumSchema = z.object({
	name: z.string().min(1, "Album name is required").optional(),
	description: z.string().optional(),
	date: z.string().optional(),
});

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
 *     id: string,
 *     alt?: string,
 *     caption?: string,
 *     width?: number,
 *     height?: number,
 *     size?: number
 *   }>
 * }
 */
albums.post("/create", requireAuth, async (c) => {
	try {
		const user = c.get("user");
		const formData = await c.req.formData();

		// Get album data from JSON
		const albumDataJson = formData.get("albumData");
		if (!albumDataJson) {
			return c.json({ error: "Album data is required" }, 400);
		}

		const albumData: AlbumData = JSON.parse(albumDataJson.toString());
		const validated = createAlbumSchema.parse(albumData);

		// Get image files
		const imageFiles: File[] = [];
		let i = 0;
		while (formData.has(`image_${i}`)) {
			const file = formData.get(`image_${i}`) as File;
			imageFiles.push(file);
			i++;
		}

		if (imageFiles.length === 0) {
			return c.json({ error: "At least one image is required" }, 400);
		}

		// Create album
		const album = await prisma.album.create({
			data: {
				id: crypto.randomUUID(),
				name: validated.name,
				description: validated.description,
				date: new Date(validated.date),
				uploadedById: user!.id,
			},
		});

		// Upload images and create records
		const imagePromises = imageFiles.map(async (file, index) => {
			// Always generate a new UUID for the database record
			const dbImageId = crypto.randomUUID();
			const fileExt = file.name.split(".").pop();
			const filePath = `${album.id}/${dbImageId}.${fileExt}`;

			try {
				const publicUrl = await storageHelpers.uploadFile(
					"albums",
					filePath,
					file
				);

				return prisma.image.create({
					data: {
						id: dbImageId, // Use the new UUID
						url: publicUrl,
						alt: validated.images[index].alt || file.name,
						caption: validated.images[index].caption,
						width: validated.images[index].width,
						height: validated.images[index].height,
						size: validated.images[index].size || file.size,
						albumId: album.id,
						userId: user!.id,
					},
				});
			} catch (error) {
				console.error(`Failed to upload file ${file.name}:`, error);
				throw error;
			}
		});

		const images = await Promise.all(imagePromises);

		return c.json({ ...album, images }, 201);
	} catch (error) {
		console.error("Album creation error:", error);
		if (error instanceof z.ZodError) {
			return c.json(
				{
					error: "Validation error",
					details: error.errors,
				},
				400
			);
		}
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
		const formData = await c.req.formData();
		
		// Get album data from JSON
		const albumDataJson = formData.get("albumData");
		if (!albumDataJson) {
			return c.json({ error: "Album data is required" }, 400);
		}

		const albumData = JSON.parse(albumDataJson.toString());

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

		const validated = updateAlbumSchema.parse(albumData);

		// Handle image deletions if imageIdsToDelete is provided
		if (albumData.imageIdsToDelete?.length > 0) {
			// Delete images from storage first
			for (const imageId of albumData.imageIdsToDelete) {
				const image = existing.images.find(img => img.id === imageId);
				if (image) {
					const filePath = image.url.split("/").pop();
					if (filePath) {
						await storageHelpers.deleteFile("albums", `${id}/${filePath}`);
					}
				}
			}

			// Delete images from database
			await prisma.image.deleteMany({
				where: {
					id: { in: albumData.imageIdsToDelete },
					albumId: id,
				},
			});
		}

		// Handle new image uploads
		const newImages: any[] = [];
		let i = 0;
		while (formData.has(`image_${i}`)) {
			const file = formData.get(`image_${i}`) as File;
			const dbImageId = crypto.randomUUID();
			const fileExt = file.name.split(".").pop();
			const filePath = `${id}/${dbImageId}.${fileExt}`;

			try {
				const publicUrl = await storageHelpers.uploadFile(
					"albums",
					filePath,
					file
				);

				const newImage = await prisma.image.create({
					data: {
						id: dbImageId,
						url: publicUrl,
						alt: file.name,
						size: file.size,
						albumId: id,
						userId: user!.id,
					},
				});

				newImages.push(newImage);
			} catch (error) {
				console.error(`Failed to upload file ${file.name}:`, error);
				throw error;
			}
			i++;
		}

		// Update album metadata
		const updateData: Prisma.AlbumUpdateInput = {
			...(validated.name && { name: validated.name }),
			...(validated.description && { description: validated.description }),
			...(validated.date && { date: new Date(validated.date) }),
		};

		const updatedAlbum = await prisma.album.update({
			where: { id },
			data: updateData,
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

		return c.json(updatedAlbum);
	} catch (error) {
		console.error("Update error:", error);
		if (error instanceof z.ZodError) {
			return c.json({
				error: "Validation error",
				details: error.errors,
			}, 400);
		}
		if (error instanceof SyntaxError) {
			return c.json({
				error: "Invalid JSON data",
				details: error.message,
			}, 400);
		}
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

		// Delete images from storage
		for (const image of existing.images) {
			const filePath = image.url.split("/").pop();
			if (filePath) {
				await storageHelpers.deleteFile("albums", `${id}/${filePath}`);
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

/**
 * Delete Single Image
 * DELETE /api/albums/:albumId/images/:imageId
 * Requires authentication
 */
albums.delete("/:albumId/images/:imageId", requireAuth, async (c) => {
	try {
		const albumId = c.req.param("albumId");
		const imageId = c.req.param("imageId");
		const user = c.get("user");

		// Check if image exists and user has permission
		const image = await prisma.image.findUnique({
			where: { id: imageId },
			include: {
				album: {
					select: {
						uploadedById: true
					}
				}
			}
		});

		if (!image) {
			return c.json({ error: "Image not found" }, 404);
		}

		if (image.album.uploadedById !== user!.id) {
			return c.json({ error: "Unauthorized" }, 403);
		}

		// Delete file from storage
		const filePath = image.url.split("/").pop();
		if (filePath) {
			await storageHelpers.deleteFile("albums", `${albumId}/${filePath}`);
		}

		// Delete image from database
		await prisma.image.delete({
			where: { id: imageId }
		});

		// Return updated album data
		const updatedAlbum = await prisma.album.findUnique({
			where: { id: albumId },
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

		return c.json(updatedAlbum);
	} catch (error) {
		console.error("Delete image error:", error);
		return c.json({ error: "Failed to delete image" }, 400);
	}
});

export { albums };
