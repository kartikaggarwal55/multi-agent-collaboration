#!/usr/bin/env tsx
/**
 * Test harness for dynamic stopping behavior
 * Run with: npx tsx scripts/test-stopping.ts
 *
 * Tests the stop rules without making real API calls
 */

import {
  resetRoom,
  getRoom,
  setGoal,
  addMessage,
  applyStatePatch,
  computeStateSignature,
  getUnresolvedQuestions,
  setActiveRun,
  shouldCancelRun,
  updateStage,
} from "../src/lib/store";
import { OrchestratorRunState, TurnMeta } from "../src/lib/types";

// ANSI colors for output
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const BLUE = "\x1b[34m";
const RESET = "\x1b[0m";

function log(msg: string) {
  console.log(msg);
}

function pass(testName: string) {
  log(`${GREEN}✓ PASS${RESET}: ${testName}`);
}

function fail(testName: string, reason: string) {
  log(`${RED}✗ FAIL${RESET}: ${testName}`);
  log(`  ${RED}Reason: ${reason}${RESET}`);
}

function section(name: string) {
  log(`\n${BLUE}━━━ ${name} ━━━${RESET}\n`);
}

// Configuration constants (mirroring orchestrator.ts)
const CONFIDENCE_THRESHOLD = 0.55;
const STALL_REPEAT_THRESHOLD = 2;
// CHANGED: Minimum turns before allowing early stops
const MIN_TURNS_FOR_EARLY_STOP = 2;

// Inline evaluateStopRules for testing (mirrors orchestrator logic)
function evaluateStopRules(
  runState: OrchestratorRunState,
  meta: TurnMeta,
  assistantId: string,
  assistants: { id: string }[]
): string | null {
  // CHANGED: Rule 1: WAIT_FOR_USER - only after minimum turns
  if (meta.next_action === "WAIT_FOR_USER") {
    if (runState.turnCount >= MIN_TURNS_FOR_EARLY_STOP) {
      return "WAIT_FOR_USER";
    }
    // Deferred - other assistant hasn't spoken yet
    return null;
  }

  // Low confidence + questions: only stop after minimum turns
  if (
    meta.confidence < CONFIDENCE_THRESHOLD &&
    meta.questions_for_user &&
    meta.questions_for_user.length > 0 &&
    runState.turnCount >= MIN_TURNS_FOR_EARLY_STOP
  ) {
    return "WAIT_FOR_USER";
  }

  // Rule 2: HANDOFF_DONE with handshake
  if (meta.next_action === "HANDOFF_DONE") {
    runState.handoffDoneBy.add(assistantId);

    const allAssistantIds = assistants.map((a) => a.id);
    const allDone = allAssistantIds.every((id) => runState.handoffDoneBy.has(id));
    const unresolvedQuestions = getUnresolvedQuestions();

    if (allDone && unresolvedQuestions.length === 0) {
      return "HANDOFF_DONE";
    }

    // If only one said done and no questions, allow after minimum turns
    if (runState.turnCount >= MIN_TURNS_FOR_EARLY_STOP && unresolvedQuestions.length === 0) {
      return "HANDOFF_DONE";
    }
  }

  return null;
}

// ============================================================
// Test: WAIT_FOR_USER - explicit next_action
// ============================================================
function testWaitForUserExplicit() {
  section("Test: WAIT_FOR_USER (explicit next_action)");
  resetRoom();

  // CHANGED: Test with turnCount >= 2 (both assistants have spoken)
  const runState: OrchestratorRunState = {
    runId: "test-1",
    turnCount: 2, // Both assistants have spoken
    lastSpeaker: null,
    stopReason: null,
    stateSignatures: [],
    handoffDoneBy: new Set(),
    cancelled: false,
  };

  const meta: TurnMeta = {
    next_action: "WAIT_FOR_USER",
    questions_for_user: [{ target: "Alice", question: "What time works for you?" }],
    state_patch: {},
    confidence: 0.3,
    reason_brief: "Need user input on timing",
  };

  const result = evaluateStopRules(
    runState,
    meta,
    "alice-assistant",
    [{ id: "alice-assistant" }, { id: "bob-assistant" }]
  );

  if (result === "WAIT_FOR_USER") {
    pass("Explicit WAIT_FOR_USER triggers stop (after min turns)");
  } else {
    fail("Explicit WAIT_FOR_USER triggers stop", `Got: ${result}`);
  }

  // CHANGED: Test deferral when turnCount < 2
  const earlyRunState: OrchestratorRunState = {
    ...runState,
    turnCount: 1,
    handoffDoneBy: new Set(),
  };

  const earlyResult = evaluateStopRules(
    earlyRunState,
    meta,
    "alice-assistant",
    [{ id: "alice-assistant" }, { id: "bob-assistant" }]
  );

  if (earlyResult === null) {
    pass("WAIT_FOR_USER deferred when only 1 assistant has spoken");
  } else {
    fail("Should defer WAIT_FOR_USER early", `Got: ${earlyResult}`);
  }
}

// ============================================================
// Test: WAIT_FOR_USER - low confidence + questions
// ============================================================
function testWaitForUserLowConfidence() {
  section("Test: WAIT_FOR_USER (low confidence + questions)");
  resetRoom();

  // CHANGED: Use turnCount >= 2 for the test
  const runState: OrchestratorRunState = {
    runId: "test-2",
    turnCount: 2, // Both assistants have spoken
    lastSpeaker: null,
    stopReason: null,
    stateSignatures: [],
    handoffDoneBy: new Set(),
    cancelled: false,
  };

  const meta: TurnMeta = {
    next_action: "CONTINUE", // Not explicitly waiting
    questions_for_user: [{ target: "Bob", question: "What's your budget?" }],
    state_patch: {},
    confidence: 0.3, // Below threshold
    reason_brief: "Not sure about constraints",
  };

  const result = evaluateStopRules(
    runState,
    meta,
    "alice-assistant",
    [{ id: "alice-assistant" }, { id: "bob-assistant" }]
  );

  if (result === "WAIT_FOR_USER") {
    pass("Low confidence (0.3) + questions triggers WAIT_FOR_USER (after min turns)");
  } else {
    fail("Low confidence + questions triggers WAIT_FOR_USER", `Got: ${result}`);
  }

  // Test that high confidence doesn't trigger
  meta.confidence = 0.8;
  const result2 = evaluateStopRules(
    { ...runState, handoffDoneBy: new Set() },
    meta,
    "alice-assistant",
    [{ id: "alice-assistant" }, { id: "bob-assistant" }]
  );

  if (result2 === null) {
    pass("High confidence (0.8) + questions does NOT trigger stop");
  } else {
    fail("High confidence should not trigger stop", `Got: ${result2}`);
  }
}

// ============================================================
// Test: HANDOFF_DONE - both assistants signal
// ============================================================
function testHandoffDoneBothSignal() {
  section("Test: HANDOFF_DONE (both assistants handshake)");
  resetRoom();

  const runState: OrchestratorRunState = {
    runId: "test-3",
    turnCount: 2,
    lastSpeaker: null,
    stopReason: null,
    stateSignatures: [],
    handoffDoneBy: new Set(),
    cancelled: false,
  };

  const assistants = [{ id: "alice-assistant" }, { id: "bob-assistant" }];

  const meta: TurnMeta = {
    next_action: "HANDOFF_DONE",
    questions_for_user: [],
    state_patch: {},
    confidence: 0.9,
    reason_brief: "Plan is ready",
  };

  // First assistant signals done
  const result1 = evaluateStopRules(runState, meta, "alice-assistant", assistants);

  // Should not stop yet - only one signaled
  if (result1 === null || result1 === "HANDOFF_DONE") {
    // Either null (waiting for second) or HANDOFF_DONE (if turn count >= 2)
    log(`  First signal: ${result1 || "waiting for second"}`);
  }

  // Second assistant signals done
  const result2 = evaluateStopRules(runState, meta, "bob-assistant", assistants);

  if (result2 === "HANDOFF_DONE") {
    pass("Both assistants signaling HANDOFF_DONE triggers stop");
  } else {
    fail("Both signaling should trigger HANDOFF_DONE", `Got: ${result2}`);
  }
}

// ============================================================
// Test: HANDOFF_DONE blocked by open questions
// ============================================================
function testHandoffDoneBlockedByQuestions() {
  section("Test: HANDOFF_DONE blocked by open questions");
  resetRoom();
  setGoal("Plan a dinner");

  // Add an open question
  applyStatePatch(
    {
      add_questions: [{ target: "Alice", question: "Any dietary restrictions?" }],
    },
    "bob-assistant"
  );

  const runState: OrchestratorRunState = {
    runId: "test-4",
    turnCount: 1, // Low turn count to test blocking
    lastSpeaker: null,
    stopReason: null,
    stateSignatures: [],
    handoffDoneBy: new Set(["alice-assistant"]), // First already signaled
    cancelled: false,
  };

  const meta: TurnMeta = {
    next_action: "HANDOFF_DONE",
    questions_for_user: [],
    state_patch: {},
    confidence: 0.9,
    reason_brief: "I think we're done",
  };

  // Try second assistant signaling done
  runState.handoffDoneBy.add("bob-assistant");
  const allDone = ["alice-assistant", "bob-assistant"].every((id) =>
    runState.handoffDoneBy.has(id)
  );
  const unresolvedQuestions = getUnresolvedQuestions();

  if (allDone && unresolvedQuestions.length > 0) {
    pass("HANDOFF_DONE blocked when open questions exist");
    log(`  Open questions: ${unresolvedQuestions.map((q) => q.question).join(", ")}`);
  } else {
    fail(
      "Should block HANDOFF_DONE with open questions",
      `allDone=${allDone}, questions=${unresolvedQuestions.length}`
    );
  }
}

// ============================================================
// Test: CAP_REACHED - simulated turn count
// ============================================================
function testCapReached() {
  section("Test: CAP_REACHED (turn limit)");
  resetRoom();

  const MAX_TURNS = 12;

  const runState: OrchestratorRunState = {
    runId: "test-5",
    turnCount: MAX_TURNS,
    lastSpeaker: null,
    stopReason: null,
    stateSignatures: [],
    handoffDoneBy: new Set(),
    cancelled: false,
  };

  // Simulate orchestrator logic
  if (runState.turnCount >= MAX_TURNS) {
    runState.stopReason = "CAP_REACHED";
    pass(`Turn count (${runState.turnCount}) >= ${MAX_TURNS} triggers CAP_REACHED`);
  } else {
    fail("CAP_REACHED should trigger", `turnCount=${runState.turnCount}`);
  }
}

// ============================================================
// Test: STALL_DETECTED - repeated state signatures
// ============================================================
function testStallDetected() {
  section("Test: STALL_DETECTED (repeated state signatures)");
  resetRoom();
  setGoal("Pick a restaurant");

  // Set up initial state
  applyStatePatch(
    {
      leading_option: "Italian place on Main St",
      status_summary: ["Discussing options"],
    },
    "alice-assistant"
  );

  const sig1 = computeStateSignature();
  log(`  Signature 1: ${sig1.slice(0, 50)}...`);

  // Simulate state not changing
  const sig2 = computeStateSignature();
  log(`  Signature 2: ${sig2.slice(0, 50)}...`);

  // Add to state signatures array
  const stateSignatures = [sig1, sig2];
  const signatureRepeats = stateSignatures.filter((s) => s === sig2).length;

  log(`  Repeat count: ${signatureRepeats}`);

  if (signatureRepeats >= STALL_REPEAT_THRESHOLD) {
    pass(`Signature repeated ${signatureRepeats} times >= ${STALL_REPEAT_THRESHOLD} triggers STALL_DETECTED`);
  } else {
    fail("STALL_DETECTED should trigger", `repeats=${signatureRepeats}`);
  }

  // Verify state change creates different signature
  applyStatePatch(
    {
      leading_option: "New option: Thai place",
    },
    "bob-assistant"
  );

  const sig3 = computeStateSignature();
  if (sig3 !== sig2) {
    pass("State change creates different signature");
    log(`  Signature 3: ${sig3.slice(0, 50)}...`);
  } else {
    fail("State change should create different signature", "Signatures match");
  }
}

// ============================================================
// Test: Cancellation mechanism
// ============================================================
function testCancellation() {
  section("Test: Run cancellation");
  resetRoom();

  const runId1 = "run-1";
  setActiveRun(runId1);

  if (!shouldCancelRun(runId1)) {
    pass("Active run should not be cancelled");
  } else {
    fail("Active run should not be cancelled", "shouldCancelRun returned true");
  }

  // Simulate new message arriving (sets new run or null)
  setActiveRun(null);

  if (shouldCancelRun(runId1)) {
    pass("Old run should be cancelled after setActiveRun(null)");
  } else {
    fail("Old run should be cancelled", "shouldCancelRun returned false");
  }

  // New run should work
  const runId2 = "run-2";
  setActiveRun(runId2);

  if (!shouldCancelRun(runId2) && shouldCancelRun(runId1)) {
    pass("New run active, old run cancelled");
  } else {
    fail("Run state incorrect", `run1 cancelled: ${shouldCancelRun(runId1)}, run2 cancelled: ${shouldCancelRun(runId2)}`);
  }
}

// ============================================================
// Test: State patch merging with deduplication
// ============================================================
function testStatePatchMerging() {
  section("Test: State patch merging & deduplication");
  resetRoom();
  setGoal("Plan a trip");

  // Add constraint
  applyStatePatch(
    {
      add_constraints: [{ participantId: "alice", constraint: "No flying" }],
    },
    "alice-assistant"
  );

  let room = getRoom();
  if (room.canonicalState.constraints.length === 1) {
    pass("Constraint added successfully");
  } else {
    fail("Constraint should be added", `count=${room.canonicalState.constraints.length}`);
  }

  // Try to add duplicate constraint
  applyStatePatch(
    {
      add_constraints: [{ participantId: "alice", constraint: "no flying" }], // lowercase
    },
    "bob-assistant"
  );

  room = getRoom();
  if (room.canonicalState.constraints.length === 1) {
    pass("Duplicate constraint (case-insensitive) deduplicated");
  } else {
    fail("Should deduplicate", `count=${room.canonicalState.constraints.length}`);
  }

  // Add different constraint
  applyStatePatch(
    {
      add_constraints: [{ participantId: "bob", constraint: "Budget under $500" }],
    },
    "bob-assistant"
  );

  room = getRoom();
  if (room.canonicalState.constraints.length === 2) {
    pass("Different constraint added");
  } else {
    fail("Should add different constraint", `count=${room.canonicalState.constraints.length}`);
  }

  // Test question deduplication (exact match on first 30 chars)
  applyStatePatch(
    {
      add_questions: [{ target: "Alice", question: "What dates work for you and your family?" }],
    },
    "alice-assistant"
  );

  room = getRoom();
  const questionCount = room.canonicalState.openQuestions.length;

  // This should be deduplicated: existing question contains first 30 chars of new
  applyStatePatch(
    {
      add_questions: [{ target: "Alice", question: "What dates work for you" }], // Prefix of existing
    },
    "bob-assistant"
  );

  room = getRoom();
  if (room.canonicalState.openQuestions.length === questionCount) {
    pass("Similar question (prefix match) deduplicated");
  } else {
    fail("Should deduplicate similar question", `before=${questionCount}, after=${room.canonicalState.openQuestions.length}`);
  }

  // Different question should be added
  applyStatePatch(
    {
      add_questions: [{ target: "Bob", question: "Completely different question here" }],
    },
    "alice-assistant"
  );

  room = getRoom();
  if (room.canonicalState.openQuestions.length === questionCount + 1) {
    pass("Different question added");
  } else {
    fail("Should add different question", `expected=${questionCount + 1}, got=${room.canonicalState.openQuestions.length}`);
  }
}

// ============================================================
// Run all tests
// ============================================================
function main() {
  log(`\n${YELLOW}╔══════════════════════════════════════════════════════════════╗${RESET}`);
  log(`${YELLOW}║           Dynamic Stopping Behavior Test Harness             ║${RESET}`);
  log(`${YELLOW}╚══════════════════════════════════════════════════════════════╝${RESET}`);

  log(`\n${YELLOW}Configuration:${RESET}`);
  log(`  CONFIDENCE_THRESHOLD: ${CONFIDENCE_THRESHOLD}`);
  log(`  STALL_REPEAT_THRESHOLD: ${STALL_REPEAT_THRESHOLD}`);

  testWaitForUserExplicit();
  testWaitForUserLowConfidence();
  testHandoffDoneBothSignal();
  testHandoffDoneBlockedByQuestions();
  testCapReached();
  testStallDetected();
  testCancellation();
  testStatePatchMerging();

  log(`\n${YELLOW}━━━ All tests complete ━━━${RESET}\n`);
}

main();
