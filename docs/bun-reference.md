# Bun API Reference for RawAGI Tool Development

This reference covers Bun APIs relevant to improving RawAGI's tools.
When suggesting improvements, use ONLY these APIs — they are confirmed to exist.

---

## File I/O — Bun.file() and Bun.write()

```ts
// READ a file (lazy-loaded, doesn't read until you call .text() etc)
const file = Bun.file("path.txt");
await file.exists();           // boolean
await file.text();             // string
await file.json();             // parsed JSON
await file.arrayBuffer();      // ArrayBuffer
await file.bytes();            // Uint8Array
file.size;                     // number (bytes)
file.type;                     // MIME type string

// WRITE a file (creates or overwrites)
await Bun.write("path.txt", "content");      // string
await Bun.write("path.txt", uint8array);     // binary
await Bun.write("output.txt", Bun.file("input.txt")); // copy file

// DELETE a file
await Bun.file("path.txt").delete();

// INCREMENTAL WRITING (streaming writes)
const writer = Bun.file("log.txt").writer();
writer.write("line 1\n");
writer.write("line 2\n");
writer.flush();  // flush buffer to disk
writer.end();    // flush + close
```

### Directories (use node:fs)
```ts
import { readdir, mkdir } from "node:fs/promises";
const files = await readdir("./dir");                    // list files
const all = await readdir("./", { recursive: true });    // recursive
await mkdir("path/to/dir", { recursive: true });         // create dir
```

---

## SQLite — bun:sqlite

```ts
import { Database } from "bun:sqlite";

const db = new Database("mydb.sqlite");        // file-based
const db = new Database(":memory:");           // in-memory
const db = new Database("mydb.sqlite", { readonly: true });

// Enable WAL mode (recommended for performance)
db.run("PRAGMA journal_mode = WAL;");

// Prepared statements (cached automatically)
const stmt = db.query("SELECT * FROM users WHERE id = ?");
stmt.get(1);                  // first row as object, or null
stmt.all("search");           // all rows as array of objects
stmt.run();                   // execute, returns { lastInsertRowid, changes }
stmt.values();                // all rows as array of arrays

// Iterate large results without loading all into memory
for (const row of db.query("SELECT * FROM big_table").iterate()) {
  console.log(row);
}

// Direct execution
db.run("INSERT INTO foo (bar) VALUES (?)", ["value"]);
// Returns: { lastInsertRowid: number, changes: number }

// Transactions (atomic batch operations)
const insertMany = db.transaction((items) => {
  const stmt = db.prepare("INSERT INTO items (name) VALUES (?)");
  for (const item of items) stmt.run(item);
});
insertMany(["a", "b", "c"]); // all succeed or all rollback

// Serialize/deserialize entire database
const bytes = db.serialize();              // Uint8Array
const restored = Database.deserialize(bytes);

// Close
db.close();
```

### Type mappings
| JavaScript | SQLite |
|------------|--------|
| string     | TEXT   |
| number     | INTEGER/DECIMAL |
| boolean    | INTEGER (0/1) |
| Uint8Array | BLOB |
| bigint     | INTEGER |
| null       | NULL |

---

## Fetch API

```ts
// Basic GET
const res = await fetch("https://example.com");
const text = await res.text();
const json = await res.json();
const bytes = await res.bytes();

// POST with JSON
const res = await fetch("https://api.example.com", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ key: "value" }),
});

// Timeout
const res = await fetch("https://example.com", {
  signal: AbortSignal.timeout(5000),  // 5 second timeout
});

// Streaming response
for await (const chunk of response.body) {
  console.log(chunk);
}

// Write response directly to file
await Bun.write("page.html", await fetch("https://example.com"));

// Debug mode
const res = await fetch(url, { verbose: true }); // prints headers to terminal
```

---

## Shell — Bun.$

```ts
import { $ } from "bun";

// Run commands
await $`echo "Hello"`;                        // prints to stdout
const result = await $`echo "Hello"`.text();   // capture as string
const data = await $`cat data.json`.json();    // capture as JSON

// Line-by-line reading
for await (const line of $`cat file.txt`.lines()) {
  console.log(line);
}

// Error handling
try {
  await $`failing-command`;
} catch (err) {
  console.log(err.exitCode);
  console.log(err.stderr.toString());
}

// Non-throwing mode
const { stdout, exitCode } = await $`maybe-fail`.nothrow().quiet();

// Interpolation is auto-escaped (safe from injection)
const userInput = "file.txt; rm -rf /";
await $`ls ${userInput}`;  // treats as single string, safe

// Redirect output
await $`echo "data" > output.txt`;
await $`command 2> errors.txt`;

// Pipe
const count = await $`cat file.txt | wc -l`.text();

// Working directory
await $`pwd`.cwd("/tmp");

// Environment variables
await $`echo $FOO`.env({ ...process.env, FOO: "bar" });
```

---

## Current RawAGI Tools (for reference)

1. **think** — internal reasoning scratchpad
2. **web_search** — Tavily API search
3. **fetch_url** — fetch and strip HTML from URLs
4. **read_file** — read local file via Bun.file().text()
5. **write_file** — write file via Bun.write()
6. **append_file** — append to file (read + write)
7. **calculator** — eval math expressions
8. **save_memory** — append to memory.md
9. **save_research** — save to SQLite research.db
10. **get_research** — retrieve full research entry by ID
11. **search_history** — search research.db by keyword

---

## Possible Improvements (using confirmed Bun APIs)

- **append_file**: Currently reads entire file then rewrites. Could use `Bun.file().writer()` for efficient appending.
- **fetch_url**: Could add `AbortSignal.timeout()` to prevent hanging on slow URLs.
- **read_file**: Could add file existence check with `Bun.file().exists()` for better error messages.
- **save_research**: Could use `db.transaction()` for batch saves.
- **New tool: run_shell**: Could use `Bun.$` to run shell commands (ls, grep, find) for codebase exploration.
- **New tool: list_files**: Could use `readdir()` to list directory contents.
- **db.ts**: Could use `db.query().iterate()` for large result sets instead of `.all()`.
- **db.ts**: Could add WAL mode (`PRAGMA journal_mode = WAL`) for better concurrent performance.
