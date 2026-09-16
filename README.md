# automation-content-plugins

Ansible automation content management for Red Hat Developer Hub / Backstage — discovery,
governance, trust and lifecycle for execution environments, collections and future
content types, over any OCI-compliant registry.

## Where the code is

`main` is intentionally bare. The proof of concept lives on its own branch:

**[`ANSTRAT-1758-poc`](https://github.com/ansible/automation-content-plugins/tree/ANSTRAT-1758-poc)**

```bash
git clone -b ANSTRAT-1758-poc \
  https://github.com/ansible/automation-content-plugins.git
```

That branch holds the Backstage backend and frontend plugins, the OCI registry client
and content-type adapters, a self-contained local Quay setup, and a README that takes
you from a clone to content on screen in a handful of steps.

## Why the split

The proof of concept is exploratory: interfaces, config shape, API routes and entity
shape all still move without notice, and nothing on that branch is supported or ready to
depend on. Keeping it under its own name leaves `main` free for whatever the supported
implementation turns out to be, rather than growing it out of a history of experiments.

## License

Apache-2.0 — see [LICENSE](LICENSE).
