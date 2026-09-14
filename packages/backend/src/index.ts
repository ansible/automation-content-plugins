/**
 * Minimal Backstage backend for the automation content PoC.
 *
 * Deliberately small: the catalog plus the OCI content provider, and nothing else. The
 * point is to show real Ansible content arriving in a real Backstage catalog from a
 * real registry, not to stand up a full portal.
 */
import { createBackend } from '@backstage/backend-defaults';

const backend = createBackend();

backend.add(import('@backstage/plugin-catalog-backend'));
backend.add(
  import('@backstage/plugin-catalog-backend-module-scaffolder-entity-model'),
);

// The content management provider under test.
backend.add(import('@ansible/plugin-catalog-backend-module-automation-content'));

// The content management API: discovery, documentation, requirements resolution.
backend.add(import('@ansible/plugin-automation-content-backend'));

backend.start();
