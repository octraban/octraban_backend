import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseStructLayout, buildHierarchy, expandStructField } from "../src/structVisualizer.js";

describe("structVisualizer", () => {
  describe("parseStructLayout", () => {
    it("should parse simple struct with primitive fields", () => {
      const abi = {
        types: [
          {
            doc: "User struct",
            fields: [
              { doc: "User address", name: "address", type: { val: "Address" } },
              { doc: "User balance", name: "balance", type: { tag: "I128" } },
            ],
          },
        ],
      };

      const result = parseStructLayout(abi.types[0]);
      assert.equal(result.fields.length, 2);
      assert.equal(result.fields[0].name, "address");
      assert.equal(result.fields[0].type, "Address");
      assert.equal(result.fields[1].name, "balance");
      assert.equal(result.fields[1].type, "I128");
    });

    it("should handle nested struct types", () => {
      const abi = {
        types: [
          {
            doc: "Nested struct",
            fields: [
              { name: "id", type: { tag: "U32" } },
              {
                name: "metadata",
                type: {
                  tag: "Tuple",
                  fields: [
                    { name: "created_at", type: { tag: "U64" } },
                    { name: "updated_at", type: { tag: "U64" } },
                  ],
                },
              },
            ],
          },
        ],
      };

      const result = parseStructLayout(abi.types[0]);
      assert.equal(result.fields.length, 2);
      assert.equal(result.fields[1].name, "metadata");
      assert.equal(result.fields[1].nested, true);
    });

    it("should extract field documentation", () => {
      const abi = {
        types: [
          {
            fields: [
              { doc: "Primary key", name: "id", type: { tag: "U64" } },
              { doc: "User name", name: "name", type: { tag: "Symbol", val: "String" } },
            ],
          },
        ],
      };

      const result = parseStructLayout(abi.types[0]);
      assert.equal(result.fields[0].doc, "Primary key");
      assert.equal(result.fields[1].doc, "User name");
    });
  });

  describe("buildHierarchy", () => {
    it("should build flat hierarchy for simple struct", () => {
      const fields = [
        { name: "id", type: "U64", doc: "ID field" },
        { name: "amount", type: "I128", doc: "Amount field" },
      ];

      const hierarchy = buildHierarchy(fields);
      assert.equal(hierarchy.length, 2);
      assert.equal(hierarchy[0].level, 0);
      assert.equal(hierarchy[1].level, 0);
    });

    it("should build nested hierarchy for complex struct", () => {
      const fields = [
        { name: "id", type: "U64", doc: "ID" },
        {
          name: "config",
          type: "Tuple",
          nested: true,
          children: [
            { name: "enabled", type: "Bool", doc: "Enabled flag" },
            { name: "timeout", type: "U32", doc: "Timeout" },
          ],
        },
      ];

      const hierarchy = buildHierarchy(fields);
      assert.equal(hierarchy.length, 4);
      assert.equal(hierarchy[0].level, 0);
      assert.equal(hierarchy[1].level, 0);
      assert.equal(hierarchy[2].level, 1);
      assert.equal(hierarchy[3].level, 1);
    });

    it("should assign correct indentation levels", () => {
      const fields = [
        { name: "root", type: "U64" },
        {
          name: "nested",
          nested: true,
          children: [
            { name: "child1", type: "U32" },
            {
              name: "deep",
              nested: true,
              children: [{ name: "leaf", type: "Bool" }],
            },
          ],
        },
      ];

      const hierarchy = buildHierarchy(fields);
      assert.equal(hierarchy[0].level, 0);
      assert.equal(hierarchy[1].level, 0);
      assert.equal(hierarchy[2].level, 1);
      assert.equal(hierarchy[3].level, 1);
      assert.equal(hierarchy[4].level, 2);
    });
  });

  describe("expandStructField", () => {
    it("should expand struct field with all metadata", () => {
      const field = {
        name: "user",
        type: "Struct",
        doc: "User information",
        nested: true,
        children: [
          { name: "address", type: "Address", doc: "User address" },
          { name: "balance", type: "I128", doc: "User balance" },
        ],
      };

      const expanded = expandStructField(field);
      assert.equal(expanded.name, "user");
      assert.equal(expanded.type, "Struct");
      assert.equal(expanded.doc, "User information");
      assert.equal(expanded.children.length, 2);
      assert.equal(expanded.isExpanded, true);
    });

    it("should handle field without documentation", () => {
      const field = {
        name: "data",
        type: "Vec",
        children: [{ name: "item", type: "U64" }],
      };

      const expanded = expandStructField(field);
      assert.equal(expanded.name, "data");
      assert.equal(expanded.doc, undefined);
      assert.equal(expanded.children.length, 1);
    });

    it("should preserve field hierarchy on expansion", () => {
      const field = {
        name: "config",
        type: "Tuple",
        nested: true,
        children: [
          { name: "timeout", type: "U32" },
          {
            name: "retry",
            nested: true,
            children: [
              { name: "max_attempts", type: "U32" },
              { name: "delay_ms", type: "U64" },
            ],
          },
        ],
      };

      const expanded = expandStructField(field);
      assert.equal(expanded.children.length, 2);
      assert.equal(expanded.children[1].children.length, 2);
    });
  });
});
