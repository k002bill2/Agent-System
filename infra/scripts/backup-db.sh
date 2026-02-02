#!/bin/bash
# Database Backup Script
# Usage: ./backup-db.sh [options]
#
# Options:
#   -h, --help              Show this help message
#   -o, --output DIR        Output directory (default: ./backups)
#   -r, --retention DAYS    Retention period in days (default: 30)
#   --s3 BUCKET             Upload to S3 bucket
#   --gcs BUCKET            Upload to GCS bucket
#   --verify                Verify backup after creation
#
# Environment variables:
#   DATABASE_URL            PostgreSQL connection string
#   DATABASE_HOST           Database host (alternative to DATABASE_URL)
#   DATABASE_PORT           Database port (default: 5432)
#   DATABASE_USER           Database user
#   DATABASE_PASSWORD       Database password
#   DATABASE_NAME           Database name

set -euo pipefail

# Default values
OUTPUT_DIR="./backups"
RETENTION_DAYS=30
S3_BUCKET=""
GCS_BUCKET=""
VERIFY=false

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

show_help() {
    head -25 "$0" | tail -22 | sed 's/^# //' | sed 's/^#//'
    exit 0
}

# Parse arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -h|--help)
            show_help
            ;;
        -o|--output)
            OUTPUT_DIR="$2"
            shift 2
            ;;
        -r|--retention)
            RETENTION_DAYS="$2"
            shift 2
            ;;
        --s3)
            S3_BUCKET="$2"
            shift 2
            ;;
        --gcs)
            GCS_BUCKET="$2"
            shift 2
            ;;
        --verify)
            VERIFY=true
            shift
            ;;
        *)
            log_error "Unknown option: $1"
            show_help
            ;;
    esac
done

# Parse DATABASE_URL if provided
if [[ -n "${DATABASE_URL:-}" ]]; then
    # Format: postgresql+asyncpg://user:pass@host:port/dbname
    # or postgresql://user:pass@host:port/dbname
    PARSED_URL=$(echo "$DATABASE_URL" | sed 's/postgresql+asyncpg/postgresql/' | sed 's/postgresql:\/\///')
    DATABASE_USER=$(echo "$PARSED_URL" | cut -d':' -f1)
    DATABASE_PASSWORD=$(echo "$PARSED_URL" | cut -d':' -f2 | cut -d'@' -f1)
    DATABASE_HOST=$(echo "$PARSED_URL" | cut -d'@' -f2 | cut -d':' -f1)
    DATABASE_PORT=$(echo "$PARSED_URL" | cut -d':' -f3 | cut -d'/' -f1)
    DATABASE_NAME=$(echo "$PARSED_URL" | cut -d'/' -f2)
fi

# Validate required variables
DATABASE_HOST="${DATABASE_HOST:-localhost}"
DATABASE_PORT="${DATABASE_PORT:-5432}"
DATABASE_USER="${DATABASE_USER:-}"
DATABASE_PASSWORD="${DATABASE_PASSWORD:-}"
DATABASE_NAME="${DATABASE_NAME:-}"

if [[ -z "$DATABASE_USER" ]] || [[ -z "$DATABASE_NAME" ]]; then
    log_error "Database connection info not provided."
    log_error "Set DATABASE_URL or individual variables (DATABASE_HOST, DATABASE_USER, etc.)"
    exit 1
fi

# Create output directory
mkdir -p "$OUTPUT_DIR"

# Generate backup filename
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="${OUTPUT_DIR}/aos_backup_${TIMESTAMP}.sql.gz"

log_info "Starting database backup..."
log_info "Host: $DATABASE_HOST:$DATABASE_PORT"
log_info "Database: $DATABASE_NAME"
log_info "Output: $BACKUP_FILE"

# Create backup
export PGPASSWORD="$DATABASE_PASSWORD"

pg_dump \
    --host="$DATABASE_HOST" \
    --port="$DATABASE_PORT" \
    --username="$DATABASE_USER" \
    --dbname="$DATABASE_NAME" \
    --format=plain \
    --no-owner \
    --no-acl \
    | gzip > "$BACKUP_FILE"

unset PGPASSWORD

BACKUP_SIZE=$(du -h "$BACKUP_FILE" | cut -f1)
log_info "Backup created: $BACKUP_FILE ($BACKUP_SIZE)"

# Verify backup
if [[ "$VERIFY" == true ]]; then
    log_info "Verifying backup integrity..."
    if gunzip -t "$BACKUP_FILE" 2>/dev/null; then
        log_info "Backup verification: OK"
    else
        log_error "Backup verification: FAILED"
        exit 1
    fi
fi

# Upload to S3
if [[ -n "$S3_BUCKET" ]]; then
    log_info "Uploading to S3: s3://$S3_BUCKET/backups/"
    aws s3 cp "$BACKUP_FILE" "s3://$S3_BUCKET/backups/$(basename "$BACKUP_FILE")"
    log_info "S3 upload complete"
fi

# Upload to GCS
if [[ -n "$GCS_BUCKET" ]]; then
    log_info "Uploading to GCS: gs://$GCS_BUCKET/backups/"
    gcloud storage cp "$BACKUP_FILE" "gs://$GCS_BUCKET/backups/$(basename "$BACKUP_FILE")"
    log_info "GCS upload complete"
fi

# Cleanup old backups
log_info "Cleaning up backups older than $RETENTION_DAYS days..."

find "$OUTPUT_DIR" -name "aos_backup_*.sql.gz" -type f -mtime +"$RETENTION_DAYS" -print -delete 2>/dev/null | while read -r file; do
    log_info "Deleted old backup: $file"
done

# Cleanup old S3 backups
if [[ -n "$S3_BUCKET" ]]; then
    CUTOFF_DATE=$(date -d "-$RETENTION_DAYS days" +%Y%m%d 2>/dev/null || date -v-${RETENTION_DAYS}d +%Y%m%d)

    aws s3 ls "s3://$S3_BUCKET/backups/" 2>/dev/null | while read -r line; do
        FILE_NAME=$(echo "$line" | awk '{print $4}')
        FILE_DATE=$(echo "$FILE_NAME" | grep -oP '\d{8}' | head -1 || echo "")

        if [[ -n "$FILE_DATE" ]] && [[ "$FILE_DATE" < "$CUTOFF_DATE" ]]; then
            log_info "Deleting old S3 backup: $FILE_NAME"
            aws s3 rm "s3://$S3_BUCKET/backups/$FILE_NAME"
        fi
    done
fi

log_info "Backup completed successfully!"
echo ""
echo "Summary:"
echo "  - File: $BACKUP_FILE"
echo "  - Size: $BACKUP_SIZE"
echo "  - Timestamp: $TIMESTAMP"
