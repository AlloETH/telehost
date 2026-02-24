import postgres from "postgres";

/**
 * Add a persistent volume to a Coolify application.
 *
 * The Coolify API does not expose volume management endpoints (GitHub #4084),
 * so we insert directly into Coolify's PostgreSQL database. When Coolify
 * deploys a Docker Image app it reads from `local_persistent_volumes` and
 * includes the mounts in the generated docker-compose.yml.
 *
 * Requires `COOLIFY_DB_URL` env var. Skips silently if not configured.
 */
export async function addPersistentVolume(opts: {
  appId: number;
  appUuid: string;
  mountPath: string;
}): Promise<void> {
  const dbUrl = process.env.COOLIFY_DB_URL;
  if (!dbUrl) {
    console.warn(
      "[coolify] COOLIFY_DB_URL not set - skipping persistent volume setup. " +
        "Set it to your Coolify PostgreSQL connection string to enable persistent /data.",
    );
    return;
  }

  const volumeName = `${opts.appUuid}-data`;
  const resourceType = "App\\Models\\Application";

  const sql = postgres(dbUrl, { max: 1 });
  try {
    // Check if volume already exists for this mount path
    const existing = await sql`
      SELECT id FROM local_persistent_volumes
      WHERE resource_id = ${opts.appId}
        AND resource_type = ${resourceType}
        AND mount_path = ${opts.mountPath}
      LIMIT 1
    `;

    if (existing.length > 0) return;

    await sql`
      INSERT INTO local_persistent_volumes
        (name, mount_path, host_path, resource_id, resource_type, created_at, updated_at)
      VALUES
        (${volumeName}, ${opts.mountPath}, NULL, ${opts.appId}, ${resourceType}, NOW(), NOW())
    `;
  } finally {
    await sql.end();
  }
}
