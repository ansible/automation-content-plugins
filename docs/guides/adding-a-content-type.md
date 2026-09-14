# Adding a content type

A content type is a package you add, not a file you edit. There is exactly one place in
the codebase that names one.

## The four steps

**1. Create the package.** Copy `plugins/content-type-helm-chart`, which is deliberately
minimal, and implement `ContentTypeAdapter`:

```ts
export class MyAdapter implements ContentTypeAdapter {
  readonly type = 'my-type';
  readonly schema = { $id: '...', version: '1.0.0' };
  readonly mediaTypes = ['application/vnd.example.v1+json'];
  readonly updatePolicy = digestCompare;

  identify(ref, meta): Classification { ... }   // is this mine, and on what evidence?
  async normalize(ref, meta): Promise<ContentObject> { ... }
  async enumerate(ref, ctx): Promise<Enumeration> { ... }
}
```

Two rules the interface cannot enforce for you:

- **`identify` must answer from metadata discovery already fetched.** An adapter that
  needs its own round trips makes classification cost scale with the number of registered
  types.
- **`enumerate` returns `unknown`, never empty, when it cannot determine contents.**
  "Contains nothing" and "nobody looked" are different facts.

**2. Register it** in `plugins/catalog-backend-module-automation-content/src/contentTypes.ts`:

```ts
export function defaultContentTypes(): ContentTypeRegistry {
  return new ContentTypeRegistry()
    .register(new ExecutionEnvironmentAdapter())
    .register(new HelmChartAdapter())
    .register(new MyAdapter());          // ← the only line that changes
}
```

**3. Embed it for packaging.** Add it to the `--embed-package` list in the
`export-dynamic` script of **both** `automation-content-backend` and
`catalog-backend-module-automation-content`. Workspace packages are never published, so
a package that is not embedded is simply missing at runtime in the portal.

**4. `yarn install`.** A new workspace has to reach `yarn.lock` before anything can
build it.

## Nothing else changes

Not the OCI client, the entity provider, the content index, the API, or the UI.

`contentTypes.test.ts` holds that claim to account rather than asserting it: the test
defines a third content type inside the test file and follows it through discovery to a
catalog entity. The only difference from the test above it is one `register()` call. If
any part of the framework needed to learn about the new type, that test would not
compile.

## If a step is missed

Each failure lands somewhere that does not obviously point back at the cause:

| Missing | Symptom |
|---|---|
| `yarn install` | `Package ... not found in the project`, from a step that looks unrelated |
| `--embed-package` | export tries to fetch your package from npm and 404s |
| `yarn tsc` | `No declaration files found at ../../dist-types/...` |

See [ADR-001](../../.sdlc/adrs/001-two-axis-adapter-model.md) for the model this rests on.
