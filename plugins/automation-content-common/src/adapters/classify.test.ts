import { CONTENT_MANIFEST_ARTIFACT_TYPE } from '@ansible/content-model';
import {
  CONTENT_MANIFEST_LABEL,
  EE_LABEL,
  UNKNOWN_IMAGE_TYPE,
  classifyImage,
} from './classify';

describe('classifyImage', () => {
  it('recognises an execution environment by the label ansible-builder always emits', () => {
    // The signal that matters most in practice: present on every EE ansible-builder
    // has ever produced, including images built long before content manifests existed.
    const result = classifyImage({ labels: { [EE_LABEL]: 'true' } });

    expect(result.type).toBe('execution-environment');
    expect(result.confidence).toBe('certain');
    expect(result.signals.join()).toContain(EE_LABEL);
  });

  it('recognises one by a content-manifest referrer', () => {
    const result = classifyImage({
      referrers: [
        {
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          digest: 'sha256:abc',
          size: 1,
          artifactType: CONTENT_MANIFEST_ARTIFACT_TYPE,
        },
      ],
    });

    expect(result.type).toBe('execution-environment');
    expect(result.signals.join()).toContain('referrer');
  });

  it('recognises one by our own manifest label', () => {
    const result = classifyImage({ labels: { [CONTENT_MANIFEST_LABEL]: 'true' } });
    expect(result.type).toBe('execution-environment');
  });

  it('reads labels out of the config blob when not passed directly', () => {
    const result = classifyImage({
      config: { config: { Labels: { [EE_LABEL]: 'true' } } },
    });
    expect(result.type).toBe('execution-environment');
  });

  it('records every signal that fired', () => {
    const result = classifyImage({
      labels: { [EE_LABEL]: 'true', [CONTENT_MANIFEST_LABEL]: 'true' },
      referrers: [
        {
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          digest: 'sha256:abc',
          size: 1,
          artifactType: CONTENT_MANIFEST_ARTIFACT_TYPE,
        },
      ],
    });
    expect(result.signals).toHaveLength(3);
  });

  /**
   * The case that produced a phantom execution environment before classification
   * existed: a plain OCI artifact sitting in the same repository as a real EE.
   */
  it('does not mistake an unrelated image for an execution environment', () => {
    const result = classifyImage({ labels: { 'org.opencontainers.image.vendor': 'X' } });

    expect(result.type).toBe(UNKNOWN_IMAGE_TYPE);
    expect(result.confidence).toBe('no');
    expect(result.signals.join()).toMatch(/not recognised/i);
  });

  it('says why an image was not recognised, rather than failing silently', () => {
    const result = classifyImage({});
    expect(result.signals.join()).toContain(EE_LABEL);
  });

  it('ignores a label set to something other than true', () => {
    expect(classifyImage({ labels: { [EE_LABEL]: 'false' } }).type).toBe(
      UNKNOWN_IMAGE_TYPE,
    );
  });

  it('ignores referrers of an unrelated artifact type', () => {
    const result = classifyImage({
      referrers: [
        {
          mediaType: 'application/vnd.oci.image.manifest.v1+json',
          digest: 'sha256:abc',
          size: 1,
          artifactType: 'application/vnd.dev.cosign.simplesigning.v1+json',
        },
      ],
    });
    expect(result.type).toBe(UNKNOWN_IMAGE_TYPE);
  });
});
