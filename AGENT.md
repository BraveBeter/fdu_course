# AGENT.md

## Mission

Write production-quality code that is:

- **Simple**: prefer the smallest design that fully solves the problem.
- **Readable**: optimize for the next engineer, not for cleverness.
- **Decoupled**: keep modules focused and dependencies directional.
- **Extensible**: new behavior should usually be added by extension, not by rewriting existing logic.
- **Testable**: business logic should be easy to test without infrastructure.
- **Consistent**: follow the repository's existing conventions unless there is a clear reason to improve them.

The goal is not to maximize abstraction. The goal is to keep complexity proportional to the problem.

---

## 1. Core Engineering Rules

### 1.1 Simplicity First

Prefer:

```text
clear code > clever code
explicit flow > hidden magic
small modules > large modules
composition > inheritance
pure logic > implicit side effects
existing abstraction > duplicate abstraction
```

Do not introduce patterns, layers, interfaces, factories, registries, or frameworks unless they solve a real current problem.

Avoid speculative abstractions for hypothetical future requirements.

If two implementations are equally correct, choose the one with:

1. fewer concepts,
2. fewer dependencies,
3. fewer mutable states,
4. fewer lines of code,
5. clearer control flow.

---

## 2. Architecture

Use clear dependency direction.

Recommended conceptual layering:

```text
Interface / Delivery
        ↓
Application / Use Cases
        ↓
Domain / Core Logic
        ↓
Infrastructure
```

Dependencies must point toward stable business logic.

### Domain / Core

Contains:

- core entities
- domain rules
- pure computation
- domain-specific validation
- domain errors
- stable interfaces required by the domain

Must not depend directly on:

- HTTP frameworks
- database clients
- message queues
- filesystem APIs
- UI frameworks
- vendor SDKs

### Application

Contains:

- use cases
- orchestration
- workflows
- transaction boundaries
- coordination between domain services and ports

Application code should describe **what the system does**, not infrastructure details.

### Infrastructure

Contains implementations for:

- database access
- external APIs
- filesystem
- queues
- caches
- model providers
- third-party SDKs

Infrastructure should implement interfaces owned by higher-level modules where practical.

### Interface / Delivery

Contains:

- HTTP handlers
- CLI commands
- RPC handlers
- UI adapters
- request/response conversion

Handlers should be thin.

Bad:

```python
@app.post("/users")
def create_user():
    # validation
    # database access
    # business logic
    # email sending
    # serialization
```

Better:

```python
@app.post("/users")
def create_user(request):
    command = CreateUserCommand.from_request(request)
    result = create_user_use_case.execute(command)
    return UserResponse.from_result(result)
```

---

## 3. Module Boundaries

Every module should have one clear responsibility.

A module should be explainable in one sentence.

Good:

```text
auth/token.py
    Handles creation and verification of authentication tokens.
```

Bad:

```text
utils.py
    Contains unrelated authentication, formatting, database,
    network, parsing, and filesystem helpers.
```

Avoid generic dumping grounds:

```text
utils
common
helpers
misc
manager
processor
service
```

unless their scope is explicitly defined.

Prefer domain-oriented names.

Bad:

```text
utils.py
manager.py
common.py
```

Better:

```text
token_codec.py
request_validator.py
model_registry.py
retry_policy.py
```

---

## 4. Dependency Rules

### 4.1 No Circular Dependencies

Circular imports or dependency cycles are architectural defects.

If A depends on B and B depends on A:

- extract shared concepts,
- introduce a stable interface,
- move orchestration upward,
- reconsider module ownership.

Do not fix cycles using lazy imports unless the cycle is unavoidable and documented.

### 4.2 Depend on Contracts

At integration boundaries, depend on small contracts rather than concrete implementations.

Example:

```python
class UserRepository(Protocol):
    def get(self, user_id: str) -> User | None: ...
    def save(self, user: User) -> None: ...
```

Application logic depends on:

```text
UserRepository
```

not:

```text
PostgresUserRepository
```

Do not create interfaces for every class. Introduce them where substitution, isolation, or testing has real value.

### 4.3 Keep External Dependencies at the Edge

Vendor-specific objects should not leak through the entire codebase.

Bad:

```text
OpenAI SDK response
        ↓
application
        ↓
domain
        ↓
UI
```

Better:

```text
Vendor SDK
    ↓
Adapter
    ↓
Internal model
    ↓
Application / Domain
```

---

## 5. Functions

A function should do one coherent thing.

Prefer functions that are:

- short enough to understand without scrolling excessively,
- deterministic where possible,
- explicit about inputs and outputs,
- low in side effects.

Avoid:

- boolean flag explosions,
- hidden mutation,
- global state,
- deeply nested branches,
- functions with many unrelated responsibilities.

Bad:

```python
process(data, save=True, notify=False, async_mode=True, debug=False)
```

Prefer separate operations or a clear configuration object.

### Early Return

Prefer early returns to reduce nesting.

Bad:

```python
if user:
    if user.active:
        if user.has_permission:
            execute()
```

Better:

```python
if not user:
    return

if not user.active:
    return

if not user.has_permission:
    return

execute()
```

---

## 6. Classes

Create a class when it represents:

- an entity with meaningful state,
- a cohesive abstraction,
- a lifecycle,
- a polymorphic boundary.

Do not create classes merely to group unrelated functions.

Avoid "God Objects" that know too much or coordinate the entire system.

Prefer:

```text
small cohesive objects
```

over:

```text
Manager
Controller
Engine
Context
Coordinator
```

with hundreds of responsibilities.

If a class grows continuously, identify responsibilities that should become separate components.

---

## 7. Data Modeling

Use explicit data structures.

Prefer:

- typed models,
- dataclasses,
- records,
- enums,
- value objects,

over anonymous dictionaries with undocumented keys.

Bad:

```python
payload["config"]["runtime"]["model"]["name"]
```

Better:

```python
config.runtime.model.name
```

Model invalid states out of the system where practical.

If a field only supports a finite set of values, prefer an enum or constrained type over arbitrary strings.

---

## 8. Extensibility

Design extension points around actual axes of change.

Examples:

```text
StorageBackend
ModelBackend
Tokenizer
Serializer
SchedulerPolicy
RetryPolicy
```

Prefer registries or plugins only when multiple implementations actually exist or are expected soon.

A new implementation should ideally require:

```text
1. implementing a stable contract
2. registering/configuring it
3. no changes to unrelated modules
```

Avoid large conditional trees:

```python
if backend == "a":
    ...
elif backend == "b":
    ...
elif backend == "c":
    ...
```

when backend behavior is a real extension point.

Prefer polymorphism or a dispatch table:

```python
BACKENDS = {
    "a": BackendA,
    "b": BackendB,
}
```

However, for two trivial branches, a normal `if` is often simpler.

---

## 9. Configuration

Configuration should be:

- explicit,
- centralized,
- typed where practical,
- validated at startup.

Do not scatter environment-variable reads throughout business logic.

Bad:

```python
def execute():
    timeout = os.getenv("TIMEOUT")
```

Better:

```text
environment
    ↓
Config
    ↓
dependency injection
    ↓
application
```

Defaults should be conservative and visible.

---

## 10. Error Handling

Errors must preserve context.

Do not silently swallow exceptions.

Bad:

```python
try:
    ...
except Exception:
    pass
```

Use domain-specific errors where they improve clarity.

Example:

```python
class ModelNotFoundError(Exception):
    pass
```

Translate errors at boundaries:

```text
DatabaseError
    ↓
Repository / Adapter
    ↓
Domain or Application Error
    ↓
HTTP 404 / 409 / 500
```

Do not leak raw infrastructure exceptions into user-facing interfaces unless intentional.

Error messages should state:

- what failed,
- relevant identifiers,
- actionable context.

Do not include secrets.

---

## 11. State and Side Effects

Minimize mutable global state.

Prefer dependency injection over hidden singleton access.

Bad:

```python
GLOBAL_CLIENT = Client(...)
```

Better:

```python
class Service:
    def __init__(self, client: Client):
        self.client = client
```

Separate calculation from side effects.

Prefer:

```text
calculate()
persist()
publish()
```

over one function that mixes all three.

---

## 12. Concurrency and Async Code

Use async only when it solves real I/O concurrency needs.

Do not mix sync and async abstractions arbitrarily.

Explicitly define ownership of:

- tasks,
- threads,
- locks,
- queues,
- cancellation,
- shared state.

Every background task must have:

- a clear lifecycle,
- cancellation behavior,
- exception handling,
- ownership.

Avoid unbounded concurrency.

Prefer bounded queues, semaphores, pools, or explicit backpressure.

---

## 13. Naming

Names should reveal intent.

Bad:

```python
x
tmp
obj
data2
handle
do_work
process
```

Better:

```python
request_id
pending_batch
token_count
load_checkpoint
schedule_request
```

Short names are acceptable for obvious local scopes:

```python
for i in range(...)
for x in values
```

Public names should be descriptive.

Avoid encoding implementation details into names unless they are part of the abstraction.

---

## 14. Comments and Documentation

Code should explain **what**.

Comments should explain **why**.

Bad:

```python
# increment i
i += 1
```

Good:

```python
# Keep the sequence number monotonic because downstream consumers
# use it for deduplication.
sequence += 1
```

Document:

- architectural decisions,
- non-obvious invariants,
- concurrency constraints,
- protocol assumptions,
- performance-sensitive behavior,
- compatibility hacks.

Delete stale comments.

---

## 15. Testing

Tests should protect behavior, not implementation details.

Prioritize:

1. domain logic,
2. edge cases,
3. failure paths,
4. integration boundaries,
5. regressions.

Prefer:

```text
many fast unit tests
some integration tests
few end-to-end tests
```

Avoid excessive mocking.

Mock boundaries, not internal implementation details.

A bug fix should normally include a regression test.

New behavior should include tests unless testing is impractical; if so, state why.

---

## 16. Refactoring Rules

Before adding new code:

1. inspect existing abstractions,
2. search for similar behavior,
3. reuse appropriate components,
4. avoid duplicate implementations.

When modifying existing code:

- preserve public behavior unless change is intentional,
- keep the patch focused,
- avoid unrelated cleanup,
- simplify touched code when safe.

Do not rewrite working subsystems merely because a different style is preferred.

Large refactors should be incremental.

---

## 17. Performance

Correctness and clarity come first unless performance is a stated requirement.

Do not optimize based on intuition alone.

For performance-sensitive changes:

1. identify the bottleneck,
2. measure baseline,
3. change one meaningful factor,
4. benchmark,
5. verify correctness,
6. document important tradeoffs.

Avoid unnecessary:

- copies,
- serialization,
- allocations,
- network round trips,
- database queries,
- synchronization,
- blocking calls.

---

## 18. Security

Never hardcode:

- API keys,
- passwords,
- tokens,
- credentials,
- private endpoints.

Validate untrusted input at boundaries.

Use parameterized database queries.

Do not log secrets or sensitive payloads.

Treat shell commands, filesystem paths, URLs, deserialization, and dynamic code execution as security-sensitive boundaries.

Prefer least privilege.

---

## 19. Compatibility

Do not break public APIs casually.

Before changing:

- public function signatures,
- configuration keys,
- serialized schemas,
- database schemas,
- CLI options,
- network protocols,

identify downstream consumers.

When breaking changes are necessary, provide migration guidance where appropriate.

---

## 20. Repository Structure

Prefer structures organized around ownership and domain.

Example:

```text
src/
├── api/
│   ├── routes/
│   └── schemas/
├── application/
│   ├── commands/
│   └── services/
├── domain/
│   ├── models/
│   ├── policies/
│   └── ports/
├── infrastructure/
│   ├── database/
│   ├── external/
│   └── repositories/
└── config/
```

This is a guideline, not a mandatory template.

Do not reorganize a mature repository merely to match this structure.

Follow the existing architecture when it is coherent.

---

## 21. Agent Workflow

Before writing code:

1. Understand the requested behavior.
2. Inspect relevant existing code.
3. Identify the correct layer/module.
4. Search for reusable abstractions.
5. Determine affected interfaces and tests.
6. Choose the smallest coherent change.

While writing code:

1. preserve dependency direction,
2. keep APIs minimal,
3. isolate side effects,
4. avoid unnecessary abstraction,
5. keep naming explicit,
6. add or update tests.

After writing code:

1. run relevant tests,
2. run formatter/linter/type checker if configured,
3. inspect the diff,
4. remove dead code,
5. remove debugging output,
6. verify no unrelated files changed,
7. reconsider whether the solution can be simpler.

---

## 22. Mandatory Self-Review

Before considering a task complete, check:

### Correctness

- [ ] Does the implementation satisfy the requested behavior?
- [ ] Are important edge cases handled?
- [ ] Are errors handled intentionally?

### Simplicity

- [ ] Is there a simpler implementation?
- [ ] Did I introduce an abstraction without a real need?
- [ ] Is any code duplicated unnecessarily?

### Architecture

- [ ] Is this code in the correct layer?
- [ ] Are module responsibilities clear?
- [ ] Are dependencies directional?
- [ ] Did infrastructure leak into domain logic?
- [ ] Did I introduce a circular dependency?

### Extensibility

- [ ] Can likely variants be added without rewriting unrelated code?
- [ ] Are extension points based on real variation?
- [ ] Are contracts minimal?

### Readability

- [ ] Are names precise?
- [ ] Are functions cohesive?
- [ ] Is control flow easy to follow?
- [ ] Are comments limited to useful context?

### Testing

- [ ] Are important behaviors tested?
- [ ] Is there a regression test for fixed bugs?
- [ ] Are tests coupled to behavior rather than implementation?

### Hygiene

- [ ] No dead code.
- [ ] No unnecessary dependencies.
- [ ] No debug prints.
- [ ] No secrets.
- [ ] No unrelated refactors.
- [ ] Formatting and lint checks pass.

---

## 23. Anti-Patterns

Avoid unless strongly justified:

```text
God classes
deep inheritance trees
global mutable state
circular dependencies
business logic in controllers
business logic in ORM models
generic "utils" dumping grounds
copy-paste implementations
premature plugin systems
premature microservices
premature optimization
boolean-flag APIs
silent exception handling
hidden side effects
unbounded concurrency
unnecessary wrappers
single-use abstractions
```

---

## 24. Decision Priority

When requirements conflict, use this priority:

```text
1. Correctness
2. Simplicity
3. Readability
4. Maintainability
5. Testability
6. Extensibility
7. Performance
8. Cleverness
```

Security and explicit user requirements override this ordering where applicable.

---

## 25. Final Principle

Do not optimize for the maximum amount of architecture.

Optimize for:

> the minimum architecture that keeps the system clear, decoupled, testable, and easy to extend.

Every abstraction must earn its existence.
Every dependency must have a reason.
Every module must have a clear responsibility.
Every line of code should make the system easier—not harder—to understand.
