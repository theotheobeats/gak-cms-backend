"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.storageHelpers = exports.supabaseStorage = void 0;
const supabase_js_1 = require("@supabase/supabase-js");
if (!process.env.SUPABASE_URL) {
    throw new Error("Missing SUPABASE_URL environment variable");
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY environment variable");
}
// Single client instance with service role for file management
exports.supabaseStorage = (0, supabase_js_1.createClient)(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: {
        persistSession: false,
        autoRefreshToken: false,
    }
});
// Helper functions for common storage operations
exports.storageHelpers = {
    // Ensure bucket exists
    async ensureBucket(bucketName) {
        // Check if bucket exists
        const { data: buckets } = await exports.supabaseStorage.storage.listBuckets();
        const bucketExists = buckets?.some(bucket => bucket.name === bucketName);
        if (!bucketExists) {
            // Create bucket if it doesn't exist
            const { error } = await exports.supabaseStorage.storage.createBucket(bucketName, {
                public: true,
                fileSizeLimit: 52428800, // 50MB
            });
            if (error)
                throw error;
        }
    },
    // Generate unique file path
    generateUniquePath(originalPath) {
        const timestamp = Date.now();
        const lastDotIndex = originalPath.lastIndexOf('.');
        if (lastDotIndex === -1) {
            return `${originalPath}_${timestamp}`;
        }
        const nameWithoutExt = originalPath.slice(0, lastDotIndex);
        const extension = originalPath.slice(lastDotIndex);
        return `${nameWithoutExt}_${timestamp}${extension}`;
    },
    // Upload file and return public URL
    async uploadFile(bucketName, filePath, file) {
        // Ensure bucket exists before upload
        await this.ensureBucket(bucketName);
        // Generate unique path to prevent conflicts
        const uniquePath = this.generateUniquePath(filePath);
        const { data, error } = await exports.supabaseStorage.storage
            .from(bucketName)
            .upload(uniquePath, file, {
            cacheControl: '3600',
            upsert: true // Enable upsert as a fallback
        });
        if (error)
            throw error;
        const { data: { publicUrl } } = exports.supabaseStorage.storage
            .from(bucketName)
            .getPublicUrl(uniquePath);
        return publicUrl;
    },
    // Delete file
    async deleteFile(bucketName, filePath) {
        const { error } = await exports.supabaseStorage.storage
            .from(bucketName)
            .remove([filePath]);
        if (error)
            throw error;
    }
};
