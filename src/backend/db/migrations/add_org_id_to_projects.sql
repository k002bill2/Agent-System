-- Add organization_id to projects table
ALTER TABLE projects
ADD COLUMN IF NOT EXISTS organization_id VARCHAR(36);

CREATE INDEX IF NOT EXISTS ix_projects_organization_id
ON projects(organization_id);
