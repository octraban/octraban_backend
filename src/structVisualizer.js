/**
 * Parse struct layout from ABI definition
 * @param {object} structDef - Struct definition from ABI
 * @returns {object} Parsed struct with fields
 */
export function parseStructLayout(structDef) {
  const fields = (structDef.fields || []).map((field) => ({
    name: field.name,
    type: extractType(field.type),
    doc: field.doc,
    nested: isNestedType(field.type),
    children: field.type?.fields
      ? field.type.fields.map((f) => ({
          name: f.name,
          type: extractType(f.type),
        }))
      : [],
  }));

  return { fields };
}

/**
 * Extract type string from type object
 * @param {object} typeObj - Type object
 * @returns {string} Type string
 */
function extractType(typeObj) {
  if (!typeObj) return "Unknown";
  if (typeObj.tag) return typeObj.tag;
  if (typeObj.val) return typeObj.val;
  if (typeObj.type) return extractType(typeObj.type);
  return "Unknown";
}

/**
 * Check if type is nested
 * @param {object} typeObj - Type object
 * @returns {boolean} True if nested
 */
function isNestedType(typeObj) {
  if (!typeObj) return false;
  return typeObj.tag === "Tuple" || typeObj.tag === "Struct" || typeObj.fields;
}

/**
 * Build hierarchical layout from fields
 * @param {array} fields - Fields array
 * @returns {array} Hierarchical fields with level
 */
export function buildHierarchy(fields) {
  const result = [];

  function traverse(fieldList, level = 0) {
    fieldList.forEach((field) => {
      result.push({ ...field, level });
      if (field.nested && field.children) {
        traverse(field.children, level + 1);
      }
    });
  }

  traverse(fields);
  return result;
}

/**
 * Expand struct field with metadata
 * @param {object} field - Field to expand
 * @returns {object} Expanded field
 */
export function expandStructField(field) {
  return {
    ...field,
    isExpanded: true,
    children: field.children || [],
  };
}
