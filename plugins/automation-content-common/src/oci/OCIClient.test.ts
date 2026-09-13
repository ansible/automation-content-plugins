import { OCIClient, nextLink } from './OCIClient';
import { ImageManifest, MediaTypes, RegistryConnection } from './types';
import { MockRegistry, makeImage, makeLabelledImage } from '../testing/MockRegistry';

const HOST = 'https://mock.registry';

function connection(overrides: Partial<RegistryConnection> = {}): RegistryConnection {
  return {
    name: 'mock',
    url: HOST,
    auth: { type: 'anonymous' },
    ...overrides,
  };
}

function clientFor(registry: MockRegistry, conn = connection()): OCIClient {
  return new OCIClient(conn, { fetch: registry.fetch });
}

describe('nextLink', () => {
  it('extracts a rel="next" target', () => {
    expect(nextLink('</v2/x/tags/list?n=2&last=b>; rel="next"')).toBe(
      '/v2/x/tags/list?n=2&last=b',
    );
  });

  it('tolerates an unquoted rel and multiple links', () => {
    expect(nextLink('</a>; rel=prev, </b>; rel=next')).toBe('/b');
  });

  it('returns undefined when absent', () => {
    expect(nextLink(null)).toBeUndefined();
    expect(nextLink('</a>; rel="prev"')).toBeUndefined();
  });
});

describe('OCIClient.parseChallenge', () => {
  it('parses a bearer challenge', () => {
    const challenge = OCIClient.parseChallenge(
      'Bearer realm="https://auth.docker.io/token",service="registry.docker.io",scope="repository:library/nginx:pull"',
    );
    expect(challenge).toEqual({
      realm: 'https://auth.docker.io/token',
      service: 'registry.docker.io',
      scope: 'repository:library/nginx:pull',
    });
  });

  it('ignores non-bearer schemes', () => {
    expect(OCIClient.parseChallenge('Basic realm="x"')).toBeUndefined();
  });
});

describe('authentication', () => {
  it('completes the 401 → token → retry flow and caches the token', async () => {
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [makeImage({ tag: 'latest' })] },
      auth: 'bearer-challenge',
      catalogEnabled: true,
    });
    const client = clientFor(registry);

    const first = await client.getManifest('ansible/ee', 'latest');
    expect(first.digest).toBeTruthy();
    expect(registry.tokensIssued).toBe(1);

    // Second call must reuse the cached token rather than re-challenging.
    await client.getManifest('ansible/ee', 'latest');
    expect(registry.tokensIssued).toBe(1);
  });

  it('sends basic credentials when configured', async () => {
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [makeImage({ tag: 'latest' })] },
      auth: 'basic-required',
    });
    const client = clientFor(
      registry,
      connection({ auth: { type: 'basic', username: 'u', password: 'p' } }),
    );

    const artifact = await client.getManifest('ansible/ee', 'latest');
    expect(artifact.repository).toBe('ansible/ee');
  });
});

describe('listRepositories', () => {
  it('enumerates when _catalog is available', async () => {
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [], 'ansible/other': [] },
      catalogEnabled: true,
    });
    const found: string[] = [];
    for await (const repo of clientFor(registry).listRepositories()) found.push(repo);
    expect(found).toEqual(['ansible/ee', 'ansible/other']);
  });

  it('yields nothing when _catalog is disabled, rather than throwing', async () => {
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [] },
      catalogEnabled: false,
    });
    const found: string[] = [];
    for await (const repo of clientFor(registry).listRepositories()) found.push(repo);
    expect(found).toEqual([]);
  });
});

describe('listTags', () => {
  it('follows Link-header pagination', async () => {
    const images = ['a', 'b', 'c'].map(tag => makeImage({ tag }));
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': images },
      paginate: true,
    });

    const found: string[] = [];
    for await (const tag of clientFor(registry).listTags('ansible/ee', 2)) {
      found.push(tag);
    }
    expect(found).toEqual(['a', 'b', 'c']);
  });

  it('returns an empty list for an unknown repository', async () => {
    const registry = new MockRegistry({ repositories: {} });
    const found: string[] = [];
    for await (const tag of clientFor(registry).listTags('nope')) found.push(tag);
    expect(found).toEqual([]);
  });
});

describe('manifests', () => {
  it('resolves a tag to an immutable digest via HEAD', async () => {
    const image = makeImage({ tag: 'latest' });
    const registry = new MockRegistry({ repositories: { 'ansible/ee': [image] } });

    const head = await clientFor(registry).headManifest('ansible/ee', 'latest');
    expect(head.status).toBe(200);
    expect(head.digest).toBe(image.digest);
  });

  it('falls back to the reference when the digest header is omitted', async () => {
    const image = makeImage({ tag: 'latest' });
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      omitDigestHeader: true,
    });

    const byDigest = await clientFor(registry).getManifest('ansible/ee', image.digest);
    expect(byDigest.digest).toBe(image.digest);
  });

  it('throws a RegistryError carrying the status', async () => {
    const registry = new MockRegistry({ repositories: {} });
    await expect(
      clientFor(registry).getManifest('ansible/ee', 'latest'),
    ).rejects.toMatchObject({ name: 'RegistryError', status: 404 });
  });
});

describe('config blobs', () => {
  it('reads OCI labels from the config blob', async () => {
    const image = makeLabelledImage('latest', {
      'com.redhat.component': 'ee-minimal',
      'io.ansible.collections': 'community.general,ansible.posix',
    });
    const registry = new MockRegistry({ repositories: { 'ansible/ee': [image] } });
    const client = clientFor(registry);

    const artifact = await client.getManifest('ansible/ee', 'latest');
    const config = await client.getConfigBlob(
      'ansible/ee',
      (artifact.manifest as ImageManifest).config,
    );

    expect(config?.config?.Labels?.['io.ansible.collections']).toBe(
      'community.general,ansible.posix',
    );
  });

  it('returns undefined rather than throwing when the blob is unavailable', async () => {
    const image = makeLabelledImage('latest', { a: 'b' });
    const configDigest = (image.manifest as { config: { digest: string } }).config.digest;
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      failConfigBlobs: [configDigest],
    });
    const client = clientFor(registry);

    const artifact = await client.getManifest('ansible/ee', 'latest');
    const config = await client.getConfigBlob(
      'ansible/ee',
      (artifact.manifest as ImageManifest).config,
    );
    expect(config).toBeUndefined();
  });

  it('costs exactly one extra request per manifest — the fetch-side enumeration cost', async () => {
    const image = makeLabelledImage('latest', { a: 'b' });
    const registry = new MockRegistry({ repositories: { 'ansible/ee': [image] } });
    const client = clientFor(registry);

    registry.reset();
    const artifact = await client.getManifest('ansible/ee', 'latest');
    await client.getConfigBlob(
      'ansible/ee',
      (artifact.manifest as ImageManifest).config,
    );

    expect(registry.countRequests('/manifests/')).toBe(1);
    expect(registry.countRequests('/blobs/')).toBe(1);
  });
});

describe('referrers', () => {
  const referrerDigest = `sha256:${'ref'.padEnd(64, '0')}`;
  const payloadDigest = `sha256:${'pay'.padEnd(64, '0')}`;

  function imageWithReferrer() {
    const base = makeImage({ tag: 'latest' });
    return {
      ...base,
      referrers: [
        {
          mediaType: MediaTypes.ociManifest,
          digest: referrerDigest,
          size: 200,
          artifactType: 'application/vnd.ansible.content-manifest.v1+json',
        },
      ],
      referrerPayloads: {
        [payloadDigest]: { collections: [{ name: 'community.general', version: '8.0.0' }] },
      },
    };
  }

  it('uses the native referrers endpoint when available', async () => {
    const image = imageWithReferrer();
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      referrersMode: 'native',
    });

    const result = await clientFor(registry).getReferrers('ansible/ee', image.digest);
    expect(result.via).toBe('native');
    expect(result.referrers).toHaveLength(1);
  });

  it('falls back to the sha256- tag schema when the endpoint is absent', async () => {
    const image = imageWithReferrer();
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      referrersMode: 'tag-fallback',
    });

    const result = await clientFor(registry).getReferrers('ansible/ee', image.digest);
    expect(result.via).toBe('tag-fallback');
    expect(result.referrers).toHaveLength(1);
  });

  it('reports none on a registry with no referrer support at all', async () => {
    const image = imageWithReferrer();
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      referrersMode: 'none',
    });

    const result = await clientFor(registry).getReferrers('ansible/ee', image.digest);
    expect(result.via).toBe('none');
    expect(result.referrers).toEqual([]);
  });

  it('reads a build-time content manifest payload', async () => {
    const image = imageWithReferrer();
    const registry = new MockRegistry({
      repositories: { 'ansible/ee': [image] },
      referrersMode: 'native',
    });
    const client = clientFor(registry);

    const { referrers } = await client.getReferrers('ansible/ee', image.digest);
    const payload = await client.getReferrerPayload('ansible/ee', referrers[0]);

    expect(payload).toEqual({
      collections: [{ name: 'community.general', version: '8.0.0' }],
    });
  });
});

describe('pullReference', () => {
  it('uses @ for digests and : for tags — Portal is never in the data path', () => {
    const client = clientFor(new MockRegistry({ repositories: {} }));
    expect(
      client.pullReference({ registry: 'mock', repository: 'ansible/ee', reference: 'latest' }),
    ).toBe('mock.registry/ansible/ee:latest');
    expect(
      client.pullReference({
        registry: 'mock',
        repository: 'ansible/ee',
        reference: 'sha256:abc',
      }),
    ).toBe('mock.registry/ansible/ee@sha256:abc');
  });
});
