"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSlug = createSlug;
exports.useSlug = useSlug;
exports.useSlugWithControl = useSlugWithControl;
const jsx_1 = require("hono/jsx");
function createSlug(text) {
    return text
        .toLowerCase()
        .replace(/\s+/g, "-") // Replace spaces with hyphens
        .replace(/[^\w\-]+/g, "") // Remove all non-word chars
        .replace(/\-\-+/g, "-") // Replace multiple hyphens with single hyphen
        .replace(/^-+/, "") // Trim hyphens from start
        .replace(/-+$/, ""); // Trim hyphens from end
}
function useSlug(text) {
    const [slug, setSlug] = (0, jsx_1.useState)("");
    (0, jsx_1.useEffect)(() => {
        setSlug(createSlug(text));
    }, [text]);
    return slug;
}
// Optional: Add a hook that returns both the slug and a manual setter
function useSlugWithControl(initialText = "") {
    const [text, setText] = (0, jsx_1.useState)(initialText);
    const [slug, setSlug] = (0, jsx_1.useState)(createSlug(initialText));
    const [isAutomatic, setIsAutomatic] = (0, jsx_1.useState)(true);
    (0, jsx_1.useEffect)(() => {
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
