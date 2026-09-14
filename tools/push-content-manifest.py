#!/usr/bin/env python3
"""
Push an Ansible content manifest to an OCI registry as a referrer of an image.

This is the publish half of build-time content discovery. `content_manifest.py`
generates the manifest inside the execution environment during the build; this pushes
it alongside the image as a separate OCI artifact whose `subject` is the image
manifest.

The result is that a catalog can answer "what is inside this EE?" with roughly two HTTP
calls — get referrers, fetch one small blob — instead of pulling gigabytes of image and
running extraction it cannot do faithfully anyway.

In a real pipeline this belongs in CI or in ansible-builder itself. It is a standalone
script here so the end-to-end flow can be demonstrated without modifying the build tool.

No third-party dependencies: `oras` is not always available, and the OCI push flow is
small enough to implement directly.

Usage:
    push-content-manifest.py --registry localhost:5000 --repository ansible/network-ee \
        --tag poc --manifest content-manifest.json [--insecure] [--username U --password P]
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import json
import os
import ssl
import sys
import urllib.error
import urllib.parse
import urllib.request

ARTIFACT_TYPE = "application/vnd.ansible.content-manifest.v1+json"
LAYER_MEDIA_TYPE = "application/vnd.ansible.content-manifest.v1+json"
OCI_MANIFEST = "application/vnd.oci.image.manifest.v1+json"
OCI_INDEX = "application/vnd.oci.image.index.v1+json"
OCI_CONFIG = "application/vnd.oci.image.config.v1+json"
DOCKER_MANIFEST = "application/vnd.docker.distribution.manifest.v2+json"
DOCKER_MANIFEST_LIST = "application/vnd.docker.distribution.manifest.list.v2+json"

# An artifact with no meaningful config. OCI 1.1 defines
# application/vnd.oci.empty.v1+json for this, but registries predating 1.1 reject it —
# Quay validates config mediaType against a fixed allowlist. vnd.unknown.config.v1+json
# is the widely accepted escape hatch.
EMPTY_JSON = b"{}"
EMPTY_CONFIG_MEDIA_TYPE = "application/vnd.oci.empty.v1+json"
FALLBACK_CONFIG_MEDIA_TYPE = "application/vnd.unknown.config.v1+json"

# Standard OCI layer type, accepted everywhere. The Ansible-specific type travels on
# `artifactType` and in annotations instead of on the layer.
TAR_GZIP_MEDIA_TYPE = "application/vnd.oci.image.layer.v1.tar+gzip"


def tar_gz(files: dict[str, bytes]) -> bytes:
    """
    Package files into a gzipped tar, as ORAS does when pushing plain files.

    Byte-for-byte reproducible, which matters more than it looks: a blob's name in the
    registry *is* the hash of these bytes. If packing the same manifest twice produced
    different bytes, it would produce a different digest, the existence check before
    upload would always miss, and every publish would leave another orphaned copy of
    the same content in the registry.

    Two clocks have to be pinned to get that. `TarInfo.mtime` covers the tar entry, and
    `GzipFile(mtime=...)` covers the gzip header — the latter defaults to "now", so
    omitting it silently defeats the whole thing.
    """
    import gzip
    import io
    import tarfile

    tar_buffer = io.BytesIO()
    with tarfile.open(fileobj=tar_buffer, mode="w") as archive:
        for name, data in files.items():
            info = tarfile.TarInfo(name=name)
            info.size = len(data)
            info.mtime = 0
            archive.addfile(info, io.BytesIO(data))

    gz_buffer = io.BytesIO()
    with gzip.GzipFile(fileobj=gz_buffer, mode="wb", mtime=0) as compressor:
        compressor.write(tar_buffer.getvalue())
    return gz_buffer.getvalue()

MANIFEST_ACCEPT = ", ".join(
    [OCI_MANIFEST, OCI_INDEX, DOCKER_MANIFEST, DOCKER_MANIFEST_LIST])


def digest_of(data: bytes) -> str:
    return "sha256:" + hashlib.sha256(data).hexdigest()


class RegistryClient:
    def __init__(self, registry: str, insecure: bool = False,
                 username: str | None = None, password: str | None = None) -> None:
        self.registry = registry
        self.scheme = "http" if insecure else "https"
        self.username = username
        self.password = password
        self._token: str | None = None
        self._ctx = ssl.create_default_context()
        if insecure:
            self._ctx.check_hostname = False
            self._ctx.verify_mode = ssl.CERT_NONE

    def _basic(self) -> str | None:
        if not self.username:
            return None
        raw = f"{self.username}:{self.password or ''}".encode()
        return "Basic " + base64.b64encode(raw).decode()

    def _auth_header(self) -> str | None:
        if self._token:
            return f"Bearer {self._token}"
        return self._basic()

    def login(self, repository: str) -> bool:
        """
        Acquire a repository-scoped token before doing any real work.

        Necessary because registries are inconsistent about where they advertise the
        auth challenge. Quay returns 401 with a `WWW-Authenticate` header on `/v2/`,
        but a bare 401 with no challenge on repository paths — so a client that waits
        to be challenged on its first real request never learns where the token
        endpoint is. Priming from `/v2/` is what podman does, and it works everywhere.
        """
        try:
            self.request("GET", "/v2/", _retry=False)
            return True  # anonymous access is permitted
        except urllib.error.HTTPError as error:
            if error.code != 401:
                raise
            challenge = error.headers.get("www-authenticate", "")

        if not challenge:
            return False
        return self._handle_challenge(
            challenge, scope=f"repository:{repository}:pull,push")

    def _handle_challenge(self, challenge: str, scope: str | None = None) -> bool:
        """Satisfy a Bearer challenge via the token-exchange flow."""
        if not challenge.lower().startswith("bearer "):
            return False
        params: dict[str, str] = {}
        for part in challenge[7:].split(","):
            if "=" in part:
                key, _, value = part.partition("=")
                params[key.strip()] = value.strip().strip('"')
        realm = params.get("realm")
        if not realm:
            return False
        if scope:
            params["scope"] = scope

        query = {k: v for k, v in params.items() if k in ("service", "scope")}
        url = realm + ("?" + urllib.parse.urlencode(query) if query else "")
        request = urllib.request.Request(url, headers={"Accept": "application/json"})
        basic = self._basic()
        if basic:
            request.add_header("Authorization", basic)
        try:
            with urllib.request.urlopen(request, context=self._ctx, timeout=60) as res:
                body = json.load(res)
        except urllib.error.URLError:
            return False
        self._token = body.get("token") or body.get("access_token")
        return bool(self._token)

    def request(self, method: str, path: str, body: bytes | None = None,
                headers: dict[str, str] | None = None, _retry: bool = True):
        url = path if path.startswith("http") else f"{self.scheme}://{self.registry}{path}"
        request = urllib.request.Request(url, data=body, method=method)
        for key, value in (headers or {}).items():
            request.add_header(key, value)
        auth = self._auth_header()
        if auth:
            request.add_header("Authorization", auth)

        try:
            return urllib.request.urlopen(request, context=self._ctx, timeout=300)
        except urllib.error.HTTPError as error:
            if error.code == 401 and _retry:
                challenge = error.headers.get("www-authenticate", "")
                if challenge and self._handle_challenge(challenge):
                    return self.request(method, path, body, headers, _retry=False)
            raise

    # -- Distribution v2 operations ----------------------------------------

    def blob_exists(self, repository: str, digest: str) -> bool:
        try:
            self.request("HEAD", f"/v2/{repository}/blobs/{digest}")
            return True
        except urllib.error.HTTPError:
            return False

    def push_blob(self, repository: str, data: bytes) -> str:
        """Upload a blob using the two-step POST-then-PUT flow."""
        digest = digest_of(data)
        if self.blob_exists(repository, digest):
            return digest

        response = self.request("POST", f"/v2/{repository}/blobs/uploads/",
                                headers={"Content-Length": "0"})
        location = response.headers.get("location")
        if not location:
            raise RuntimeError("registry did not return an upload location")
        if location.startswith("/"):
            location = f"{self.scheme}://{self.registry}{location}"

        separator = "&" if "?" in location else "?"
        self.request("PUT", f"{location}{separator}digest={digest}", body=data,
                     headers={"Content-Type": "application/octet-stream",
                              "Content-Length": str(len(data))})
        return digest

    def resolve_digest(self, repository: str, reference: str) -> tuple[str, int, str]:
        """Return (digest, size, mediaType) for a tag or digest reference."""
        response = self.request("GET", f"/v2/{repository}/manifests/{reference}",
                                headers={"Accept": MANIFEST_ACCEPT})
        raw = response.read()
        digest = response.headers.get("docker-content-digest") or digest_of(raw)
        media_type = response.headers.get("content-type") or OCI_MANIFEST
        return digest, len(raw), media_type

    def put_manifest(self, repository: str, reference: str, manifest: dict,
                     media_type: str = OCI_MANIFEST) -> str:
        data = json.dumps(manifest, separators=(",", ":")).encode()
        digest = digest_of(data)
        self.request("PUT", f"/v2/{repository}/manifests/{reference}", body=data,
                     headers={"Content-Type": media_type,
                              "Content-Length": str(len(data))})
        return digest

    def get_manifest_json(self, repository: str, reference: str) -> dict | None:
        """Fetch a manifest, or None when absent. Used to merge into an existing index."""
        try:
            response = self.request("GET", f"/v2/{repository}/manifests/{reference}",
                                    headers={"Accept": MANIFEST_ACCEPT})
            return json.load(response)
        except (urllib.error.HTTPError, ValueError):
            return None

    def get_referrers(self, repository: str, digest: str) -> dict | None:
        try:
            response = self.request("GET", f"/v2/{repository}/referrers/{digest}",
                                    headers={"Accept": OCI_INDEX})
            return json.load(response)
        except urllib.error.HTTPError:
            return None


def push(args: argparse.Namespace) -> int:
    with open(args.manifest, "rb") as handle:
        payload = handle.read()

    try:
        content = json.loads(payload)
    except ValueError as exc:
        print(f"Manifest is not valid JSON: {exc}", file=sys.stderr)
        return 1

    client = RegistryClient(args.registry, args.insecure, args.username, args.password)

    print(f"Authenticating to {args.registry} ...")
    if not client.login(args.repository):
        print("  warning: could not obtain a token; continuing unauthenticated",
              file=sys.stderr)

    print(f"Resolving {args.repository}:{args.tag} ...")
    try:
        subject_digest, subject_size, subject_media = client.resolve_digest(
            args.repository, args.tag)
    except urllib.error.HTTPError as error:
        print(f"Cannot resolve subject image: HTTP {error.code} {error.reason}",
              file=sys.stderr)
        return 1
    print(f"  subject digest: {subject_digest}")

    # Package as a gzipped tar, the same convention ORAS uses for files.
    #
    # Not cosmetic: registries vary in how strictly they police media types. Quay
    # validates both the config and layer mediaType against a fixed allowlist and
    # rejects custom artifact types outright — including
    # application/vnd.ansible.content-manifest.v1+json as a layer and
    # application/vnd.oci.empty.v1+json as a config. Standard OCI layer types are
    # accepted everywhere, so the payload travels as a normal layer and the Ansible
    # artifact type is carried on `artifactType` and in annotations instead.
    blob = tar_gz({"content-manifest.json": payload})

    print("Uploading manifest blob ...")
    layer_digest = client.push_blob(args.repository, blob)
    config_digest = client.push_blob(args.repository, EMPTY_JSON)
    print(f"  layer:  {layer_digest} "
          f"({len(blob)} bytes gzipped, {len(payload)} raw)")

    collections = content.get("collections", [])
    generated_by = content.get("generatedBy", {})
    annotations = {
        "org.opencontainers.image.created": content.get("generatedAt", ""),
        "org.opencontainers.artifact.description":
            "Ansible content manifest: collections, plugins, roles, EDA plugins",
        "io.ansible.content.collections.count": str(len(collections)),
        "io.ansible.content.manifest.schema": content.get("schemaVersion", ""),
    }
    if generated_by.get("ansibleCore"):
        annotations["io.ansible.content.ansible_core"] = generated_by["ansibleCore"]

    annotations["io.ansible.content.manifest.artifact_type"] = ARTIFACT_TYPE

    referrer = {
        "schemaVersion": 2,
        "mediaType": OCI_MANIFEST,
        "artifactType": ARTIFACT_TYPE,
        "config": {
            "mediaType": FALLBACK_CONFIG_MEDIA_TYPE,
            "digest": config_digest,
            "size": len(EMPTY_JSON),
        },
        "layers": [{
            "mediaType": TAR_GZIP_MEDIA_TYPE,
            "digest": layer_digest,
            "size": len(blob),
            "annotations": {
                "org.opencontainers.image.title": "content-manifest.json",
                "io.ansible.content.manifest.media_type": LAYER_MEDIA_TYPE,
            },
        }],
        # The link that makes this discoverable from the image.
        "subject": {
            "mediaType": subject_media,
            "digest": subject_digest,
            "size": subject_size,
        },
        "annotations": annotations,
    }

    referrer_bytes = json.dumps(referrer, separators=(",", ":")).encode()
    referrer_digest = digest_of(referrer_bytes)

    print(f"Pushing referrer manifest {referrer_digest} ...")
    try:
        client.put_manifest(args.repository, referrer_digest, referrer)
    except urllib.error.HTTPError as error:
        if error.code != 400:
            raise
        detail = error.read().decode()[:160]
        print(f"  registry rejected the OCI 1.1 manifest ({detail})")
        print("  retrying without `subject`; discovery will rely on the tag fallback")
        referrer.pop("subject", None)
        referrer_bytes = json.dumps(referrer, separators=(",", ":")).encode()
        referrer_digest = digest_of(referrer_bytes)
        client.put_manifest(args.repository, referrer_digest, referrer)

    # Publish the fallback tag the spec defines for registries without a referrers
    # endpoint: sha256:abc… becomes sha256-abc…, and that tag holds an image *index*
    # listing referrer descriptors — not the referrer manifest itself. Getting this
    # wrong is easy and silently breaks discovery on exactly the registries that need
    # the fallback.
    fallback_tag = args.reference or subject_digest.replace(":", "-")
    descriptor = {
        "mediaType": OCI_MANIFEST,
        "digest": referrer_digest,
        "size": len(referrer_bytes),
        "artifactType": ARTIFACT_TYPE,
        "annotations": annotations,
        # The OCI image index spec makes `platform` optional, but Quay validates
        # against the Docker manifest-list schema, where it is required. The
        # conventional placeholder for a non-image artifact is unknown/unknown.
        "platform": {"architecture": "unknown", "os": "unknown"},
    }

    existing = client.get_manifest_json(args.repository, fallback_tag)
    manifests = []
    if existing and existing.get("manifests"):
        # Preserve other referrers; replace any previous content manifest.
        manifests = [m for m in existing["manifests"]
                     if m.get("artifactType") != ARTIFACT_TYPE]
    manifests.append(descriptor)

    index = {
        "schemaVersion": 2,
        "mediaType": OCI_INDEX,
        "manifests": manifests,
    }
    print(f"Publishing fallback index at {fallback_tag} "
          f"({len(manifests)} referrer(s)) ...")
    client.put_manifest(args.repository, fallback_tag, index, media_type=OCI_INDEX)

    print("Verifying discoverability ...")
    index = client.get_referrers(args.repository, subject_digest)
    if index and index.get("manifests"):
        matching = [m for m in index["manifests"]
                    if m.get("artifactType") == ARTIFACT_TYPE]
        print(f"  referrers API: {len(index['manifests'])} referrer(s), "
              f"{len(matching)} content manifest(s)")
    else:
        print("  referrers API unavailable; consumers will use the "
              f"{fallback_tag} tag fallback")

    print("\nDone. A consumer can now read the content manifest without pulling the "
          "image.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="push-content-manifest.py",
        description="Push an Ansible content manifest as an OCI referrer of an image.")
    parser.add_argument("--registry", required=True, help="host[:port]")
    parser.add_argument("--repository", required=True, help="e.g. ansible/network-ee")
    parser.add_argument("--tag", required=True, help="Tag or digest of the subject image")
    parser.add_argument("--manifest", required=True, help="Path to content-manifest.json")
    parser.add_argument("--reference",
                        help="Tag to store the referrer under (default: the "
                             "sha256-<digest> fallback tag)")
    parser.add_argument("--insecure", action="store_true", help="Use plain HTTP")
    parser.add_argument("--username", default=os.environ.get("REGISTRY_USERNAME"))
    parser.add_argument("--password", default=os.environ.get("REGISTRY_PASSWORD"))
    return push(parser.parse_args(argv))


if __name__ == "__main__":
    sys.exit(main())
