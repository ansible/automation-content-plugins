#!/usr/bin/env python3
"""
Trace every HTTP call the content-manifest publisher makes.

Wraps RegistryClient.request so the full push conversation with the registry is
visible, with method, path, status and body size.

Usage:
    python3 tools/trace-push.py <registry> <repository> <tag> <manifest.json>
"""
import importlib.util
import os
import sys
import time
import urllib.error

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location(
    "pcm", os.path.join(HERE, "push-content-manifest.py"))
pcm = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pcm)

step = {"n": 0}
original_request = pcm.RegistryClient.request


def traced(self, method, path, body=None, headers=None, _retry=True):
    step["n"] += 1
    n = step["n"]
    shown = path if len(path) < 78 else path[:75] + "..."
    size = f" body={len(body):,}B" if body else ""
    started = time.time()
    try:
        response = original_request(self, method, path, body, headers, _retry)
        ms = (time.time() - started) * 1000
        print(f"  {n:>2}. {method:<5} {shown}")
        print(f"      -> {response.status}{size}  {ms:.0f} ms")
        return response
    except urllib.error.HTTPError as error:
        ms = (time.time() - started) * 1000
        print(f"  {n:>2}. {method:<5} {shown}")
        print(f"      -> {error.code} {error.reason}{size}  {ms:.0f} ms")
        raise


pcm.RegistryClient.request = traced

registry, repository, tag, manifest = sys.argv[1:5]
print(f"\nPublishing {manifest} as a referrer of {repository}:{tag}\n")

sys.exit(pcm.main([
    "--registry", registry,
    "--repository", repository,
    "--tag", tag,
    "--manifest", manifest,
    "--insecure",
    "--username", os.environ.get("REGISTRY_USERNAME", ""),
    "--password", os.environ.get("REGISTRY_PASSWORD", ""),
]))
