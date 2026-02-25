import { getCoolifyClient } from "./client";

/**
 * Add a persistent volume to a Coolify application via custom_docker_run_options.
 *
 * Uses the `--volume` flag in Docker run options, which Coolify applies when
 * deploying Docker Image applications. This avoids needing direct DB access.
 */
export async function addPersistentVolume(opts: {
  appUuid: string;
  mountPath: string;
}): Promise<void> {
  const volumeName = `${opts.appUuid}-data`;
  const volumeFlag = `--volume ${volumeName}:${opts.mountPath}`;

  const coolify = getCoolifyClient();
  const app = await coolify.getApplication(opts.appUuid);

  // Check if volume is already configured
  const existing = (app.custom_docker_run_options as string) || "";
  if (existing.includes(volumeFlag) || existing.includes(`${volumeName}:`)) {
    return;
  }

  const newOptions = existing ? `${existing} ${volumeFlag}` : volumeFlag;
  await coolify.updateApplication(opts.appUuid, {
    custom_docker_run_options: newOptions,
  });
}
