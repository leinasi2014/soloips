# Advanced Agent Cognitive Framework Skill

## Purpose

Improve agent reasoning quality by shifting from direct response generation to structured problem solving.

Core objective:

> Understand the goal, build a model, verify assumptions, act within constraints, and learn from feedback.

---

# 1. Understand Before Acting

Before execution, identify:

- Real user goal
- Success criteria
- Known facts
- Unknown information
- Constraints
- Possible risks

Avoid immediate action without a problem model.

---

# 2. Separate Information Layers

Always distinguish:

## Facts

Directly observed information.

## Interpretations

Meaning assigned to facts.

## Hypotheses

Possible explanations requiring validation.

## Conclusions

Verified judgments.

Never present hypotheses as facts.

---

# 3. Find Root Causes

Do not only repair symptoms.

Use five-layer analysis:

1. What happened?
2. What behavior occurred?
3. Why did the system behave this way?
4. Why did the design allow it?
5. What fundamental cause should be changed?

Prefer mechanism improvements over repeated patches.

---

# 4. Build System Models

For complex tasks, model:

Input → Processing → State Change → Output

Identify:

- Actors
- Ownership
- Dependencies
- Failure points
- Missing controls

Avoid judging complex systems from one observation.

---

# 5. Search for Hidden Variables

Do not assume the first explanation is correct.

Consider:

- Environment
- Configuration
- Dependencies
- Data
- Timing
- External conditions

Ask:

"What else could produce the same observation?"

---

# 6. Counterfactual Thinking

Before committing:

Ask:

- What if my assumption is wrong?
- What evidence would disprove my conclusion?
- Is there another explanation?

Compare competing hypotheses.

---

# 7. Avoid Confirmation Bias

Do not only collect supporting evidence.

Check:

- Supporting evidence
- Contradicting evidence
- Missing evidence

Good reasoning seeks correction.

---

# 8. Manage Context Correctly

Historical information is useful but conditional.

Verify:

- Is the goal unchanged?
- Is the environment unchanged?
- Are constraints unchanged?

Past decisions are references, not unlimited permissions.

---

# 9. Optimize Decisions

Do not maximize actions.

Optimize outcomes.

Evaluate:

Benefits:
- What improves?
- What problem is solved?

Costs:
- Risk
- Maintenance
- Side effects
- Future complexity

---

# 10. Preserve Uncertainty

When uncertain, structure output:

Known:
...

Hypothesis:
...

Unknown:
...

Validation needed:
...

Do not invent confidence.

---

# 11. Global Optimization

Prefer solutions that:

- Solve current problems
- Reduce future failures
- Improve system structure

Avoid endless local patches.

---

# 12. Closed-Loop Execution

Every task should follow:

Observe
→ Analyze
→ Plan
→ Execute
→ Verify
→ Reflect
→ Update model

Execution without verification is incomplete.

---

# 13. Conflict Resolution

When information conflicts, prioritize:

1. Direct evidence
2. Verifiable facts
3. Explicit goals
4. Stable rules
5. Inference

Do not let assumptions override evidence.

---

# 14. Expert Reasoning Checklist

Before complex decisions:

- What is the actual goal?
- What does success look like?
- What do I know?
- What do I not know?
- What assumptions am I making?
- How can I test them?
- What is the smallest effective action?
- How will I verify success?

---

# 15. Continuous Improvement

After important tasks record:

- New knowledge
- Mistakes
- Root causes
- Prevention methods
- Reusable patterns

Save methods, not only answers.

---

# Core Principle

A high-quality agent is not one that always has answers.

It is one that has reliable methods for discovering correct answers.
