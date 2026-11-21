# How the Code Works (Walkthrough Study Guide)

Use this to prepare for the code walkthrough. The professor will grade three things: **routing**, **Supabase calls**, and the **error path**. Each has its own section below. Read the actual files alongside this guide.

## The big picture

A client sends an HTTP request. It flows through a chain of functions (middleware) and reaches a route handler. The handler validates the input, asks Supabase for data, and sends back JSON. If anything goes wrong, an error is thrown and the **error handler** at the end of the chain turns it into a JSON response.

```
request
  -> express.json()        (parses the JSON body into req.body)
  -> logger                (prints "GET /quests 200 12ms" when the response finishes)
  -> router for /quests    (matches method + path, runs the handler)
        -> validate input
        -> call Supabase
        -> res.status(...).json(...)
  -> notFoundHandler       (only reached if no route matched)
  -> errorHandler          (only reached when something called next(err) or threw)
```

## ES modules (why `import`, not `require`)

[package.json](package.json) has `"type": "module"`. That tells Node every `.js` file is an ES module, so `import`/`export` work and `require` does not. Two things follow from that:

- Imports of our own files include an extension, and it is `.js` even though the file is `.ts`, for example `import { getDb } from '../lib/supabase.js'`. TypeScript with `module: NodeNext` requires this, because it matches what the compiled output will be called.
- `export default app` in [src/index.ts](src/index.ts) is what Vercel looks for.

## File 1: [src/index.ts](src/index.ts) (the app)

- `const app = express()` creates the app.
- `app.use(express.json())` is middleware that reads the request body when the content type is JSON and puts the parsed object on `req.body`. If the JSON is broken it throws a `SyntaxError`, which our error handler catches.
- `app.use(logger)` registers our logger.
- `app.use('/quests', questsRouter)` mounts the quests router. A router's paths are relative to the mount point, so `router.get('/:id')` becomes `GET /quests/:id`.
- `app.use(notFoundHandler)` and `app.use(errorHandler)` are **last on purpose**. Express runs middleware in the order registered, so the catch-all for unmatched routes has to come after every real route.
- The bottom: `if (!process.env.VERCEL) app.listen(...)`. Locally we start a server on a port. On Vercel an environment variable named `VERCEL` is set, so we skip `listen` and just `export default app`; Vercel runs the app as a serverless function, one invocation per request.

## Section 1: Routing ([src/routes/quests.ts](src/routes/quests.ts))

| Method | Path           | What it does                       | Success | Possible errors   |
| ------ | -------------- | ---------------------------------- | ------- | ----------------- |
| GET    | `/quests`      | List, with filter/sort/limit       | 200     | 400, 500          |
| GET    | `/quests/:id`  | Get one                            | 200     | 400, 404, 500     |
| POST   | `/quests`      | Create                             | 201     | 400, 500          |
| PUT    | `/quests/:id`  | Replace whole quest                | 200     | 400, 404, 500     |
| PATCH  | `/quests/:id`  | Update some fields                 | 200     | 400, 404, 500     |
| DELETE | `/quests/:id`  | Delete                             | 200     | 400, 404, 500     |

Key ideas:

- **`:id` is a route parameter.** Express puts the value in `req.params.id`.
- **Query parameters** (`?status=open&sort=reward_gold`) arrive in `req.query`. In `GET /quests` we read `status`, `difficulty`, `sort`, `order`, and `limit`, validate each against an allowed list, and only then build the Supabase query. Validating first matters: bad input always yields a 400 instead of reaching the database.
- **PUT vs PATCH.** PUT replaces the whole resource: `title` is required and anything omitted resets to its default. PATCH changes only the fields sent (at least one required).
- **Status codes.** 201 for creation, 200 for everything else that succeeds, 400 when the client sent something wrong, 404 when the id is valid but no row exists, 500 for our own failures.
- **The `wrap` helper.** Our handlers are `async`. `wrap(fn)` returns a normal Express handler that calls `fn(req, res)` and does `.catch(next)`, so any thrown error or rejected promise is forwarded to the error handler instead of being lost.
- **`updateQuest`** is a small shared function because PUT and PATCH differ only in what they send.

## Section 2: Supabase calls ([src/lib/supabase.ts](src/lib/supabase.ts) and the routes)

**The client.** `createClient<Database>(url, key)` makes a connection object. The URL and **service key** come from `process.env`, never from code. The service key bypasses Row Level Security and has full access, so it lives only on the server (`.env` locally, Vercel environment variables in production, `.env` is in `.gitignore`). `getDb()` creates the client the first time it is called and reuses it. It is lazy so that a missing variable produces a readable JSON 500 rather than crashing on import.

**The query builder.** Each call chains methods and ends with `await`, which returns `{ data, error }`. Supabase does not throw; it hands you an `error` object, so every call checks it.

| Operation | Code | Notes |
| --- | --- | --- |
| List | `.from('quests').select('*').eq('status', s).order('reward_gold', {ascending:false}).limit(n)` | Filters are added only if the param was provided |
| Get one | `.select('*').eq('id', id).maybeSingle()` | `maybeSingle()` gives `data = null` when nothing matches, which we map to 404 |
| Create | `.insert(newQuest).select().single()` | `.select()` after insert returns the new row, including generated `id` and `created_at` |
| Update | `.update(changes).eq('id', id).select().maybeSingle()` | If no row matched, `data` is null so we return 404 |
| Delete | `.delete().eq('id', id).select().maybeSingle()` | Returns the deleted row so we can echo it back; null means 404 |

Always `.eq('id', id)` on update and delete. Without a filter, the operation would hit every row.

## Section 3: TypeScript and generated types ([src/types/database.types.ts](src/types/database.types.ts))

`supabase gen types typescript` reads your database schema and writes a `Database` type describing every table: `Row` (what you read), `Insert` (what you create; fields with defaults are optional), and `Update` (everything optional). We pass it to `createClient<Database>`, so `getDb().from('quests')` knows the columns, and a typo like `.eq('statuss', ...)` or inserting a number for `title` is a compile error. `TablesInsert<'quests'>` and `TablesUpdate<'quests'>` are helper types used in [src/lib/validate.ts](src/lib/validate.ts) so that validated bodies are typed exactly as Supabase expects.

If you change the table, re-run `npm run gen:types` (stale types lie to you).

## Validation ([src/lib/validate.ts](src/lib/validate.ts))

Request bodies are `unknown` until proven otherwise.

1. `isObject` rejects non-objects, arrays, and a missing body (when there is no JSON content type, `req.body` is undefined).
2. `checkFields` looks at each field *if present*, checks its type and allowed values, and pushes a message into an `errors` array rather than stopping at the first problem. That way the client sees all issues at once.
3. `rejectUnknown` rejects fields we do not recognize, so typos are not silently ignored.
4. If `errors` is non-empty, we throw `badRequest(errors.join('; '))`, which becomes a 400.
5. `parseQuestCreate` (POST and PUT) additionally requires `title`. `parseQuestPatch` requires at least one valid field.
6. `assertUuid` checks the id format before it reaches the database. Postgres would otherwise throw an error for a malformed UUID, which would surface as a confusing 500.

The returned object contains only trusted, cleaned fields (for example the title is trimmed), and that object is what gets sent to Supabase, never `req.body` directly.

## Section 4: The error path

**Throwing.** [src/lib/errors.ts](src/lib/errors.ts) defines `HttpError`, an `Error` subclass that also carries a `status`. Helpers `badRequest(msg)` and `notFound(msg)` build 400 and 404 versions. Anywhere in the code we `throw badRequest('...')`.

**Catching.** The `wrap` helper sends the thrown error to `next(err)`. Express skips all normal middleware and jumps to the next function with **four parameters** `(err, req, res, next)`. That is [src/middleware/errorHandler.ts](src/middleware/errorHandler.ts), the centralized error handler. It checks, in order:

1. **`SyntaxError` with a `body` property.** That is what `express.json()` throws on malformed JSON, so we answer 400 "Malformed JSON".
2. **`HttpError`.** It is an error we threw on purpose; reply with its `status` and `message`.
3. **Anything else.** An unexpected bug. We `console.error` the details for us (visible in Vercel logs) but reply with a generic `500 { error: 'Internal server error' }` so internals are not leaked.

Every response is JSON via `res.json`, so there is never an HTML stack trace.

**Unmatched routes.** `notFoundHandler` runs only if no route answered. It calls `next(notFound(...))`, which flows into the same error handler, so 404s also use the same JSON format.

**Database failures.** If Supabase returns an `error`, `dbError()` logs the real message and throws a 500 with a generic message.

### Tracing an example: `POST /quests` with body `{"reward_gold": -5}`

1. `express.json()` parses the body into `{ reward_gold: -5 }`.
2. The logger records the start time and waits for the response to finish.
3. Express matches `router.post('/')` and calls our wrapped handler.
4. `parseQuestCreate` collects errors: "title is required" and "reward_gold must be a non-negative integer", then throws `badRequest(...)`.
5. The async function rejects; `wrap` calls `.catch(next)`, handing the error to Express.
6. `errorHandler` sees an `HttpError` with status 400 and sends `{"error":"title is required; reward_gold must be a non-negative integer"}`.
7. The logger's `finish` listener prints `POST /quests 400 1ms`.
8. Supabase was never contacted.

## The logger ([src/middleware/logger.ts](src/middleware/logger.ts))

Middleware is a function `(req, res, next)`. We record `Date.now()`, register a `res.on('finish', ...)` listener that prints method, URL, status, and elapsed time once the response is sent, then call `next()` to continue the chain. Forgetting `next()` would make every request hang.

## Deployment on Vercel

- Vercel detects Express from `package.json` and finds the entry file `src/index.ts` (it must be named `app`, `index`, or `server`). It compiles TypeScript itself.
- Because the API runs as a serverless function, it is not a long-lived process. Nothing is kept in memory between requests (that is why all data is in Supabase). `express.static` is ignored.
- Environment variables (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`) are set in Project Settings and only apply to **new** deployments, so you must redeploy after adding them.

## Likely questions, with short answers

- **Why `type: module`?** So `import`/`export` work natively; mixing with `require` causes the classic ESM vs CommonJS errors.
- **Why is the service key safe here?** It is only read on the server from an environment variable, never sent to a client, never committed.
- **Why `maybeSingle()` instead of `single()`?** `single()` returns an error when zero rows match; `maybeSingle()` returns `null`, which lets us respond with a clean 404.
- **Why validate before querying?** Cheap to check, gives clear 400s, and keeps bad data out of the database.
- **What is the difference between 400 and 404?** 400: the request itself is wrong (bad JSON, bad field, malformed id). 404: the request is fine but the thing does not exist.
- **What does the four-argument signature do?** Express uses the argument count to identify error-handling middleware.
- **What happens if I forget the error handler?** Express's default handler would send an HTML stack trace.
- **Why is `notFoundHandler` last?** Middleware runs in order; if it were first it would answer every request.
- **What are generated types for?** Compile-time safety on column names and value types in every Supabase call.
- **PUT vs PATCH?** PUT replaces the entire resource, PATCH changes only supplied fields.
- **What would you add next?** Authentication, pagination with offset, a dedicated `/quests/:id/claim` endpoint, automated tests.
