/** Diagnostic: run a sample emitted entity through Backstage's own entity validation. */
import { componentEntityV1alpha1Validator } from '@backstage/catalog-model';

const ee = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'local-quay-demo-network-ee-05abb921da03',
    title: 'demo/network-ee:poc',
    description: 'Execution environment with 5 collections',
    annotations: {
      'ansible.com/registry': 'local-quay',
      'ansible.com/repository': 'demo/network-ee',
      'ansible.com/digest': 'sha256:05abb921',
      'ansible.com/tags': 'poc',
      'ansible.com/enumeration-source': 'build-time-manifest',
    },
    tags: ['execution-environment'],
    links: [{ url: 'http://127.0.0.1:8080/demo/network-ee', title: 'Registry' }],
  },
  spec: {
    type: 'execution-environment',
    lifecycle: 'production',
    owner: 'group:default/ansible',
    dependsOn: ['component:default/collection-cisco-ios-11.5.1'],
  },
};

const collection = {
  apiVersion: 'backstage.io/v1alpha1',
  kind: 'Component',
  metadata: {
    name: 'collection-cisco-ios-11.5.1',
    title: 'cisco.ios 11.5.1',
    description: 'Ansible collection',
    annotations: { 'ansible.com/collection': 'cisco.ios' },
    tags: ['ansible-collection'],
  },
  spec: {
    type: 'ansible-collection',
    lifecycle: 'production',
    owner: 'group:default/ansible',
    partOf: ['component:default/local-quay-demo-network-ee-05abb921da03'],
  },
};

for (const [label, entity] of [['execution environment', ee], ['collection', collection]]) {
  try {
    const ok = await componentEntityV1alpha1Validator.check(entity);
    console.log(`${label}: ${ok ? 'VALID' : 'not a Component'}`);
  } catch (err) {
    console.log(`${label}: INVALID -> ${err.message}`);
  }
}
