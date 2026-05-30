/**
 * Extract doc comments from Rust code
 * @param {string} code - Rust source code
 * @returns {array} Array of doc comment objects
 */
export function extractDocComments(code) {
  const lines = code.split("\n");
  const docs = [];
  let currentDoc = null;
  let startLine = 0;

  lines.forEach((line, idx) => {
    const trimmed = line.trim();

    if (trimmed.startsWith("///")) {
      if (!currentDoc) {
        currentDoc = [];
        startLine = idx;
      }
      currentDoc.push(trimmed.substring(3).trim());
    } else if (currentDoc) {
      docs.push({
        content: currentDoc.join("\n"),
        lineNum: startLine,
      });
      currentDoc = null;
    }
  });

  if (currentDoc) {
    docs.push({
      content: currentDoc.join("\n"),
      lineNum: startLine,
    });
  }

  return docs;
}

/**
 * Match doc comment to function
 * @param {object|array} doc - Doc comment(s)
 * @param {object} func - Function object
 * @returns {boolean} True if doc matches function
 */
export function matchDocToFunction(doc, func) {
  const docArray = Array.isArray(doc) ? doc : [doc];
  if (docArray.length === 0) return false;

  const lastDoc = docArray[docArray.length - 1];
  const lineGap = func.lineNum - lastDoc.lineNum;

  return lineGap > 0 && lineGap <= docArray.length + 1;
}

/**
 * Build registry of function documentation
 * @param {string} code - Rust source code
 * @returns {Map} Map of function names to documentation
 */
export function buildDocRegistry(code) {
  const registry = new Map();
  const lines = code.split("\n");
  const docs = extractDocComments(code);

  const functionRegex = /pub\s+fn\s+(\w+)\s*\(/;

  lines.forEach((line, idx) => {
    const match = line.match(functionRegex);
    if (match) {
      const funcName = match[1];
      const relevantDoc = docs.find((d) => {
        const lineGap = idx - d.lineNum;
        return lineGap > 0 && lineGap <= 10;
      });

      if (relevantDoc) {
        registry.set(funcName, relevantDoc.content);
      }
    }
  });

  return registry;
}

/**
 * Get documentation for a function
 * @param {Map} registry - Doc registry
 * @param {string} functionName - Function name
 * @param {object} options - Formatting options
 * @returns {string|undefined} Documentation string
 */
export function getDocForFunction(registry, functionName, options = {}) {
  const doc = registry.get(functionName);

  if (!doc) return undefined;

  let result = doc;

  if (options.maxLength) {
    result = result.substring(0, options.maxLength);
    if (doc.length > options.maxLength) {
      result += "...";
    }
  }

  if (options.format === "tooltip") {
    result = result.replace(/\n/g, " ").trim();
  }

  return result;
}
