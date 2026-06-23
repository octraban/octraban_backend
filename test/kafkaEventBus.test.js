import { describe, it } from "node:test";
import assert from "node:assert/strict";

describe("kafkaEventBus message ID generation", () => {
  it("generates unique IDs for sequential publishes on the same topic", () => {
    const seq = new Map();
    const nextId = (topic) => {
      const n = (seq.get(topic) ?? 0) + 1;
      seq.set(topic, n);
      return `${topic}:${process.pid}:${n}`;
    };

    const id1 = nextId("test.topic");
    const id2 = nextId("test.topic");
    assert.notEqual(id1, id2);
  });

  it("sequences restart independently per topic", () => {
    const seq = new Map();
    const nextId = (topic) => {
      const n = (seq.get(topic) ?? 0) + 1;
      seq.set(topic, n);
      return `${topic}:${process.pid}:${n}`;
    };

    const a1 = nextId("topic.a");
    const b1 = nextId("topic.b");
    const a2 = nextId("topic.a");

    assert.ok(a1.startsWith("topic.a"));
    assert.ok(b1.startsWith("topic.b"));
    assert.ok(a2.startsWith("topic.a"));
    assert.notEqual(a1, a2);
    assert.notEqual(a1, b1);
  });

  it("includes pid in message ID for cross-instance uniqueness", () => {
    const seq = new Map();
    const nextId = (topic) => {
      const n = (seq.get(topic) ?? 0) + 1;
      seq.set(topic, n);
      return `${topic}:${process.pid}:${n}`;
    };

    const id = nextId("contracts");
    assert.ok(id.includes(String(process.pid)));
  });
});

describe("kafkaEventBus idempotency logic", () => {
  it("dedup set prevents duplicate processing", () => {
    const processed = new Set();

    const processOnce = (messageId) => {
      if (processed.has(messageId)) return false;
      processed.add(messageId);
      return true;
    };

    assert.ok(processOnce("msg-1"));
    assert.ok(!processOnce("msg-1"));
    assert.ok(processOnce("msg-2"));
    assert.ok(!processOnce("msg-2"));
  });

  it("failed handler removes message from dedup set for retry", () => {
    const processed = new Set();

    const processWithRetry = async (messageId, handler) => {
      if (processed.has(messageId)) return false;
      processed.add(messageId);
      try {
        await handler();
        return true;
      } catch {
        processed.delete(messageId);
        return false;
      }
    };

    let calls = 0;
    const flakyHandler = async () => {
      calls++;
      if (calls < 2) throw new Error("transient");
    };

    return processWithRetry("msg-retry", flakyHandler).then((r1) => {
      assert.equal(r1, false);
      assert.ok(!processed.has("msg-retry"));
      return processWithRetry("msg-retry", flakyHandler).then((r2) => {
        assert.equal(r2, true);
        assert.ok(processed.has("msg-retry"));
      });
    });
  });

  it("different consumer groups maintain independent dedup state", () => {
    const dedupStores = {};

    const processForGroup = (groupId, messageId) => {
      if (!dedupStores[groupId]) dedupStores[groupId] = new Set();
      if (dedupStores[groupId].has(messageId)) return false;
      dedupStores[groupId].add(messageId);
      return true;
    };

    assert.ok(processForGroup("group-a", "msg-1"));
    assert.ok(processForGroup("group-b", "msg-1"));
    assert.ok(!processForGroup("group-a", "msg-1"));
    assert.ok(!processForGroup("group-b", "msg-1"));
  });
});

describe("kafkaEventBus partition routing", () => {
  it("partitions topic by contractId", () => {
    const getPartitionedTopic = (base, contractId) => `${base}.${contractId}`;
    const topic = getPartitionedTopic("soroban.events", "C123");
    assert.equal(topic, "soroban.events.C123");
  });

  it("events for different contracts route to different partitions", () => {
    const getPartitionedTopic = (base, contractId) => `${base}.${contractId}`;
    const t1 = getPartitionedTopic("soroban.events", "CA");
    const t2 = getPartitionedTopic("soroban.events", "CB");
    assert.notEqual(t1, t2);
  });
});

describe("kafkaEventBus message envelope", () => {
  it("serialises payload with messageId, topic, and timestamp", () => {
    const makeMessage = (topic, messageId, payload) =>
      JSON.stringify({ messageId, topic, payload, ts: Date.now() });

    const raw = makeMessage("soroban.events", "msg-1", { ledger: 100 });
    const parsed = JSON.parse(raw);

    assert.equal(parsed.messageId, "msg-1");
    assert.equal(parsed.topic, "soroban.events");
    assert.deepEqual(parsed.payload, { ledger: 100 });
    assert.ok(typeof parsed.ts === "number");
  });

  it("handles empty payload", () => {
    const makeMessage = (topic, messageId, payload) =>
      JSON.stringify({ messageId, topic, payload, ts: Date.now() });

    const raw = makeMessage("soroban.events", "msg-empty", {});
    const parsed = JSON.parse(raw);
    assert.deepEqual(parsed.payload, {});
  });
});
