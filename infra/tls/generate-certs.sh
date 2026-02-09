#!/usr/bin/env bash
# generate-certs.sh - Generate self-signed CA and service certificates for AOS
# Generates separate certificates for PostgreSQL and Redis
# Usage: cd infra/tls && ./generate-certs.sh [output-dir]
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUTPUT_DIR="${1:-${SCRIPT_DIR}/certs}"
OPENSSL_CNF="${SCRIPT_DIR}/openssl.cnf"
DAYS_CA=3650
DAYS_CERT=365

echo "=== AOS TLS Certificate Generator ==="
echo "Output directory: ${OUTPUT_DIR}"

mkdir -p "${OUTPUT_DIR}"

# 1. Generate CA private key and certificate
echo ""
echo "--- Generating CA certificate ---"
openssl genrsa -out "${OUTPUT_DIR}/ca-key.pem" 4096

openssl req -new -x509 \
    -key "${OUTPUT_DIR}/ca-key.pem" \
    -sha256 \
    -days ${DAYS_CA} \
    -out "${OUTPUT_DIR}/ca-cert.pem" \
    -subj "/C=KR/ST=Seoul/L=Seoul/O=AOS/OU=CA/CN=AOS Root CA" \
    -extensions v3_ca \
    -config "${OPENSSL_CNF}"

echo "CA certificate generated."

# 2. Generate PostgreSQL server certificate
echo ""
echo "--- Generating PostgreSQL server certificate ---"
openssl genrsa -out "${OUTPUT_DIR}/postgres-key.pem" 2048

openssl req -new \
    -key "${OUTPUT_DIR}/postgres-key.pem" \
    -out "${OUTPUT_DIR}/postgres.csr" \
    -subj "/C=KR/ST=Seoul/L=Seoul/O=AOS/OU=Database/CN=aos-postgres" \
    -config "${OPENSSL_CNF}"

openssl x509 -req \
    -in "${OUTPUT_DIR}/postgres.csr" \
    -CA "${OUTPUT_DIR}/ca-cert.pem" \
    -CAkey "${OUTPUT_DIR}/ca-key.pem" \
    -CAcreateserial \
    -out "${OUTPUT_DIR}/postgres-cert.pem" \
    -days ${DAYS_CERT} \
    -sha256 \
    -extensions server_cert \
    -extfile "${OPENSSL_CNF}"

echo "PostgreSQL certificate generated."

# 3. Generate Redis server certificate
echo ""
echo "--- Generating Redis server certificate ---"
openssl genrsa -out "${OUTPUT_DIR}/redis-key.pem" 2048

openssl req -new \
    -key "${OUTPUT_DIR}/redis-key.pem" \
    -out "${OUTPUT_DIR}/redis.csr" \
    -subj "/C=KR/ST=Seoul/L=Seoul/O=AOS/OU=Cache/CN=aos-redis" \
    -config "${OPENSSL_CNF}"

openssl x509 -req \
    -in "${OUTPUT_DIR}/redis.csr" \
    -CA "${OUTPUT_DIR}/ca-cert.pem" \
    -CAkey "${OUTPUT_DIR}/ca-key.pem" \
    -CAcreateserial \
    -out "${OUTPUT_DIR}/redis-cert.pem" \
    -days ${DAYS_CERT} \
    -sha256 \
    -extensions server_cert \
    -extfile "${OPENSSL_CNF}"

echo "Redis certificate generated."

# 4. Clean up CSR files
rm -f "${OUTPUT_DIR}"/*.csr "${OUTPUT_DIR}"/*.srl

# 5. Set permissions
chmod 600 "${OUTPUT_DIR}"/*-key.pem
chmod 644 "${OUTPUT_DIR}"/*-cert.pem

echo ""
echo "=== Certificate generation complete ==="
echo ""
echo "Generated files:"
echo "  CA:         ${OUTPUT_DIR}/ca-key.pem, ca-cert.pem"
echo "  PostgreSQL: ${OUTPUT_DIR}/postgres-key.pem, postgres-cert.pem"
echo "  Redis:      ${OUTPUT_DIR}/redis-key.pem, redis-cert.pem"
echo ""
echo "To create a K8s secret:"
echo "  kubectl create secret generic aos-tls-certs \\"
echo "    --from-file=ca.crt=${OUTPUT_DIR}/ca-cert.pem \\"
echo "    --from-file=postgres.key=${OUTPUT_DIR}/postgres-key.pem \\"
echo "    --from-file=postgres.crt=${OUTPUT_DIR}/postgres-cert.pem \\"
echo "    --from-file=redis.key=${OUTPUT_DIR}/redis-key.pem \\"
echo "    --from-file=redis.crt=${OUTPUT_DIR}/redis-cert.pem \\"
echo "    -n aos"
