// Search text is used inside a MongoDB regex. Characters like ( . * + ? have
// special meaning in a regex, so "a(b" would crash the query and ".*" would match
// everything. Putting a backslash in front makes them plain characters.
const escapeRegex = (text) => {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
};

module.exports = escapeRegex;
