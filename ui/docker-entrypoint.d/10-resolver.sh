#!/bin/sh
# Detect the container's DNS resolver (Docker embedded DNS or podman aardvark-dns)
# and write it into resolver.conf, which nginx.conf includes for runtime
# re-resolution of the fhir upstream.
set -e
ns=$(awk '/^nameserver/ { print $2; exit }' /etc/resolv.conf 2>/dev/null || true)
[ -z "$ns" ] && ns=127.0.0.11
printf 'resolver %s valid=10s ipv6=off;\n' "$ns" > /etc/nginx/resolver.conf
echo "[nginx] using DNS resolver $ns"
