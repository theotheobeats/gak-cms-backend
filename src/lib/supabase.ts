import { createClient } from "@supabase/supabase-js";

if (!process.env.SUPABASE_URL) {
	throw new Error("Missing SUPABASE_URL environment variable");
}

if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
	throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
}

// Single client instance with service role for file management
export const supabaseStorage = createClient(
	process.env.SUPABASE_URL,
	process.env.SUPABASE_SERVICE_ROLE_KEY,
	{
		auth: {
			persistSession: false,
			autoRefreshToken: false,
		}
	}
);

// Helper functions for common storage operations
export const storageHelpers = {
	// Upload file and return public URL
	async uploadFile(bucketName: string, filePath: string, file: File | Buffer) {
		const { data, error } = await supabaseStorage.storage
			.from(bucketName)
			.upload(filePath, file, {
				cacheControl: '3600',
				upsert: false
			});

		if (error) throw error;

		const { data: { publicUrl } } = supabaseStorage.storage
			.from(bucketName)
			.getPublicUrl(filePath);

		return publicUrl;
	},

	// Delete file
	async deleteFile(bucketName: string, filePath: string) {
		const { error } = await supabaseStorage.storage
			.from(bucketName)
			.remove([filePath]);

		if (error) throw error;
	}
};
