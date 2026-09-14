import type { MetadataBundle, ResolvedArtifact } from '@ansible/automation-content-common';
import { HELM_CONFIG_MEDIA_TYPE, HelmChartAdapter } from './HelmChartAdapter';

const adapter = new HelmChartAdapter();

const ref = (mediaType = 'application/vnd.oci.image.manifest.v1+json') =>
  ({
    registry: 'mock',
    repository: 'demo/redis',
    reference: '19.6.0',
    digest: 'sha256:' + 'cd'.repeat(32),
    mediaType,
    manifest: {},
  } as ResolvedArtifact);

const meta = (configMediaType?: string): MetadataBundle =>
  ({
    manifest: configMediaType ? { config: { mediaType: configMediaType } } : {},
    obtained: ['manifest'],
  } as MetadataBundle);

describe('identify', () => {
  it('recognises a Helm chart by its config media type', () => {
    const result = adapter.identify(ref(), meta(HELM_CONFIG_MEDIA_TYPE));
    expect(result.confidence).toBe('certain');
  });

  it('declines an execution environment', () => {
    // The two shipped types must not fight over the same artifact.
    const result = adapter.identify(ref(), meta('application/vnd.oci.image.config.v1+json'));
    expect(result.confidence).toBe('no');
  });

  it('says what it saw when it declines', () => {
    expect(adapter.identify(ref(), meta()).signals[0]).toContain('absent');
  });
});

describe('enumerate', () => {
  it('reports unknown rather than an empty chart', async () => {
    // A type that does not enumerate must say so. Returning an empty enumeration would
    // assert that the chart contains nothing, which is a different and false claim.
    const result = await adapter.enumerate(ref(), {} as any);
    expect(result.status).toBe('unknown');
    expect(result.diagnostics?.join(' ')).toContain('not enumerated');
  });
});

describe('normalize', () => {
  it('keys identity on the digest, never the tag', async () => {
    const object = await adapter.normalize(ref());
    expect(object.identity.digest).toBe(ref().digest);
    expect(object.version.value).toBe(ref().digest);
    // A tag is a mutable pointer, kept for display only.
    expect(object.version.tags).toEqual(['19.6.0']);
  });

  it('starts every trust field at its weakest honest value', async () => {
    const object = await adapter.normalize(ref());
    expect(object.trust.signing).toEqual({ signed: false, verified: false });
    expect(object.trust.supportBoundary.supported).toBe(false);
  });
});
