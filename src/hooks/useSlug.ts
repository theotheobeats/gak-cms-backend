import { useEffect, useState } from "hono/jsx";


export function createSlug(text: string): string {
	return text
		.toLowerCase()
		.replace(/\s+/g, "-") // Replace spaces with hyphens
		.replace(/[^\w\-]+/g, "") // Remove all non-word chars
		.replace(/\-\-+/g, "-") // Replace multiple hyphens with single hyphen
		.replace(/^-+/, "") // Trim hyphens from start
		.replace(/-+$/, ""); // Trim hyphens from end
}

export function useSlug(text: string) {
	const [slug, setSlug] = useState<string>("");

	useEffect(() => {
		setSlug(createSlug(text));
	}, [text]);

	return slug;
}

// Optional: Add a hook that returns both the slug and a manual setter
export function useSlugWithControl(initialText: string = "") {
	const [text, setText] = useState(initialText);
	const [slug, setSlug] = useState(createSlug(initialText));
	const [isAutomatic, setIsAutomatic] = useState(true);

	useEffect(() => {
		if (isAutomatic) {
			setSlug(createSlug(text));
		}
	}, [text, isAutomatic]);

	return {
		text,
		setText,
		slug,
		setSlug,
		isAutomatic,
		setIsAutomatic,
	};
}
