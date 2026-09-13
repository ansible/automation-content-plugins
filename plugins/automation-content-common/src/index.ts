/**
 * @ansible/automation-content-common
 *
 * Shared contracts and clients for Ansible automation content management.
 *
 * This package knows about storage protocols and adapter contracts. It knows nothing
 * about execution environments, collections, or any other specific content type — that
 * lives in content-type adapters. Keeping this boundary is what allows a new backend to
 * be added without touching content semantics, and vice versa.
 */

export * from './oci/types';
export { OCIClient, nextLink } from './oci/OCIClient';
export type { FetchLike, OCIClientOptions } from './oci/OCIClient';
export { CapabilityProbe, probeRegistry } from './oci/CapabilityProbe';
export type { ProbeOptions } from './oci/CapabilityProbe';

export type {
  BackendAdapter,
  ListScope,
  PageOpts,
  MetadataHint,
  ChangeEvent,
  Disposable,
} from './adapters/BackendAdapter';

export {
  ContentTypeRegistry,
} from './adapters/ContentTypeAdapter';
export type {
  ContentTypeAdapter,
  Confidence,
  EnumerationContext,
  UpdatePolicy,
  PolicyAdapter,
  IntegrityStrategy,
} from './adapters/ContentTypeAdapter';

export { NullSigningProvider } from './adapters/SigningProvider';
export type {
  SigningProvider,
  KeyRef,
  Signature,
  VerificationPolicy,
  VerificationResult,
  PortableSignature,
} from './adapters/SigningProvider';
