import { unknownEnumeration } from '@ansible/content-model';
import type { ContentObject, Enumeration } from '@ansible/content-model';
import type {
  Classification,
  ContentTypeAdapter,
  EnumerationContext,
  MetadataBundle,
  ResolvedArtifact,
  UpdatePolicy,
} from '@ansible/automation-content-common';

export const HELM_CHART_TYPE = 'helm-chart';

/**
 * Helm's config media type, as written by `helm push`.
 *
 * Notable for being one of the four types a stock Quay accepts on its config allowlist
 * — alongside the OCI and Docker image configs — which is why a Helm chart is a content
 * type this stack can actually meet in a customer's registry rather than a hypothetical
 * one.
 */
export const HELM_CONFIG_MEDIA_TYPE = 'application/vnd.cncf.helm.config.v1+json';

const SCHEMA_VERSION = '1.0.0';

const digestCompare: UpdatePolicy = {
  kind: 'digest-compare',
  shouldUpdate(previous, current) {
    return previous?.identity.digest !== current.digest;
  },
};

/**
 * The Helm chart content type.
 *
 * Deliberately minimal. It exists to answer one question — does adding a content type
 * require changing the framework? — and it answers it by being a package you add rather
 * than a file you edit. A richer implementation would enumerate the chart's templates
 * and values; none of that would change anything outside this package, which is the
 * whole claim.
 *
 * Note what is absent: no HTTP, no registry vendor, no mention of OCI beyond the media
 * type a Helm chart declares about itself. Identification reads metadata that discovery
 * already fetched.
 */
export class HelmChartAdapter implements ContentTypeAdapter {
  readonly type = HELM_CHART_TYPE;

  readonly schema = {
    $id: 'https://helm.sh/schemas/chart',
    version: SCHEMA_VERSION,
  };

  readonly mediaTypes = [HELM_CONFIG_MEDIA_TYPE];

  readonly updatePolicy = digestCompare;

  identify(ref: ResolvedArtifact, meta: MetadataBundle): Classification {
    const configType = (meta.manifest as { config?: { mediaType?: string } }).config
      ?.mediaType;

    if (configType === HELM_CONFIG_MEDIA_TYPE) {
      return {
        confidence: 'certain',
        signals: [`config mediaType ${HELM_CONFIG_MEDIA_TYPE}`],
      };
    }
    if (ref.mediaType === HELM_CONFIG_MEDIA_TYPE) {
      return { confidence: 'likely', signals: ['artifact mediaType is a Helm config'] };
    }
    return {
      confidence: 'no',
      signals: [`config mediaType is ${configType ?? 'absent'}, not a Helm chart`],
    };
  }

  async normalize(ref: ResolvedArtifact): Promise<ContentObject> {
    const slash = ref.repository.indexOf('/');
    return {
      identity: {
        type: this.type,
        namespace: slash > 0 ? ref.repository.slice(0, slash) : '',
        name: slash > 0 ? ref.repository.slice(slash + 1) : ref.repository,
        digest: ref.digest,
      },
      version: {
        value: ref.digest,
        scheme: 'oci-tag',
        tags: ref.reference && ref.reference !== ref.digest ? [ref.reference] : undefined,
      },
      source: {
        uri: `${ref.registry}/${ref.repository}@${ref.digest}`,
        backendId: 'oci',
        discoveredAt: new Date().toISOString(),
      },
      lifecycle: { state: 'discovered', visibility: 'internal' },
      trust: {
        certificationTier: 'community',
        provenance: { steps: [], complete: false },
        signing: { signed: false, verified: false },
        supportBoundary: { supported: false },
      },
      relationships: [],
      enumeration: unknownEnumeration(SCHEMA_VERSION, 'chart contents are not enumerated'),
    };
  }

  /**
   * Charts are not enumerated, and that is reported honestly rather than as an empty
   * chart. `unknown` is a first-class state: a consumer must be able to tell "this
   * contains nothing" from "nobody looked".
   */
  async enumerate(_ref: ResolvedArtifact, _ctx: EnumerationContext): Promise<Enumeration> {
    return unknownEnumeration(
      SCHEMA_VERSION,
      'Helm chart contents are not enumerated by this adapter',
    );
  }
}
