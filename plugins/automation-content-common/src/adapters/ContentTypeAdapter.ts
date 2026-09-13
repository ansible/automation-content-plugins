import type {
  ContentObject,
  ContentRelation,
  Enumeration,
} from '@ansible/content-model';
import type { BackendCapabilities, MetadataBundle, ResolvedArtifact } from '../oci/types';
import type { BackendAdapter } from './BackendAdapter';

/** Confidence that an artifact is of a given content type. */
export type Confidence = 'certain' | 'likely' | 'no';

export interface EnumerationContext {
  /** What the backend can do — gates which ladder rungs are reachable. */
  capabilities: BackendCapabilities;
  /** Fetch additional metadata on demand, so adapters need not over-fetch up front. */
  backend: BackendAdapter;
  /**
   * Digest-keyed cache. Config blobs and manifests are immutable by digest, so a hit
   * is permanently valid — this is what turns a per-sync cost into a per-version cost.
   */
  cache?: {
    get<T>(key: string): Promise<T | undefined>;
    set<T>(key: string, value: T): Promise<void>;
  };
  /** Highest ladder rung permitted by configuration. */
  maxLadderLevel?: number;
}

/** How sync decides whether a known artifact needs re-reading. */
export interface UpdatePolicy {
  readonly kind: 'digest-compare' | 'semver' | 'requirements-match' | 'always';
  shouldUpdate(previous: ContentObject | undefined, current: ResolvedArtifact): boolean;
}

/** Content-type-specific governance rules, evaluated by the common governance engine. */
export interface PolicyAdapter {
  /** Rules this content type contributes, e.g. "EE images must be signed". */
  readonly rules: Array<{ id: string; description: string }>;
  evaluate(
    object: ContentObject,
  ): Promise<Array<{ ruleId: string; result: 'pass' | 'fail' | 'waived' }>>;
}

/** Integrity verification — signatures for OCI artifacts, checksums for tarballs. */
export interface IntegrityStrategy {
  readonly kind: 'oci-signature' | 'checksum' | 'none';
  verify(
    ref: ResolvedArtifact,
    meta: MetadataBundle,
  ): Promise<{ verified: boolean; detail?: string }>;
}

/**
 * The semantics axis.
 *
 * A content-type adapter knows what one kind of content *is* — how to recognise it,
 * parse it, enumerate its contents, version it, and relate it to other content. It
 * knows nothing about where it came from: it receives a `BackendAdapter` and uses only
 * that interface. An implementation that branches on `backend.id === 'oci'` has
 * collapsed the two axes into one and defeated the design.
 *
 * The four members named by the extensibility requirement — storage/retrieval, sync
 * update policy, governance rules, metadata schema — appear here as `normalize`,
 * `updatePolicy`, `governanceRules` and `schema` respectively. Adding a content type
 * means implementing this interface and registering it. Nothing in the core changes.
 */
export interface ContentTypeAdapter<T extends ContentObject = ContentObject> {
  /** 'execution-environment' | 'collection' | 'skill' | … */
  readonly type: string;

  /** Metadata schema for this content type. */
  readonly schema: { $id: string; version: string };

  /** Media types or artifact types this adapter claims. */
  readonly mediaTypes: string[];

  /** Does this artifact belong to me? */
  identify(ref: ResolvedArtifact, meta: MetadataBundle): Confidence;

  /** Produce the universal object. The only place a ContentObject is constructed. */
  normalize(ref: ResolvedArtifact, meta: MetadataBundle): Promise<T>;

  /**
   * Determine contents — Level B items inside the artifact.
   *
   * Must return an `unknown` enumeration rather than throwing or fabricating when the
   * contents cannot be established. "Contains nothing" and "contents undetermined" are
   * different facts and users need to be able to tell them apart.
   */
  enumerate(ref: ResolvedArtifact, ctx: EnumerationContext): Promise<Enumeration>;

  /** Relationships to other artifacts: collection ↔ EE ↔ skill. */
  relate?(object: T): Promise<ContentRelation[]>;

  readonly updatePolicy: UpdatePolicy;
  readonly governanceRules?: PolicyAdapter;
  readonly integrity?: IntegrityStrategy;
}

/**
 * Resolves which content-type adapter handles an artifact.
 *
 * Registration is the entire mechanism for adding a content type — the reason the
 * extensibility requirement can be met without touching the framework.
 */
export class ContentTypeRegistry {
  private readonly adapters = new Map<string, ContentTypeAdapter>();

  register(adapter: ContentTypeAdapter): this {
    if (this.adapters.has(adapter.type)) {
      throw new Error(`content type already registered: ${adapter.type}`);
    }
    this.adapters.set(adapter.type, adapter);
    return this;
  }

  get(type: string): ContentTypeAdapter | undefined {
    return this.adapters.get(type);
  }

  list(): ContentTypeAdapter[] {
    return [...this.adapters.values()];
  }

  /** Pick the best adapter for an artifact, preferring certainty over likelihood. */
  resolve(
    ref: ResolvedArtifact,
    meta: MetadataBundle,
  ): ContentTypeAdapter | undefined {
    let likely: ContentTypeAdapter | undefined;
    for (const adapter of this.adapters.values()) {
      const confidence = adapter.identify(ref, meta);
      if (confidence === 'certain') return adapter;
      if (confidence === 'likely' && !likely) likely = adapter;
    }
    return likely;
  }
}
