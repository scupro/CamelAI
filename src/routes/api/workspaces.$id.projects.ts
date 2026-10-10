import type { Route } from './+types/workspaces.$id.projects';
import { getEnv } from '@/lib/cloudflare.server';
import { loadWorkspaceMentionProjects } from '@/lib/mention-sources.server';
import { requireWorkspaceAccess } from './workspaces.utils';

export async function loader({ request, context, params }: Route.LoaderArgs) {
  try {
    const workspaceId = params.id;
    if (!workspaceId) {
      return Response.json({ error: 'Workspace ID required' }, { status: 400 });
    }

    await requireWorkspaceAccess(request, context, workspaceId);

    const projects = await loadWorkspaceMentionProjects(
      getEnv(context),
      workspaceId,
    );

    return Response.json(
      { projects },
      { headers: { 'Cache-Control': 'private, no-store' } },
    );
  } catch (error) {
    if (error instanceof Response) {
      return error;
    }
    console.error('Failed to load workspace projects:', error);
    return Response.json(
      { error: 'Failed to load workspace projects' },
      { status: 500 },
    );
  }
}
