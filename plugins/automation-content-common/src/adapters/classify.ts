import { CONTENT_MANIFEST_ARTIFACT_TYPE } from '@ansible/content-model';
import { Descriptor, ImageConfig } from '../oci/types';
import { Confidence } from './ContentTypeAdapter';

/**
 * The label `ansible-builder` puts on every execution environment it produces.
 *
 * Emitted unconditionally by its `_prepare_label_steps`, so it is present on EEs built
 * long before content manifests existed. That makes it the single most useful
 * classification signal in the field, and the reason no new convention is needed.
 */
export const EE_LABEL = 'ansible-execution-environment';

/** Labels this stack adds when a content manifest was generated at build time. */
export const CONTENT_MANIFEST_LABEL = 'io.ansible.content.manifest';

/** Content type used for an image we can see but cannot identify. */
export const UNKNOWN_IMAGE_TYPE = 'oci-image';

export interface ClassificationInput {
  labels?: Record<string, string>;
  referrers?: Descriptor[];
  config?: ImageConfig;
}

export interface Classification {
  type: string;
  confidence: Confidence;
  /** Which signals fired, so an operator can see why something was classified. */
  signals: string[];
}

/**
 * Decide whether an OCI image is an Ansible execution environment.
 *
 * Ordered by reliability, and every signal is read from data already fetched during
 * discovery — the labels live in the config blob that enumeration reads anyway — so
 * classification costs no extra requests.
 *
 * An image matching nothing is *not* dropped. It is reported as a plain OCI image with
 * unknown contents, because "an image we do not understand" and "no image" are
 * different facts, and silently hiding the former makes a registry look emptier than
 * it is.
 */
export function classifyImage(input: ClassificationInput): Classification {
  const labels = input.labels ?? input.config?.config?.Labels ?? {};
  const signals: string[] = [];

  if (
    input.referrers?.some(r => r.artifactType === CONTENT_MANIFEST_ARTIFACT_TYPE)
  ) {
    signals.push('content-manifest referrer');
  }
  if (labels[EE_LABEL] === 'true') {
    signals.push(`label ${EE_LABEL}=true`);
  }
  if (labels[CONTENT_MANIFEST_LABEL] === 'true') {
    signals.push(`label ${CONTENT_MANIFEST_LABEL}=true`);
  }

  if (signals.length > 0) {
    return { type: 'execution-environment', confidence: 'certain', signals };
  }

  return {
    type: UNKNOWN_IMAGE_TYPE,
    confidence: 'no',
    signals: [
      `no ${EE_LABEL} label, no content-manifest referrer — not recognised as an ` +
        'execution environment',
    ],
  };
}
